# SecretPay — Dev 3 (@payment) Instructions

## Identity & Scope

You are **Dev 3 (@payment)** — Payment Engineer on the SecretPay hackathon project.
**ETHGlobal Cannes 2026 | Team DVB | Deadline: April 5, 2026.**

You own the **x402 payment integration**: the mock paid API server, the payment-enabled fetch wrapper, and the demo agent simulator. Your work is the core of the Arc/Circle x402 track ($6,000 prize).

---

## Your Files (ONLY these — do NOT touch anything else)

| File | Action | Description |
|------|--------|-------------|
| `src/core/payment.ts` | **CREATE** | x402 payment-enabled fetch wrapper using burner wallets |
| `src/mock/x402-server.ts` | **CREATE** | Mock paid API server with x402 payment middleware (port 4021) |
| `src/demo/agent-sim.ts` | **CREATE** | Demo script that exercises all 5 use cases via the gateway |
| `scripts/test-payment.ts` | **CREATE** | Standalone test proving mock server + payment fetch work |

**OFF-LIMITS files** (owned by other devs):
- `src/server.ts`, `src/routes/*` — Dev 1 (@backend)
- `src/core/gateway.ts` — Dev 1 (@backend)
- `src/core/privacy.ts`, `src/utils/burner.ts` — Dev 2 (@privacy)
- `src/core/policy.ts`, `src/core/ledger.ts`, `src/config/policy.json` — Dev 4 (@trust)
- `src/types/index.ts`, `src/utils/config.ts`, `src/utils/logger.ts` — Dev 1 (@backend)

If you absolutely must suggest a change to another dev's file (e.g., adding an env var to `config.ts`), **document it as a request** — do not edit the file.

---

## Existing Infrastructure You MUST Use

### `src/utils/config.ts` — App Configuration

```typescript
export const appConfig = {
  gatewayPort: number,                   // GATEWAY_PORT (default: 3000)
  mockServerPort: number,                // MOCK_SERVER_PORT (default: 4021)
  rpcUrl: string,                        // BASE_SEPOLIA_RPC_URL (default: "https://sepolia.base.org")
  maxPerTx: number,                      // DEFAULT_MAX_PER_TX (default: 5)
  maxPerDay: number,                     // DEFAULT_MAX_PER_DAY (default: 50)
  get unlinkApiKey(): string,            // from .env — throws if missing
  get agentMnemonic(): string,           // from .env — throws if missing
  get mockReceiverAddress(): string,     // from .env — throws if missing (your mock server's payTo)
  get mockReceiverPrivateKey(): string,  // from .env — throws if missing (for facilitator settlement)
};
```

### `src/utils/logger.ts` — Structured Logging

```typescript
export const logger = {
  gateway: (msg: string) => void, // Cyan [Gateway] tag
  policy:  (msg: string) => void, // Yellow [Policy] tag
  privacy: (msg: string) => void, // Green [Privacy] tag
  payment: (msg: string) => void, // Cyan [Payment] tag — USE THIS for all your logs
  ledger:  (msg: string) => void, // Yellow [Ledger] tag
  error:   (msg: string) => void, // Red [Error] tag
  info:    (msg: string) => void, // Gray [Info] tag
};
```

### `src/types/index.ts` — Shared Types

```typescript
export interface AgentRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface AgentResponse {
  status: number;
  data?: unknown;
  payment?: PaymentInfo;
  error?: string;
  reason?: string;
}

export interface PaymentInfo {
  amount: string;
  recipient: string;
  burner: string;
  policy: "auto-approve" | "ledger-approved" | "denied";
  txHash?: string;
}

export type PolicyDecision = "auto" | "ledger" | "denied";

export interface PaymentRecord {
  id: string;
  timestamp: number;
  url: string;
  amount: string;
  recipient: string;
  burner: string;
  policy: PolicyDecision;
  txHash?: string;
}
```

---

## Blockchain Constants

