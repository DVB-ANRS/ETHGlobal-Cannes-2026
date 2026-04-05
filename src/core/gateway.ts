import { logger } from "../utils/logger.js";
import { privateKeyToAccount } from "viem/accounts";
import { appConfig } from "../utils/config.js";
import type {
  AgentRequest,
  AgentResponse,
  LedgerProof,
  PaymentRecord,
  PolicyDecision,
} from "../types/index.js";

// ─── Stub interfaces for modules not yet implemented ───────────────────
// These will be replaced by real imports once @privacy, @payment, @trust push their code.

interface PrivacyRouter {
  withdrawToBurner(amount: string): Promise<{ address: string; privateKey: `0x${string}` }>;
  getBalance(): Promise<string>;
}

interface PolicyEngine {
  evaluate(amount: number, recipient: string): PolicyDecision;
  recordSpending(amount: number): void;
}

interface LedgerBridge {
  requestApproval(details: { amount: string; recipient: string; service: string }): Promise<{ decision: "approved" | "rejected"; proof?: LedgerProof }>;
}

interface PaymentModule {
  createPaymentFetch(burnerPrivateKey: `0x${string}`): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

// ─── Stubs (demo-safe fallbacks) ───────────────────────────────────────

const stubPrivacy: PrivacyRouter = {
  async withdrawToBurner(amount: string) {
    logger.privacy(`[STUB] Would withdraw ${amount} USDC to a burner wallet`);
    return { address: "0xSTUB_BURNER", privateKey: "0xdead" as `0x${string}` };
  },
  async getBalance() {
    logger.privacy("[STUB] Returning fake balance");
    return "0.00";
  },
};

const stubPolicy: PolicyEngine = {
  _dailySpent: 0,
  _lastReset: new Date().toDateString(),
  evaluate(amount: number, recipient: string): PolicyDecision {
    const today = new Date().toDateString();
    if (this._lastReset !== today) {
      this._dailySpent = 0;
      this._lastReset = today;
    }
    const blacklist = ["0xBLACKLISTED0000000000000000000000000000"];
    if (blacklist.includes(recipient)) return "denied";
    if (amount > 100) return "denied";
    if (this._dailySpent + amount > 50) return "ledger";
    if (amount >= 1) return "ledger";
    return "auto";
  },
  recordSpending(amount: number) {
    this._dailySpent += amount;
  },
} as PolicyEngine & { _dailySpent: number; _lastReset: string };

const stubLedger: LedgerBridge = {
  async requestApproval(details) {
    logger.ledger(`[STUB] Ledger approval requested: $${details.amount} → ${details.recipient}`);
    return { decision: "approved" };
  },
};

const stubPayment: PaymentModule = {
  createPaymentFetch(_burnerPrivateKey) {
    logger.payment("[STUB] Returning plain fetch (no x402 payment)");
    return globalThis.fetch;
  },
};

// ─── Gateway class ─────────────────────────────────────────────────────

export class Gateway {
  private paymentHistory: PaymentRecord[] = [];
  private privacy: PrivacyRouter;
  private policy: PolicyEngine;
  private ledger: LedgerBridge;
  private payment: PaymentModule;

  constructor(deps?: {
    privacy?: PrivacyRouter;
    policy?: PolicyEngine;
    ledger?: LedgerBridge;
    payment?: PaymentModule;
  }) {
    this.privacy = deps?.privacy ?? stubPrivacy;
    this.policy = deps?.policy ?? stubPolicy;
    this.ledger = deps?.ledger ?? stubLedger;
    this.payment = deps?.payment ?? stubPayment;
  }

  /** Inject real modules once they are ready */
  setPrivacy(p: PrivacyRouter) { this.privacy = p; }
  setPolicy(p: PolicyEngine) { this.policy = p; }
  setLedger(l: LedgerBridge) { this.ledger = l; }
  setPayment(p: PaymentModule) { this.payment = p; }

  getHistory(agentId?: string): PaymentRecord[] {
    if (agentId) return this.paymentHistory.filter((r) => r.agentId === agentId);
    return this.paymentHistory;
  }

  async getBalance(): Promise<string> {
    return this.privacy.getBalance();
  }

