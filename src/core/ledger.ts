import SpeculosHttpTransport from "@ledgerhq/hw-transport-node-speculos-http";
import AppEth from "@ledgerhq/hw-app-eth";
import type { Express, Request, Response } from "express";
import * as readline from "node:readline";
import { hashMessage, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "../utils/logger.js";
import { appConfig } from "../utils/config.js";
import type { LedgerProof } from "../types/index.js";

// ─── Constants ──────────────────────────────────────────────────────────────
const BIP32_PATH = "44'/60'/0'/0/0";
const APPROVAL_TIMEOUT_MS = 120_000;

// ─── Types ──────────────────────────────────────────────────────────────────

type ApprovalResult = { decision: "approved" | "rejected"; proof?: LedgerProof };

interface PendingApproval {
  id: string;
  details: { amount: string; recipient: string; service: string };
  resolve: (value: ApprovalResult) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

export interface LedgerBridge {
  requestApproval(details: {
    amount: string;
    recipient: string;
    service: string;
  }): Promise<{ decision: "approved" | "rejected"; proof?: LedgerProof }>;
}

// ─── LedgerEmulator ─────────────────────────────────────────────────────────

export class LedgerEmulator implements LedgerBridge {
  private transport: InstanceType<typeof SpeculosHttpTransport> | null = null;
  private eth: InstanceType<typeof AppEth> | null = null;
  private speculosConnected = false;
  private pendingApproval: PendingApproval | null = null;
  private ledgerAddress: string | null = null;

  // ── Init / Disconnect ───────────────────────────────────────────────────

  async init(): Promise<void> {
    if (appConfig.ledgerMode === "speculos") {
      try {
        this.transport = await SpeculosHttpTransport.open({
          baseURL: appConfig.speculosHost,
          apiPort: appConfig.speculosApiPort,
        });
        this.eth = new AppEth(this.transport);

        const { address } = await this.eth.getAddress(BIP32_PATH);
        this.ledgerAddress = address;
        this.speculosConnected = true;
        logger.ledger(`Connected to Speculos — address: ${address}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.ledger(`Speculos unavailable (${msg}) — running without signatures`);
      }
    } else {
      logger.ledger("Terminal mode — approval via readline");
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.eth = null;
      this.speculosConnected = false;
      logger.ledger("Disconnected from Speculos");
    }
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  getAddress(): string | null {
    return this.ledgerAddress;
  }

  isConnected(): boolean {
    return this.speculosConnected;
  }

  getPending(): {
    id: string;
    details: { amount: string; recipient: string; service: string };
    timestamp: number;
  } | null {
    if (!this.pendingApproval) return null;
    return {
      id: this.pendingApproval.id,
      details: this.pendingApproval.details,
      timestamp: this.pendingApproval.timestamp,
    };
  }

  // ── LedgerBridge interface ──────────────────────────────────────────────

  async requestApproval(details: {
    amount: string;
    recipient: string;
    service: string;
  }): Promise<ApprovalResult> {
    logger.ledger(`Approval requested: $${details.amount} → ${details.recipient}`);

    if (appConfig.ledgerMode === "terminal") {
      return this.requestApprovalTerminal(details);
    }
    return this.requestApprovalWeb(details);
  }

  // ── Terminal mode ───────────────────────────────────────────────────────

  private requestApprovalTerminal(details: {
    amount: string;
    recipient: string;
    service: string;
  }): Promise<ApprovalResult> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log("\n┌──────────────── LEDGER APPROVAL ────────────────┐");
      console.log(`│  Amount:    $${details.amount} USDC`);
      console.log(`│  To:        ${details.recipient}`);
      console.log(`│  Service:   ${details.service}`);
      console.log("└─────────────────────────────────────────────────┘");

      rl.question("  Approve? [y/n] → ", (answer) => {
        rl.close();
        const approved = answer.trim().toLowerCase() === "y";
        logger.ledger(approved ? "Terminal: APPROVED" : "Terminal: REJECTED");
        resolve(approved ? { decision: "approved" } : { decision: "rejected" });
      });
    });
  }

  // ── Web/dashboard mode ──────────────────────────────────────────────────

  private requestApprovalWeb(details: {
    amount: string;
    recipient: string;
    service: string;
  }): Promise<ApprovalResult> {
    if (this.pendingApproval) {
      logger.ledger("Another approval already pending — auto-rejecting");
      return Promise.resolve({ decision: "rejected" });
    }

    return new Promise<ApprovalResult>((resolve) => {
      const id = crypto.randomUUID();

      const timeout = setTimeout(() => {
        if (this.pendingApproval?.id === id) {
          logger.ledger(`Auto-rejected: timeout (${APPROVAL_TIMEOUT_MS / 1000}s)`);
          this.pendingApproval = null;
          resolve({ decision: "rejected" });
        }
      }, APPROVAL_TIMEOUT_MS);

      this.pendingApproval = { id, details, resolve, timeout, timestamp: Date.now() };

      logger.ledger(`Pending approval ${id.slice(0, 8)} — open dashboard to approve/reject`);
    });
  }

  // ── Dashboard actions ───────────────────────────────────────────────────

  async approve(): Promise<{ proof?: LedgerProof }> {
    if (!this.pendingApproval) throw new Error("No pending approval");

    const { details, resolve, timeout, id } = this.pendingApproval;
    clearTimeout(timeout);

    const message = [
      "SecretPay Approval",
      `Amount: ${details.amount} USDC`,
      `To: ${details.recipient}`,
      `Service: ${details.service}`,
      `ID: ${id}`,
    ].join("\n");

    let proof: LedgerProof | undefined;

    // Try 1: Sign via Speculos hardware emulator
    if (this.eth && this.speculosConnected) {
      try {
        const messageHex = Buffer.from(message).toString("hex");
        logger.ledger("Signing via Speculos...");

        const signPromise = this.eth.signPersonalMessage(BIP32_PATH, messageHex);
        const buttonPromise = this.navigateAndConfirm();
        const [sig] = await Promise.all([signPromise, buttonPromise]);

        const sigHex = `0x${sig.r}${sig.s}${sig.v.toString(16)}` as `0x${string}`;
        const recovered = await recoverAddress({
          hash: hashMessage(message),
          signature: sigHex,
        });

        proof = { message, signature: sig, signerAddress: recovered };

        const matches = recovered.toLowerCase() === this.ledgerAddress?.toLowerCase();
        logger.ledger(`Signed — v=${sig.v} r=${sig.r.slice(0, 10)}... s=${sig.s.slice(0, 10)}...`);
        logger.ledger(`Signer: ${recovered} ${matches ? "= MATCHES Ledger address" : "!= MISMATCH"}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Speculos signing failed: ${msg}`);
      }
    }

    // Try 2: Software signing fallback (if Speculos is not connected or failed)
    if (!proof) {
      try {
        const signingKey = appConfig.backupBurnerPrivateKey ?? ("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`);
        const account = privateKeyToAccount(signingKey);
        const signature = await account.signMessage({ message });

        // Parse v, r, s from the 65-byte signature
        const r = signature.slice(0, 66);                         // 0x + 64 hex chars
        const s = `0x${signature.slice(66, 130)}`;
        const v = parseInt(signature.slice(130, 132), 16);

        const recovered = await recoverAddress({
          hash: hashMessage(message),
          signature,
        });

        proof = {
          message,
          signature: { v, r, s },
          signerAddress: recovered,
        };
        logger.ledger(`Software-signed proof — signer: ${recovered.slice(0, 10)}...`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Software signing fallback also failed: ${msg}`);
      }
    }

    this.pendingApproval = null;
    resolve({ decision: "approved", proof });
    logger.ledger("Operator APPROVED the payment");
    return { proof };
  }

  async reject(): Promise<void> {
    if (!this.pendingApproval) throw new Error("No pending approval");

    const { resolve, timeout } = this.pendingApproval;
    clearTimeout(timeout);
    this.pendingApproval = null;
    resolve({ decision: "rejected" });
    logger.ledger("Operator REJECTED the payment");
  }

  // ── Speculos button control ─────────────────────────────────────────────

  private async pressButton(button: "left" | "right" | "both"): Promise<void> {
    await fetch(`${appConfig.speculosApiUrl}/button/${button}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "press-and-release" }),
    });
  }

  private async getScreenText(): Promise<string> {
    try {
      const res = await fetch(`${appConfig.speculosApiUrl}/events?currentscreenonly=true`);
      const data = (await res.json()) as { events: Array<{ text: string }> };
      return data.events.map((e) => e.text).join(" ");
    } catch {
      return "";
    }
  }

  /**
   * Navigate Speculos screens and confirm the signing operation.
   * Reads screen text to detect the "Sign message" confirmation screen,
   * then presses both buttons (= physical confirm on a real Ledger).
   */
  private async navigateAndConfirm(): Promise<void> {
    // Wait for Speculos to process the APDU and render the first screen
    await sleep(1500);

    for (let i = 0; i < 25; i++) {
      const text = (await this.getScreenText()).toLowerCase();
      logger.ledger(`Speculos screen ${i}: "${text.trim()}"`);

      // Confirmation screen — press both buttons to confirm
      // Ethereum app shows: "Sign message", "Accept and send", "Approve"
      if (
        text.includes("sign message") ||
        text.includes("accept") ||
        text.includes("approve") ||
        (text.includes("sign") && !text.includes("review"))
      ) {
        await sleep(300);
        await this.pressButton("both");
        logger.ledger(`Speculos: confirmed on screen ${i} "${text.trim()}"`);
        return;
      }

      // Press right to scroll to the next screen
      await this.pressButton("right");
      await sleep(500);
    }

    // Fallback after 25 screens — try confirming anyway
    logger.ledger("Speculos: max screens reached — pressing both buttons as fallback");
    await this.pressButton("both");
  }

  // ── Express routes (mounted on the gateway server) ──────────────────────

  mountRoutes(app: Express): void {
    app.get("/ledger/pending", (_req: Request, res: Response) => {
      res.json({ pending: this.getPending() });
    });

    app.post("/ledger/approve", async (_req: Request, res: Response) => {
      try {
        const result = await this.approve();
        res.json({ status: "approved", proof: result.proof ?? null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: msg });
      }
    });

    app.post("/ledger/reject", async (_req: Request, res: Response) => {
      try {
        await this.reject();
        res.json({ status: "rejected" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: msg });
      }
    });

    app.get("/ledger/status", (_req: Request, res: Response) => {
      res.json({
        connected: this.speculosConnected,
        address: this.ledgerAddress,
        mode: appConfig.ledgerMode,
        hasPending: this.pendingApproval !== null,
      });
    });

    logger.ledger("Routes mounted: /ledger/{pending,approve,reject,status}");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const ledgerEmulator = new LedgerEmulator();
