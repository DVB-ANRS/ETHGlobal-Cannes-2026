import { logger } from "../utils/logger.js";
import type {
  AgentRequest,
  AgentResponse,
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
  requestApproval(details: { amount: string; recipient: string; service: string }): Promise<"approved" | "rejected">;
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
  evaluate(amount: number, _recipient: string): PolicyDecision {
    if (amount > 5) return "ledger";
    return "auto";
  },
  recordSpending(_amount: number) {},
};

const stubLedger: LedgerBridge = {
  async requestApproval(details) {
    logger.ledger(`[STUB] Ledger approval requested: $${details.amount} → ${details.recipient}`);
    return "approved";
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

  getHistory(): PaymentRecord[] {
    return this.paymentHistory;
  }

  async getBalance(): Promise<string> {
    return this.privacy.getBalance();
  }

  async handleRequest(agentReq: AgentRequest): Promise<AgentResponse> {
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
      return { status: 403, error: "Payment denied by policy", reason: "Recipient is blacklisted or amount exceeds hard cap" };
    }

    if (decision === "ledger") {
      logger.ledger("Requesting hardware approval...");
      const approval = await this.ledger.requestApproval({
        amount,
        recipient,
        service: url,
      });
      if (approval === "rejected") {
        logger.ledger("Operator REJECTED the payment");
        return { status: 403, error: "Payment rejected by operator", reason: "Ledger approval denied" };
      }
      logger.ledger("Operator APPROVED the payment");
    }

    // ── Step 6 : Privacy — withdraw to burner ──
    let burnerAddress: string;
    let burnerPrivateKey: `0x${string}`;
    try {
      const burner = await this.privacy.withdrawToBurner(amount);
      burnerAddress = burner.address;
      burnerPrivateKey = burner.privateKey;
      logger.privacy(`Burner ${burnerAddress.slice(0, 10)}... funded with $${amount}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Privacy withdraw failed: ${msg}`);
      return { status: 500, error: "Privacy layer failed", reason: msg };
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
    let data: unknown;
    try {
      data = await paidResponse.json();
    } catch {
      data = await paidResponse.text();
    }

    this.policy.recordSpending(amountNum);

    const record: PaymentRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      url,
      amount,
      recipient,
      burner: burnerAddress,
      policy: decision,
      txHash: undefined, // will be enriched when real modules provide it
    };
    this.paymentHistory.push(record);

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
        txHash: record.txHash,
      },
    };
  }

  // ── Parse 402 response to extract price & recipient ──
  private parse402(response: Response): { amount: string | null; recipient: string | null } {
    // x402 puts a base64-encoded JSON in the "X-PAYMENT" or "PAYMENT-REQUIRED" header
    // The body also contains the PaymentRequired JSON
    // We try the header first, then fall back to known structures

    const headerRaw = response.headers.get("X-PAYMENT") ?? response.headers.get("PAYMENT-REQUIRED");
    if (headerRaw) {
      try {
        const decoded = JSON.parse(Buffer.from(headerRaw, "base64").toString("utf-8"));
        // v2 structure: { x402Version: 2, accepts: [{ maxAmountRequired, payTo, ... }] }
        // v1 structure: { x402Version: 1, accepts: [{ maxAmountRequired, payTo, ... }] }
        const first = decoded.accepts?.[0];
        if (first) {
          return { amount: first.maxAmountRequired, recipient: first.payTo };
        }
      } catch {
        // header wasn't valid base64 JSON, try body below
      }
    }

    return { amount: null, recipient: null };
  }
}

export const gateway = new Gateway();