| Resource | Value |
|----------|-------|
| Chain | Base Sepolia (chain ID `84532`) |
| Network (CAIP-2) | `eip155:84532` |
| USDC Contract | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDC Decimals | **6** (1 USDC = `1000000`, $0.01 = `10000`) |
| RPC URL | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |

---

## CRITICAL: Real @x402 SDK API (v2.9.0)

> **WARNING**: The TASKS.md contains simplified pseudo-code that does NOT match the real SDK.
> The information below was extracted from the actual installed packages in `node_modules/@x402/*/`.
> **Always trust THIS document over TASKS.md when there are conflicts.**

### What TASKS.md says vs What the SDK actually does

| TASKS.md (WRONG) | Real SDK (CORRECT) |
|---|---|
| `import { createX402Fetch } from "@x402/fetch"` | `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch"` — function name is different |
| `createX402Fetch(fetch, account)` | `wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network, client }] })` — takes a config object, not a raw account |
| Account passed directly to fetch wrapper | Must create `ExactEvmScheme(signer)` client, wrap account with `toClientEvmSigner()` |
| `paymentMiddleware` takes simple args | `paymentMiddleware(routes, server)` — needs a full `x402ResourceServer` with facilitator |
| Route config is simple | Routes keyed by `"METHOD /path"`, each has `accepts` with `PaymentOption` object |
| *(not mentioned)* | Mock server needs `HTTPFacilitatorClient` for payment verification/settlement |
| *(not mentioned)* | Scheme registration: client uses `@x402/evm/exact/client`, server uses `@x402/evm/exact/server` |

### Verified Import Paths (from package.json `exports` fields)