  async handleRequest(agentReq: AgentRequest, opts?: {
    agentAddress?: string;
    agentId?: string;
    withdrawFn?: (amount: string) => Promise<{ address: string; privateKey: `0x${string}` }>;
  }): Promise<AgentResponse> {
    const { url, method = "GET", headers = {}, body } = agentReq;
    logger.gateway(`Received request for ${url}`);

    // ── Step 1 : Proxy the request to the target URL ──
    let proxyResponse: Response;
    try {
      proxyResponse = await fetch(url, {
        method,
        headers: { ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Proxy request failed: ${msg}`);
      return { status: 502, error: "Target API unreachable", reason: msg };
    }

    // ── Step 2 : If 200, return directly ──
    if (proxyResponse.status !== 402) {
      logger.gateway(`Got ${proxyResponse.status} — no payment needed`);
      let data: unknown;
      try {
        data = await proxyResponse.json();
      } catch {
        data = await proxyResponse.text();
      }
      return { status: proxyResponse.status, data };
    }

    // ── Step 3 : 402 — extract price & recipient ──
    logger.gateway("Got 402 — Payment Required");

    const { amount, recipient } = this.parse402(proxyResponse);
    if (!amount || !recipient) {
      logger.error("Could not parse payment requirements from 402 response");
      return { status: 502, error: "Malformed 402 response from target API" };
    }
    const amountNum = parseFloat(amount);
    logger.gateway(`Price: $${amount}, payTo: ${recipient}`);

    // ── Step 4 : Policy evaluation ──
    const decision = this.policy.evaluate(amountNum, recipient);
    logger.policy(`$${amount} to ${recipient.slice(0, 10)}... → ${decision.toUpperCase()}`);

    // ── Step 5 : Handle decision ──
    if (decision === "denied") {
      this.paymentHistory.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        url,
        amount,
        recipient,
        burner: "",
        policy: "denied",
        status: "denied",
        agentId: opts?.agentId,
      });
      return { status: 403, error: "Payment denied by policy", reason: "Recipient is blacklisted or amount exceeds hard cap" };
    }

    // Ledger: push pending record immediately so dashboard shows it while waiting
    let pendingRecord: PaymentRecord | undefined;
    if (decision === "ledger") {
      pendingRecord = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        url,
        amount,
        recipient,
        burner: "",
        policy: "ledger",
        status: "pending",
        agentId: opts?.agentId,
      };
      this.paymentHistory.push(pendingRecord);

      logger.ledger("Requesting hardware approval...");
      const { decision: approval, proof: ledgerProof } = await this.ledger.requestApproval({
        amount,
        recipient,
        service: url,
      });
      if (approval === "rejected") {
        logger.ledger("Operator REJECTED the payment");
        pendingRecord.status = "rejected";
        return { status: 403, error: "Payment rejected by operator", reason: "Ledger approval denied" };
      }
      logger.ledger("Operator APPROVED the payment");
      pendingRecord.status = "approved";
      pendingRecord.ledgerProof = ledgerProof;
    }

    // ── Step 6 : Privacy — withdraw to burner (fallback to backup key) ──
    let burnerAddress: string;
    let burnerPrivateKey: `0x${string}`;
    try {
      const withdrawFunc = opts?.withdrawFn ?? ((amt: string) => this.privacy.withdrawToBurner(amt));
      const burner = await withdrawFunc(amount);
      burnerAddress = burner.address;
      burnerPrivateKey = burner.privateKey;
      logger.privacy(`Burner ${burnerAddress.slice(0, 10)}... funded with $${amount}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Privacy withdraw failed: ${msg}`);

      if (appConfig.backupBurnerPrivateKey) {
        try {
          logger.privacy(`Fallback → using backup burner key`);
          burnerPrivateKey = appConfig.backupBurnerPrivateKey;
          burnerAddress = privateKeyToAccount(burnerPrivateKey).address;
          logger.privacy(`Backup burner: ${burnerAddress.slice(0, 10)}...`);
        } catch (backupErr) {
          const backupMsg = backupErr instanceof Error ? backupErr.message : "Invalid backup key";
          logger.error(`Backup burner key failed: ${backupMsg}`);
          return { status: 500, error: "Privacy layer failed and backup key is invalid", reason: msg };
        }
      } else {
        return { status: 500, error: "Privacy layer failed and no backup key configured", reason: msg };
      }
    }

    // ── Step 7 : Payment — create x402 fetch with burner key ──
    const payFetch = this.payment.createPaymentFetch(burnerPrivateKey);
    logger.payment("x402 fetch wrapper created with burner key");

    // ── Step 8 : Retry the request with payment ──
    let paidResponse: Response;
    try {
      paidResponse = await payFetch(url, {
        method,
        headers: { ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Paid request failed: ${msg}`);
      return { status: 502, error: "Payment request failed", reason: msg };
    }

    if (paidResponse.status !== 200) {
      logger.error(`Paid request returned ${paidResponse.status} instead of 200`);
      let errBody: unknown;
      try { errBody = await paidResponse.json(); } catch { errBody = null; }
      return { status: paidResponse.status, error: "Payment accepted but API returned error", data: errBody };
    }

    // ── Step 9 : Record the payment ──
    // Extract txHash from PAYMENT-RESPONSE header (base64 JSON with { transaction, ... })
    const txHash = this.parsePaymentResponse(paidResponse);
    if (txHash) {
      logger.payment(`txHash: ${txHash}`);
    }

    let data: unknown;
    try {
      data = await paidResponse.json();
    } catch {
      data = await paidResponse.text();
    }

    this.policy.recordSpending(amountNum);

    // For ledger: update the pending record already in history.
    // For auto: push a new approved record.
    let record: PaymentRecord;
    if (pendingRecord) {
      pendingRecord.burner = burnerAddress;
      pendingRecord.txHash = txHash;
      record = pendingRecord;
    } else {
      record = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        url,
        amount,
        recipient,
        burner: burnerAddress,
        policy: decision,
        status: "approved",
        txHash,
        agentId: opts?.agentId,
      };
      this.paymentHistory.push(record);
    }

    logger.gateway(`Request complete — payment recorded (${record.id.slice(0, 8)})`);

    // ── Step 10 : Return to the agent ──
    return {
      status: 200,
      data,
      payment: {
        amount,
        recipient,
        burner: burnerAddress,
        policy: decision === "auto" ? "auto-approve" : "ledger-approved",
        txHash,
      },
    };
  }

  // ── Parse 402 response to extract price & recipient ──
  private parse402(response: Response): { amount: string | null; recipient: string | null } {
    // x402 sets header "PAYMENT-REQUIRED" = base64(JSON)
    // v2 structure: { x402Version: 2, accepts: [{ amount (raw units), payTo, asset, ... }] }
    // v1 structure: { x402Version: 1, accepts: [{ maxAmountRequired (raw units), payTo, ... }] }
    // amount is in token base units (USDC = 6 decimals) → divide by 10^6 to get USD string
    const USDC_DECIMALS = 6;
    const headerRaw = response.headers.get("X-PAYMENT") ?? response.headers.get("PAYMENT-REQUIRED");
    if (headerRaw) {
      try {
        const decoded = JSON.parse(Buffer.from(headerRaw, "base64").toString("utf-8"));
        const first = decoded.accepts?.[0];
        if (first) {
          const rawAmount: string = first.amount ?? first.maxAmountRequired;
          if (!rawAmount) return { amount: null, recipient: null };
          // Convert raw units → human-readable USD (e.g. "10000" → "0.01")
          const amountUsdc = (parseInt(rawAmount) / 10 ** USDC_DECIMALS).toFixed(6).replace(/\.?0+$/, "");
          return { amount: amountUsdc, recipient: first.payTo };
        }
      } catch {
        // not valid base64 JSON
      }
    }
    return { amount: null, recipient: null };
  }

  // ── Parse 200 response to extract txHash from PAYMENT-RESPONSE header ──
  private parsePaymentResponse(response: Response): string | undefined {
    // x402 sets header "PAYMENT-RESPONSE" = base64(JSON)
    // Structure: { transaction: "0x...", network: "...", success: true }
    const headerRaw = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
    if (!headerRaw) return undefined;
    try {
      const decoded = JSON.parse(Buffer.from(headerRaw, "base64").toString("utf-8"));
      return decoded.transaction ?? undefined;
    } catch {
      return undefined;
    }
  }
}

export const gateway = new Gateway();
