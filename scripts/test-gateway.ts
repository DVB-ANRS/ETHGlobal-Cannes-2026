/**
 * test-gateway.ts — Audit complet du Gateway avec mocks
 *
 * Spin up a minimal HTTP server simulating the x402 protocol,
 * then run all 5 use cases against the Gateway directly.
 *
 * Usage: pnpm tsx scripts/test-gateway.ts
 */

import http from "http";
import { Gateway } from "../src/core/gateway.js";
import type { PolicyDecision } from "../src/types/index.js";

// ─── ANSI colors ──────────────────────────────────────────────────────────────
const G = "\x1b[32m"; // green
const R = "\x1b[31m"; // red
const Y = "\x1b[33m"; // yellow
const C = "\x1b[36m"; // cyan
const D = "\x1b[90m"; // dim
const X = "\x1b[0m";  // reset

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
  console.log(`  ${G}✓${X} ${label}${detail ? ` ${D}(${detail})${X}` : ""}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.log(`  ${R}✗${X} ${label}${detail ? ` ${D}(${detail})${X}` : ""}`);
  failed++;
}

function section(title: string) {
  console.log(`\n${C}━━━ ${title} ${X}`);
}

// ─── Build a proper x402-style PAYMENT-REQUIRED header ───────────────────────
function makePaymentRequiredHeader(amount: string, payTo: string): string {
  const paymentRequired = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        maxAmountRequired: amount,
        resource: "http://localhost:9042/data",
        description: "Mock API",
        mimeType: "application/json",
        outputSchema: {},
        payTo,
        maxTimeoutSeconds: 60,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: {},
      },
    ],
  };
  return Buffer.from(JSON.stringify(paymentRequired), "utf8").toString("base64");
}

// ─── Mock HTTP server ─────────────────────────────────────────────────────────
const MOCK_PORT = 9042;
const MOCK_RECEIVER = "0xReceiver1234567890abcdef1234567890abcdef";

type MockBehavior = "200" | "402_auto" | "402_ledger" | "402_denied" | "down";
let mockBehavior: MockBehavior = "200";
// Track how many times the mock received a request (to detect retry)
let mockHitCount = 0;

const mockServer = http.createServer((req, res) => {
  mockHitCount++;

  if (mockBehavior === "down") {
    req.socket.destroy();
    return;
  }

  if (mockBehavior === "200") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ symbol: "ETH/USD", price: 3847.52 }));
    return;
  }

  // If the request carries a PAYMENT-SIGNATURE or X-PAYMENT header, serve data
  const hasPayment =
    req.headers["payment-signature"] || req.headers["x-payment"];
  if (hasPayment) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ symbol: "ETH/USD", price: 3847.52, paid: true }));
    return;
  }

  // Otherwise return 402
  const amountMap: Record<string, string> = {
    "402_auto":   "0.01",
    "402_ledger": "10.00",
    "402_denied": "0.01",
  };
  const amount = amountMap[mockBehavior] ?? "0.01";
  const payTo = mockBehavior === "402_denied"
    ? "0xBLACKLISTED0000000000000000000000000000"
    : MOCK_RECEIVER;

  res.writeHead(402, {
    "Content-Type": "application/json",
    "PAYMENT-REQUIRED": makePaymentRequiredHeader(amount, payTo),
  });
  res.end("{}");
});

// ─── Controlled mock dependencies ────────────────────────────────────────────
let ledgerShouldApprove = true;
let dailySpent = 0;

const mockPrivacy = {
  async withdrawToBurner(amount: string) {
    return {
      address: "0xBurnerMock_7f3a",
      privateKey: "0xdeadbeef" as `0x${string}`,
    };
  },
  async getBalance() {
    return "42.00";
  },
};

const mockPolicy = {
  evaluate(amount: number, recipient: string): PolicyDecision {
    if (recipient === "0xBLACKLISTED0000000000000000000000000000") return "denied";
    if (amount > 100) return "denied";
    if (dailySpent + amount > 50) return "ledger";
    if (amount > 5) return "ledger";
    return "auto";
  },
  recordSpending(amount: number) {
    dailySpent += amount;
  },
};

const mockLedger = {
  async requestApproval(_d: { amount: string; recipient: string; service: string }) {
    return ledgerShouldApprove ? ("approved" as const) : ("rejected" as const);
  },
};

// Mock payment that injects the payment header so the retry hits the "paid" branch
const mockPayment = {
  createPaymentFetch(_burnerKey: `0x${string}`) {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers((init?.headers as HeadersInit) ?? {});
      headers.set("X-PAYMENT", "mock-payment-token");
      return fetch(input, { ...init, headers });
    };
  },
};

// ─── Test runner ──────────────────────────────────────────────────────────────
async function runTests() {
  const BASE = `http://localhost:${MOCK_PORT}`;

  // Build gateway with controlled mocks
  const gw = new Gateway({
    privacy: mockPrivacy,
    policy: mockPolicy,
    ledger: mockLedger,
    payment: mockPayment,
  });

  // ── UC0 : Straight 200, no payment needed ──────────────────────────────────
  section("UC0 — Direct 200 (no payment needed)");
  mockBehavior = "200";
  mockHitCount = 0;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 200 ? ok("status 200") : fail("status 200", `got ${r.status}`);
    r.payment === undefined ? ok("no payment info attached") : fail("payment should be undefined", JSON.stringify(r.payment));
    (r.data as Record<string, unknown>)?.symbol === "ETH/USD" ? ok("data returned") : fail("data not returned");
    mockHitCount === 1 ? ok("hit mock once (no retry)") : fail("hit mock once", `got ${mockHitCount}`);
  }

  // ── UC1 : Auto-approve ($0.01) ─────────────────────────────────────────────
  section("UC1 — Auto-approve ($0.01 < $5 threshold)");
  mockBehavior = "402_auto";
  mockHitCount = 0;
  dailySpent = 0;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 200 ? ok("status 200") : fail("status 200", `got ${r.status}`);
    r.payment?.policy === "auto-approve" ? ok('policy = "auto-approve"') : fail("wrong policy", r.payment?.policy);
    r.payment?.amount === "0.01" ? ok("amount = 0.01") : fail("wrong amount", r.payment?.amount);
    r.payment?.burner === "0xBurnerMock_7f3a" ? ok("burner address set") : fail("burner missing", r.payment?.burner);
    mockHitCount === 2 ? ok("mock hit twice (first=402, retry=200)") : fail("wrong hit count", `got ${mockHitCount}`);
    gw.getHistory().length === 1 ? ok("1 record in history") : fail("history length", `got ${gw.getHistory().length}`);
  }

  // ── UC2 : Ledger approve ($10) ─────────────────────────────────────────────
  section("UC2 — Ledger approve ($10 > $5 threshold)");
  mockBehavior = "402_ledger";
  mockHitCount = 0;
  dailySpent = 0;
  ledgerShouldApprove = true;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 200 ? ok("status 200 after ledger approve") : fail("status 200", `got ${r.status}`);
    r.payment?.policy === "ledger-approved" ? ok('policy = "ledger-approved"') : fail("wrong policy", r.payment?.policy);
    r.payment?.amount === "10.00" ? ok("amount = 10.00") : fail("wrong amount", r.payment?.amount);
  }

  // ── UC3 : Ledger reject ($10) ──────────────────────────────────────────────
  section("UC3 — Ledger reject ($10)");
  mockBehavior = "402_ledger";
  mockHitCount = 0;
  dailySpent = 0;
  ledgerShouldApprove = false;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 403 ? ok("status 403") : fail("status 403", `got ${r.status}`);
    r.error?.includes("rejected") ? ok("error message mentions rejected") : fail("wrong error", r.error);
    ledgerShouldApprove = true; // reset
  }

  // ── UC4 : Blacklist denied ─────────────────────────────────────────────────
  section("UC4 — Blacklisted recipient → instant deny");
  mockBehavior = "402_denied";
  mockHitCount = 0;
  dailySpent = 0;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 403 ? ok("status 403") : fail("status 403", `got ${r.status}`);
    r.error?.includes("denied") ? ok("error mentions denied") : fail("wrong error", r.error);
    mockHitCount === 1 ? ok("only 1 hit (no retry after deny)") : fail("wrong hit count", `got ${mockHitCount}`);
  }

  // ── UC5 : Daily budget exceeded ────────────────────────────────────────────
  section("UC5 — Daily budget exceeded → escalates to ledger");
  mockBehavior = "402_auto";
  mockHitCount = 0;
  dailySpent = 50.0; // already AT limit — next spend pushes it over
  ledgerShouldApprove = true;
  {
    // $0.01 but daily would hit $50.00 → policy returns "ledger"
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 200 ? ok("status 200 (ledger approved)") : fail("status 200", `got ${r.status}`);
    r.payment?.policy === "ledger-approved" ? ok('policy = "ledger-approved" despite tiny amount') : fail("wrong policy", r.payment?.policy);
  }

  // ── UC6 : API unreachable ──────────────────────────────────────────────────
  section("UC6 — API unreachable → 502");
  mockBehavior = "down";
  mockHitCount = 0;
  {
    const r = await gw.handleRequest({ url: `${BASE}/data` });
    r.status === 502 ? ok("status 502") : fail("status 502", `got ${r.status}`);
    r.error ? ok("error message present") : fail("error message missing");
  }

  // ── UC7 : History & balance ────────────────────────────────────────────────
  section("UC7 — History and balance endpoints");
  {
    const history = gw.getHistory();
    history.length >= 3 ? ok(`history has ${history.length} records`) : fail("history too short", `got ${history.length}`);
    const balance = await gw.getBalance();
    balance === "42.00" ? ok("balance = 42.00") : fail("wrong balance", balance);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(40)}`);
  console.log(`${G}Passed: ${passed}${X}  ${failed > 0 ? R : D}Failed: ${failed}${X}`);
  if (failed > 0) process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n${Y}SecretPay Gateway — Audit Test Suite${X}`);
console.log(`${D}Spinning up mock x402 server on :${MOCK_PORT}...${X}`);

mockServer.listen(MOCK_PORT, async () => {
  try {
    await runTests();
  } catch (err) {
    console.error(`\n${R}Unexpected error:${X}`, err);
    process.exit(1);
  } finally {
    mockServer.close();
  }
});