**For `payment.ts` (CLIENT-SIDE — paying for resources):**

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
```

**For `x402-server.ts` (SERVER-SIDE — serving paid resources):**

```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
```

> **IMPORTANT**: `ExactEvmScheme` exists in BOTH `@x402/evm/exact/client` and `@x402/evm/exact/server`.
> They are **different classes** implementing different interfaces (`SchemeNetworkClient` vs `SchemeNetworkServer`).
> Using the wrong one will fail silently or throw confusing type errors.
> The main `@x402/evm` entry re-exports the CLIENT version only.

---

### @x402/fetch — Payment-Enabled Fetch Wrapper

```typescript
// Creates a fetch wrapper that automatically handles 402 Payment Required responses
function wrapFetchWithPaymentFromConfig(
  fetch: typeof globalThis.fetch,
  config: x402ClientConfig
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface x402ClientConfig {
  schemes: SchemeRegistration[];           // At least one scheme must be registered
  policies?: PaymentPolicy[];              // Optional spending policies
  paymentRequirementsSelector?: SelectPaymentRequirements;  // Optional selector
}

interface SchemeRegistration {
  network: Network;                        // "eip155:84532" for Base Sepolia
  client: SchemeNetworkClient;             // ExactEvmScheme instance
  x402Version?: number;                    // defaults to 2
}
```

**Flow when the wrapped fetch encounters a 402:**
1. Parses `PAYMENT-REQUIRED` header from the 402 response
2. Selects the matching scheme client for the network
3. Creates a payment payload (signs with the burner's key)
4. Retries the request with `PAYMENT-SIGNATURE` header
5. Returns the final response (200 with data + `PAYMENT-RESPONSE` header)

Also exported (useful for reading settlement info):
```typescript
function decodePaymentResponseHeader(header: string): PaymentPayload;
```

---

### @x402/evm — EVM Scheme Implementations

**Client-side signer adapter:**

```typescript
// From "@x402/evm"
function toClientEvmSigner(
  signer: {
    readonly address: `0x${string}`;
    signTypedData(message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`>;
  },
  publicClient?: {
    readContract(args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<unknown>;
    getTransactionCount?(args: { address: `0x${string}` }): Promise<number>;
    estimateFeesPerGas?(): Promise<{
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    }>;
  }
): ClientEvmSigner;
```

> `toClientEvmSigner` bridges a viem `PrivateKeyAccount` into the `ClientEvmSigner` interface
> the x402 scheme requires. Pass a `publicClient` to enable `readContract` (needed for
> EIP-3009 detection on USDC — without it, falls back to Permit2).

**Client-side ExactEvmScheme:**

```typescript
// From "@x402/evm/exact/client"
class ExactEvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(
    signer: ClientEvmSigner,
    options?: ExactEvmSchemeOptions
  );

  createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext
  ): Promise<PaymentPayloadResult>;
}

type ExactEvmSchemeOptions =
  | { rpcUrl?: string }                          // Single-chain RPC
  | Record<number, { rpcUrl?: string }>;          // Per-chain RPC (keyed by chain ID)
```

**Server-side ExactEvmScheme:**

```typescript
// From "@x402/evm/exact/server"
class ExactEvmScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  // No constructor params needed for server-side
  registerMoneyParser(parser: MoneyParser): ExactEvmScheme;
  getAssetDecimals(asset: string, network: Network): number;
  parsePrice(price: Price, network: Network): Promise<AssetAmount>;
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: { x402Version: number; scheme: string; network: Network; extra?: Record<string, unknown> },
    extensionKeys: string[]
  ): Promise<PaymentRequirements>;
}
```

> Server-side `ExactEvmScheme()` has no constructor args.
> It handles price parsing: `"$0.01"`, `0.01`, or `{ asset: "0x036...", amount: "10000" }`.

---

### @x402/express — Express Payment Middleware

```typescript
// From "@x402/express"
function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart?: boolean  // Set to true — fetches facilitator capabilities on startup
): (req: Request, res: Response, next: NextFunction) => Promise<void>;
```

**Route Configuration:**

```typescript
type RoutesConfig = Record<string, RouteConfig>;
// Keys are "METHOD /path" patterns, e.g. "GET /data", "POST /api/*"

interface RouteConfig {
  accepts: PaymentOption | PaymentOption[];
  resource?: string;        // Human-readable resource name
  description?: string;     // Shown in 402 response
  mimeType?: string;
}

interface PaymentOption {
  scheme: string;                          // "exact"
  payTo: string;                           // Recipient EVM address
  price: Price;                            // "$0.01", 0.01, or { asset, amount }
  network: Network;                        // "eip155:84532"
  maxTimeoutSeconds?: number;              // Payment validity window
  extra?: Record<string, unknown>;
}

type Price = string | number | { asset: string; amount: string };
// "$0.01" and 0.01 are both valid — the scheme's parsePrice handles conversion
// For explicit control: { asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount: "10000" }
```

**Also re-exported from @x402/express:**
- `x402ResourceServer` (from `@x402/core/server`)
- `x402HTTPResourceServer` (from `@x402/core/server`)
- `PaywallConfig`, `SettlementOverrides`

---

### @x402/core/server — Resource Server & Facilitator Client

```typescript
// From "@x402/core/server"
class x402ResourceServer {
  constructor(facilitatorClients?: FacilitatorClient | FacilitatorClient[]);

  register(network: Network, server: SchemeNetworkServer): x402ResourceServer;  // chainable

  initialize(): Promise<void>;  // Validates routes, fetches facilitator support

  buildPaymentRequirements(resourceConfig: ResourceConfig): Promise<PaymentRequirements[]>;
  verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settlePayment(payload: PaymentPayload, requirements: PaymentRequirements, ...): Promise<SettleResponse>;
}

class HTTPFacilitatorClient implements FacilitatorClient {
  constructor(config?: FacilitatorConfig);

  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
  getSupported(): Promise<SupportedResponse>;
}

interface FacilitatorConfig {
  url?: string;             // Facilitator base URL
  createAuthHeaders?: () => Promise<{
    verify: Record<string, string>;
    settle: Record<string, string>;
    supported: Record<string, string>;
  }>;
}
```

---

## FACILITATOR URL

The `HTTPFacilitatorClient` requires a facilitator URL for payment verification and settlement.

**Known candidates (verify which works):**
1. `https://x402.org/facilitator` — referenced in CLAUDE.md
2. No URL (the `config` param is optional — there may be a built-in default)

**How to determine the correct URL:**
1. First, try instantiating `new HTTPFacilitatorClient()` with no config — if it has a default, it will work
2. If that fails, try `new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" })`
3. Check the x402 GitHub repo or docs for testnet facilitator URLs
4. **Ask the user** if none of the above works

**Do NOT guess.** A wrong facilitator URL means all payment verification fails — the mock server will reject every payment.

---

## Implementation Spec

### File 1: `src/core/payment.ts`

Exports a function that creates a payment-enabled fetch wrapper from a burner wallet's private key.
This is what the gateway calls after getting a burner wallet from the privacy module.

**Public API (what the gateway calls):**

```typescript
export function createPaymentFetch(
  burnerPrivateKey: `0x${string}`
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
```

**Internal implementation:**

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { logger } from "../utils/logger.js";
import { appConfig } from "../utils/config.js";

export function createPaymentFetch(burnerPrivateKey: `0x${string}`) {
  // 1. Create viem account from private key
  const account = privateKeyToAccount(burnerPrivateKey);

  // 2. Create public client for readContract support (EIP-3009 detection)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(appConfig.rpcUrl),
  });

  // 3. Adapt viem account to x402 ClientEvmSigner interface
  const signer = toClientEvmSigner(account, publicClient);

  // 4. Create the Exact EVM scheme client
  const scheme = new ExactEvmScheme(signer, {
    rpcUrl: appConfig.rpcUrl,
  });

  // 5. Wrap native fetch with payment handling
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{
      network: "eip155:84532",
      client: scheme,
    }],
  });

  logger.payment(`Payment fetch ready for burner ${account.address}`);
  return fetchWithPayment;
}
```

**Key points:**
- The function is **synchronous** from the gateway's perspective (returns a fetch wrapper immediately)
- The actual payment signature happens lazily when the wrapper encounters a 402
- `toClientEvmSigner(account, publicClient)` enables USDC's efficient EIP-3009 transfer path
- `ExactEvmSchemeOptions.rpcUrl` provides fallback RPC for on-chain reads
- Log via `logger.payment()` only — do not use `console.log`

---

### File 2: `src/mock/x402-server.ts`

A standalone Express server (port 4021) simulating a paid API protected by x402.
Run via `pnpm tsx src/mock/x402-server.ts` or `pnpm mock`.

**3 endpoints with different prices:**

| Endpoint | Price | Data returned |
|----------|-------|---------------|
| `GET /data` | $0.01 | `{ symbol: "ETH/USD", price: 3847.52, timestamp: ... }` |
| `GET /news` | $0.005 | `{ articles: [{ title: "...", date: "..." }, ...] }` |
| `GET /bulk-data` | $10.00 | `{ data: [...100 rows...] }` — triggers Ledger in gateway |

**Implementation:**

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { appConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";

const app = express();

// 1. Create facilitator client (for payment verification/settlement)
const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",  // VERIFY — see FACILITATOR URL section
});

// 2. Create resource server with EVM exact scheme
const resourceServer = new x402ResourceServer(facilitator)
  .register("eip155:84532", new ExactEvmScheme());

// 3. Define paid routes
const routes = {
  "GET /data": {
    accepts: {
      scheme: "exact",
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress,
      price: 0.01,  // $0.01 in USD — ExactEvmScheme.parsePrice handles conversion
    },
    description: "Real-time market data",
  },
  "GET /news": {
    accepts: {
      scheme: "exact",
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress,
      price: 0.005,
    },
    description: "Latest crypto news",
  },
  "GET /bulk-data": {
    accepts: {
      scheme: "exact",
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress,
      price: 10,  // $10 — will trigger Ledger approval in the gateway
    },
    description: "Historical bulk dataset",
  },
};

// 4. Apply payment middleware BEFORE route handlers
app.use(paymentMiddleware(routes, resourceServer, { testnet: true }, undefined, true));

// 5. Route handlers — only reached if payment is verified
app.get("/data", (_req, res) => {
  res.json({
    symbol: "ETH/USD",
    price: 3847.52,
    timestamp: new Date().toISOString(),
    source: "SecretPay Mock API",
  });
});

app.get("/news", (_req, res) => {
  res.json({
    articles: [
      { title: "ETH Breaks $4000", date: "2026-04-04", source: "CoinDesk" },
      { title: "Base L2 Hits 100M Tx", date: "2026-04-03", source: "The Block" },
    ],
  });
});

app.get("/bulk-data", (_req, res) => {
  const data = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    pair: "ETH/USD",
    price: 3800 + Math.random() * 100,
    volume: Math.floor(Math.random() * 1000000),
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
  }));
  res.json({ data, count: data.length });
});

// 6. Start server
app.listen(appConfig.mockServerPort, () => {
  logger.info(`x402 Mock API on :${appConfig.mockServerPort}`);
  logger.payment(`Receiver: ${appConfig.mockReceiverAddress}`);
  logger.payment("Endpoints: GET /data ($0.01), GET /news ($0.005), GET /bulk-data ($10)");
});
```

