/**
 * SecretPay Demo — Agent Simulator
 *
 * Exercises all 5 use cases via POST /agent/request on the gateway.
 * Requires: gateway (port 3000) + mock server (port 4021) both running.
 *
 * Usage: pnpm tsx src/demo/agent-sim.ts
 */
import { logger } from "../utils/logger.js";

const GATEWAY_URL = "http://localhost:3000";
const MOCK_BASE = "http://localhost:4021";

interface GatewayResponse {
  status: number;
  data?: unknown;
  payment?: {
    amount: string;
    recipient: string;
    burner: string;
    policy: string;
    txHash?: string;
  };
  error?: string;
  reason?: string;
}

async function sendRequest(
  url: string,
  label: string
): Promise<GatewayResponse> {
  logger.payment(`\n--- ${label} ---`);
  logger.payment(`→ POST /agent/request { url: "${url}" }`);

  const res = await fetch(`${GATEWAY_URL}/agent/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = (await res.json()) as GatewayResponse;
  logger.payment(`← Status: ${res.status}`);

  if (data.payment) {
    logger.payment(`  Policy:    ${data.payment.policy}`);
    logger.payment(`  Amount:    ${data.payment.amount}`);
    logger.payment(`  Burner:    ${data.payment.burner}`);
    if (data.payment.txHash) {
      logger.payment(
        `  Tx:        https://sepolia.basescan.org/tx/${data.payment.txHash}`
      );
    }
  }
  if (data.data) {
    const preview = JSON.stringify(data.data);
    logger.payment(
      `  Data:      ${preview.length > 120 ? preview.slice(0, 120) + "..." : preview}`
    );
  }
  if (data.error) {
    logger.payment(`  Error:     ${data.error}`);
  }
  if (data.reason) {
    logger.payment(`  Reason:    ${data.reason}`);
  }

  return data;
}

function separator(title: string) {
  logger.payment(`\n${"=".repeat(60)}`);
  logger.payment(title);
  logger.payment("=".repeat(60));
}

async function main() {
  logger.payment("=".repeat(60));
  logger.payment("  SecretPay Demo — 4 Use Cases");
  logger.payment("=".repeat(60));

  // Verify gateway is up
  try {
    const health = await fetch(`${GATEWAY_URL}/health`);
    if (!health.ok) throw new Error("unhealthy");
    logger.payment("Gateway is up");
  } catch {
    logger.error(`Gateway not running on ${GATEWAY_URL}`);
    logger.error("Start it first: pnpm dev");
    process.exit(1);
  }

  // ── UC1: Auto-approve ($0.10 < $1 ledger threshold) ──
  separator("UC1: Auto-approve — $0.10 request");
  await sendRequest(`${MOCK_BASE}/data`, "Auto-approve $0.10");

  // ── UC2: Ledger approve ($1.50 >= $1 ledger threshold, <= $2 cap) ──
  separator("UC2: Ledger approve — $1.50 request");
  logger.payment(">>> Press APPROVE on Ledger device <<<");
  await sendRequest(`${MOCK_BASE}/bulk-data`, "Ledger approve $1.50");

  // ── UC3: Ledger reject ($1.50 >= $1 ledger threshold) ──
  separator("UC3: Ledger reject — $1.50 request");
  logger.payment(">>> Press REJECT on Ledger device <<<");
  await sendRequest(`${MOCK_BASE}/bulk-data`, "Ledger reject $1.50");

  // ── UC4: Blacklist ──
  separator("UC4: Blacklist — denied recipient");
  logger.payment("NOTE: Requires a blacklisted recipient in policy.json (Dev 4)");
  await sendRequest(`${MOCK_BASE}/data`, "Blacklist test");

  // ── Summary ──
  separator("Summary");
  try {
    const historyRes = await fetch(`${GATEWAY_URL}/agent/history`);
    const history = (await historyRes.json()) as { payments?: unknown[] };
    logger.payment(
      `Total payments recorded: ${history.payments?.length ?? 0}`
    );
  } catch {
    logger.payment("Could not fetch payment history");
  }

  try {
    const balanceRes = await fetch(`${GATEWAY_URL}/agent/balance`);
    const balance = await balanceRes.json();
    logger.payment(`Pool balance: ${JSON.stringify(balance)}`);
  } catch {
    logger.payment("Could not fetch balance");
  }

  logger.payment("\nDemo complete.");
}

main().catch((err: Error) => {
  logger.error(`Demo failed: ${err.message}`);
  process.exit(1);
});
