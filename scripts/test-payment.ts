/**
 * Standalone payment test — run against the mock x402 server.
 *
 * Prerequisites:
 *   Terminal 1: pnpm tsx src/mock/x402-server.ts
 *   Terminal 2: pnpm tsx scripts/test-payment.ts
 *
 * Test 1 always works (verifies 402 structure).
 * Test 2 requires a funded wallet (Base Sepolia USDC).
 * Test 3 verifies /bulk-data returns 402 with $10 price.
 */
import { config } from "dotenv";
config();

import { createPaymentFetch } from "../src/core/payment.js";
import { generatePrivateKey } from "viem/accounts";

const MOCK_URL = `http://localhost:${process.env.MOCK_SERVER_PORT ?? "4021"}`;

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

function log(tag: string, color: string, msg: string) {
  console.log(`${color}[${tag}]${COLORS.reset} ${msg}`);
}

async function test1_verify402() {
  log("TEST 1", COLORS.cyan, "Raw request to /data WITHOUT payment → expect 402");

  const res = await fetch(`${MOCK_URL}/data`);
  log("TEST 1", COLORS.gray, `Status: ${res.status}`);

  if (res.status !== 402) {
    log("TEST 1", COLORS.red, `FAIL — expected 402, got ${res.status}`);
    return false;
  }

  // Check for x402 payment-required header
  const paymentHeader = res.headers.get("payment-required");
  if (paymentHeader) {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const requirements = JSON.parse(decoded);
    log("TEST 1", COLORS.green, "402 received with PAYMENT-REQUIRED header (base64)");
    log("TEST 1", COLORS.gray, `Payment requirements: ${JSON.stringify(requirements, null, 2)}`);
  } else {
    log("TEST 1", COLORS.yellow, "402 received but no PAYMENT-REQUIRED header — checking body");
    const body = await res.text();
    log("TEST 1", COLORS.gray, `Body: ${body.slice(0, 500)}`);
  }

  log("TEST 1", COLORS.green, "PASS — 402 Payment Required confirmed\n");
  return true;
}

async function test2_paidRequest() {
  log("TEST 2", COLORS.cyan, "Paid request to /data WITH createPaymentFetch");

  // Use MOCK_RECEIVER_PRIVATE_KEY as a funded test key, or generate a new one
  const testKey = (process.env.MOCK_RECEIVER_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey();
  log("TEST 2", COLORS.gray, `Using key: ${testKey.slice(0, 10)}...`);

  try {
    const payFetch = createPaymentFetch(testKey);
    const res = await payFetch(`${MOCK_URL}/data`);
    log("TEST 2", COLORS.gray, `Status: ${res.status}`);

    if (res.status === 200) {
      const data = await res.json();
      log("TEST 2", COLORS.green, `Data received: ${JSON.stringify(data)}`);

      // Check for settlement info in PAYMENT-RESPONSE header
      const paymentResponse = res.headers.get("payment-response");
      if (paymentResponse) {
        log("TEST 2", COLORS.green, `Settlement header: ${paymentResponse.slice(0, 200)}`);
      }
      log("TEST 2", COLORS.green, "PASS — paid request succeeded\n");
      return true;
    } else {
      const body = await res.text();
      log("TEST 2", COLORS.red, `FAIL — expected 200, got ${res.status}`);
      log("TEST 2", COLORS.gray, `Body: ${body.slice(0, 500)}`);
      if (res.status === 402) {
        log("TEST 2", COLORS.yellow, "Likely cause: wallet not funded with USDC on Base Sepolia");
        log("TEST 2", COLORS.yellow, "Get test USDC at: https://faucet.circle.com");
      }
      return false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("TEST 2", COLORS.red, `FAIL — ${msg}`);
    log("TEST 2", COLORS.yellow, "This test requires a funded wallet (Base Sepolia USDC)\n");
    return false;
  }
}

async function test3_bulkData402() {
  log("TEST 3", COLORS.cyan, "Raw request to /bulk-data → expect 402 with $10 price");

  const res = await fetch(`${MOCK_URL}/bulk-data`);
  log("TEST 3", COLORS.gray, `Status: ${res.status}`);

  if (res.status !== 402) {
    log("TEST 3", COLORS.red, `FAIL — expected 402, got ${res.status}`);
    return false;
  }

  const paymentHeader = res.headers.get("payment-required");
  if (paymentHeader) {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const requirements = JSON.parse(decoded);
    log("TEST 3", COLORS.green, "402 received for /bulk-data");
    log("TEST 3", COLORS.gray, `Payment requirements: ${JSON.stringify(requirements, null, 2)}`);
  }

  log("TEST 3", COLORS.green, "PASS — /bulk-data returns 402 with $10 price\n");
  return true;
}

async function main() {
  console.log(`\n${COLORS.cyan}=== SecretPay Payment Tests ===${COLORS.reset}`);
  console.log(`${COLORS.gray}Mock server: ${MOCK_URL}${COLORS.reset}\n`);

  // Verify mock server is up
  try {
    await fetch(`${MOCK_URL}/health`);
  } catch {
    console.log(`${COLORS.red}ERROR: Mock server not running on ${MOCK_URL}`);
    console.log(`Start it first: pnpm tsx src/mock/x402-server.ts${COLORS.reset}`);
    process.exit(1);
  }

  const results: boolean[] = [];
  results.push(await test1_verify402());
  results.push(await test2_paidRequest());
  results.push(await test3_bulkData402());

  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`${COLORS.cyan}=== Results: ${passed}/${total} passed ===${COLORS.reset}\n`);
  process.exit(passed === total ? 0 : 1);
}

main();