**Key points:**
- `paymentMiddleware` intercepts requests BEFORE they reach route handlers
- Without valid payment: returns **402** with `PAYMENT-REQUIRED` header containing price, asset, payTo, etc.
- With valid payment: middleware calls `next()`, route handler serves data
- The facilitator verifies the payment signature and settles (transfers USDC from payer to payTo)
- `syncFacilitatorOnStart: true` (5th param) fetches facilitator capabilities on startup
- `{ testnet: true }` in `PaywallConfig` signals this is a testnet deployment

---

### File 3: `scripts/test-payment.ts`

Standalone test script proving the mock server and payment module work together.
Run via `pnpm tsx scripts/test-payment.ts`.

**Test flow:**

```
1. Load .env (dotenv)
2. Test 1: Raw request to mock server WITHOUT payment → expect 402
   - Verify response status is 402
   - Verify PAYMENT-REQUIRED header is present
   - Parse and display payment requirements (price, asset, payTo)
3. Test 2: Request to mock server WITH payment via createPaymentFetch
   - Generate a burner key (from viem)
   - NOTE: The burner needs USDC to actually pay. For standalone testing,
     use the MOCK_RECEIVER_PRIVATE_KEY as a funded test key, OR document
     that this test requires a funded wallet.
   - Create payment fetch using createPaymentFetch(privateKey)
   - Make request to http://localhost:4021/data
   - Verify response status is 200
   - Display returned data
   - Display Basescan link for the settlement tx (from PAYMENT-RESPONSE header)
4. Test 3: Request to /bulk-data → verify 402 with $10 price
```

**Important**: This test requires:
- The mock server running on port 4021 (`pnpm mock` in another terminal)
- A funded wallet (the paying account needs USDC on Base Sepolia)
- A working facilitator URL

If the wallet isn't funded, Test 1 (402 verification) still works. Test 2 will fail at payment time.
Document this clearly in the script output.

---

### File 4: `src/demo/agent-sim.ts`

Demo script that exercises all 5 use cases via `POST /agent/request` on the gateway.
Run via `pnpm tsx src/demo/agent-sim.ts` or `pnpm demo`.

**Requires**: Gateway (port 3000) and mock server (port 4021) both running.

**5 use cases in sequence:**

| # | Scenario | Request | Expected |
|---|----------|---------|----------|
| 1 | Auto-approve | `POST /agent/request { url: "http://localhost:4021/data" }` | 200 + `policy: "auto-approve"` |
| 2 | Ledger approve | `POST /agent/request { url: "http://localhost:4021/bulk-data" }` | 200 + `policy: "ledger-approved"` (operator approves on Ledger) |
| 3 | Ledger reject | `POST /agent/request { url: "http://localhost:4021/bulk-data" }` | 403 + `policy: "denied"` (operator rejects on Ledger) |
| 4 | Budget limit | 50x `POST /agent/request { url: "http://localhost:4021/data" }` | First ~49 auto-approve, then switches to "ledger" when daily budget ($50) hit |
| 5 | Blacklist | `POST /agent/request { url: "http://localhost:4021/data" }` with blacklisted recipient | 403 + `reason: "denied"` immediately |

**Implementation structure:**

```typescript
import { logger } from "../utils/logger.js";

const GATEWAY_URL = "http://localhost:3000";
const MOCK_BASE = "http://localhost:4021";

async function sendRequest(url: string, label: string): Promise<void> {
  logger.payment(`--- ${label} ---`);
  const res = await fetch(`${GATEWAY_URL}/agent/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  logger.payment(`Status: ${res.status}`);
  logger.payment(`Response: ${JSON.stringify(data, null, 2)}`);
}

async function main() {
  logger.payment("=== SecretPay Demo — 5 Use Cases ===\n");

  // UC1: Auto-approve ($0.01 < $5 threshold)
  await sendRequest(`${MOCK_BASE}/data`, "UC1: Auto-approve $0.01");

  // UC2: Ledger approve ($10 > $5 threshold)
  logger.payment(">>> Waiting for Ledger approval... Press APPROVE on device <<<");
  await sendRequest(`${MOCK_BASE}/bulk-data`, "UC2: Ledger approve $10");

  // UC3: Ledger reject ($10 > $5 threshold)
  logger.payment(">>> Waiting for Ledger rejection... Press REJECT on device <<<");
  await sendRequest(`${MOCK_BASE}/bulk-data`, "UC3: Ledger reject $10");

  // UC4: Budget exhaustion (50x $0.01 = $0.50, then budget reset scenario)
  logger.payment("--- UC4: Budget exhaustion (sending 50 requests) ---");
  for (let i = 1; i <= 50; i++) {
    await sendRequest(`${MOCK_BASE}/data`, `UC4: Request ${i}/50`);
  }

  // UC5: Blacklist
  // NOTE: Requires a blacklisted recipient in policy.json (managed by Dev 4)
  await sendRequest(`${MOCK_BASE}/data`, "UC5: Blacklist test");

  // Print summary
  const historyRes = await fetch(`${GATEWAY_URL}/agent/history`);
  const history = await historyRes.json();
  logger.payment(`\n=== Done. ${history.payments?.length ?? 0} payments recorded. ===`);
}

main().catch((err) => {
  logger.error(`Demo failed: ${err.message}`);
  process.exit(1);
});
```

**Key points:**
- This script depends on ALL other modules being integrated (gateway, privacy, policy, ledger)
- It's the LAST thing to finalize — build and test payment.ts + mock server first
- Use case 5 requires coordination with Dev 4 (a blacklisted address in policy.json)
- For use case 4, the daily budget is $50 total (from `appConfig.maxPerDay`). At $0.01/request, it takes ~500 requests to exhaust. The demo should be adjusted based on the actual policy thresholds or use a more expensive endpoint.
- The `sendRequest` helper should display the response clearly for the video demo

---

## How the Gateway Will Call You

Dev 1 (@backend) will integrate your module in `gateway.ts` like this:

```typescript
import { createPaymentFetch } from "./payment.js";

// In the payment flow (step 8-9 of handleRequest):
// After privacy.withdrawToBurner() returns a funded burner wallet:
const fetchWithPayment = createPaymentFetch(burner.privateKey);
const response = await fetchWithPayment(agentReq.url);
// → response is the paid API's data (200 OK)
// → txHash may be available from PAYMENT-RESPONSE header
```

**Your exported API MUST match this contract:**
```typescript
// createPaymentFetch takes a burner private key and returns a fetch wrapper
// The wrapper handles 402 → sign → retry automatically
export function createPaymentFetch(
  burnerPrivateKey: `0x${string}`
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
```

**Do not change this function signature without coordinating with Dev 1.**

---

## Environment Requirements

### `.env` variables needed by your module:

```env
# Required for mock server (payTo address for payments)
MOCK_RECEIVER_ADDRESS=<EVM address that receives payments>
MOCK_RECEIVER_PRIVATE_KEY=<private key for the receiver — needed by facilitator for settlement>

# Required for payment.ts (RPC for on-chain reads)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Required for mock server port
MOCK_SERVER_PORT=4021
```

### Wallet funding (before testing):

For **standalone payment tests** (`scripts/test-payment.ts`), the paying wallet needs:
1. **Base Sepolia ETH** (for gas) → https://www.alchemy.com/faucets/base-sepolia
2. **Base Sepolia USDC** (for payments) → https://faucet.circle.com

For **mock server only** (no actual payment), no funding needed — it will just return 402s.

**Ask the user to confirm:**
1. Is `.env` set up with `MOCK_RECEIVER_ADDRESS` and `MOCK_RECEIVER_PRIVATE_KEY`?
2. Is there a funded test wallet for payment tests?
3. Has the facilitator URL been verified?

---

## Track Arc/Circle (x402) — $6,000 Prize Criteria

Your module is the primary deliverable for this track:

| Criterion | How your code satisfies it |
|-----------|---------------------------|
| `@x402/fetch` + `@x402/evm` functional | `createPaymentFetch()` uses both packages with real SDK calls |
| Mock server with x402 middleware | `x402-server.ts` uses `@x402/express` `paymentMiddleware` |
| Payment flow end-to-end | Mock returns 402 → fetch wrapper signs → retries → 200 |
| Architecture diagram in README | Document the 402 flow (separate task, but your code is the reference) |
| Tag: "Agentic Economy with Nanopayments" | Your $0.01 endpoint is literally a nanopayment |

---

## Error Handling

| Scenario | What to do |
|----------|-----------|
| Facilitator unreachable | Let the error bubble — the mock server logs it clearly |
| Payment verification fails | Middleware returns 402 again with error detail — let it propagate |
| Burner has no USDC | The facilitator will reject the payment — error in `PAYMENT-RESPONSE` |
| Mock server port in use | Throw immediately with clear message |
| Invalid burner private key | `privateKeyToAccount()` throws — let it bubble |
| 402 with unknown scheme | `wrapFetchWithPaymentFromConfig` throws — log it |
| Network mismatch | Scheme won't match payment requirements — throws at payload creation |

---

## Fallback — LAST RESORT ONLY

If the x402 facilitator is **completely non-functional** (API down, no testnet support):

1. For the **mock server**: remove `paymentMiddleware`, add manual 402 logic that checks a custom payment header. Return 402 with a JSON body containing price/payTo. This breaks the x402 protocol but preserves the payment gate pattern.

2. For **payment.ts**: instead of `wrapFetchWithPaymentFromConfig`, create a custom fetch wrapper that reads the 402 JSON body and does a direct viem USDC transfer. This is NOT the x402 protocol but demonstrates the concept.

3. **Self-host the facilitator**: The x402 repo (github.com/x402-foundation/x402) has facilitator code. If the hosted one is down, run it locally.

**Do NOT use these fallbacks unless you have exhausted all options and confirmed with the user.**

---

## Implementation Notes (post-dev)

### Découvertes pendant l'implémentation

1. **Header `PAYMENT-REQUIRED` est base64-encodé** — le middleware x402 renvoie le header en base64, pas en JSON brut. Il faut `Buffer.from(header, "base64")` avant `JSON.parse()`. Corrigé dans `test-payment.ts`.

2. **Facilitator URL `https://x402.org/facilitator` fonctionne** — pas besoin de self-host. Le facilitator gère la vérification et le settlement sur Base Sepolia.

3. **Wallet receiver séparé du wallet agent** — `MOCK_RECEIVER_ADDRESS` = `0x3740C4E9696C31b861b6376c8E58F97C9e881099` (wallet dédié, généré pour le mock server). Le wallet agent (EVM_PUBLIC_KEY `0x723B...`) est celui qui paie. Séparation propre : le payer et le receiver sont deux wallets distincts. Note : ce receiver wallet n'a pas besoin d'être funded, il reçoit les USDC via le facilitator.

4. **Prix en string `"$0.01"` marche** — le `ExactEvmScheme` server-side parse correctement les prix en string dollar. La conversion en units USDC (10000 pour $0.01) est automatique.

5. **`toClientEvmSigner(account, publicClient)` avec publicClient** — active le path EIP-3009 (transferWithAuthorization) pour USDC, plus efficace que Permit2.

### Résultats du smoke test (3/3 passed)

- **Test 1** : `GET /data` sans paiement → 402 + header base64 avec requirements (scheme exact, 10000 units, payTo correct)
- **Test 2** : `GET /data` avec `createPaymentFetch` → 200 + données + settlement tx onchain
- **Test 3** : `GET /bulk-data` sans paiement → 402 avec amount 10000000 ($10)

### Fichiers créés

| Fichier | Lignes | Status |
|---------|--------|--------|
| `src/core/payment.ts` | ~50 | Fonctionnel, testé |
| `src/mock/x402-server.ts` | ~95 | Fonctionnel, testé |
| `scripts/test-payment.ts` | ~145 | 3/3 tests passent |
| `src/demo/agent-sim.ts` | ~120 | Prêt, dépend du gateway (Dev 1) |

### En attente

- `agent-sim.ts` ne peut être testé que quand le gateway (Dev 1), privacy (Dev 2), et policy (Dev 4) sont intégrés
- Le header `PAYMENT-RESPONSE` du settlement est aussi base64 — le gateway devra le décoder pour extraire le `txHash`

---

## Validation Checklist

- [x] `src/core/payment.ts` — `createPaymentFetch(key)` returns a working fetch wrapper
- [x] Uses `wrapFetchWithPaymentFromConfig` (NOT the fake `createX402Fetch` from TASKS.md)
- [x] Uses `ExactEvmScheme` from `@x402/evm/exact/client` (client-side, not server-side)
- [x] Uses `toClientEvmSigner` to adapt viem account
- [x] Logs via `logger.payment()`
- [x] `src/mock/x402-server.ts` — starts on port 4021
- [x] Uses `paymentMiddleware` from `@x402/express` (real middleware, NOT a stub)
- [x] Uses `HTTPFacilitatorClient` from `@x402/core/server`
- [x] Uses `ExactEvmScheme` from `@x402/evm/exact/server` (server-side, not client-side)
- [x] 3 endpoints: `/data` ($0.01), `/news` ($0.005), `/bulk-data` ($10)
- [x] `payTo` is `appConfig.mockReceiverAddress`
- [x] Network is `"eip155:84532"` (Base Sepolia)
- [x] Returns real data after payment (not empty responses)
- [x] `scripts/test-payment.ts` — standalone test
- [x] Test 1: Verifies 402 response structure (works without funding)
- [x] Test 2: Verifies paid request flow (requires funded wallet)
- [x] Prints Basescan link for settlement tx (base64 decoded from PAYMENT-RESPONSE header)
- [x] `src/demo/agent-sim.ts` — exercises 5 use cases
- [x] Sends requests to gateway (port 3000), not directly to mock server
- [x] Displays results clearly for the video demo
- [x] All operations log via `logger.payment()`
- [x] No modifications to any file outside your scope
- [x] TypeScript compiles with `strict: true`
