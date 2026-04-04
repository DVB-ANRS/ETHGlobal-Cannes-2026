# ShadowPay — Private Payment Layer for AI Agents

## ETHGlobal Cannes 2026 | Team DVB | April 3-5

---

## Project Overview

ShadowPay is a Node.js/TypeScript backend middleware that sits between AI agents and paid API services. It intercepts HTTP 402 responses (x402 protocol), routes payments through Unlink's privacy pool to break onchain traceability, and enforces human-in-the-loop approval via a physical Ledger device for high-value transactions.

**One-liner**: AI agents pay for APIs privately via USDC nanopayments, with Ledger hardware approval for critical spending.

### Architecture Flow

```
Agent → POST /agent/request → ShadowPay Gateway
  → Proxies HTTP GET to target API
  → Receives 402 Payment Required
  → Policy Engine evaluates amount vs thresholds
    → Under threshold: auto-approve
    → Over threshold: Ledger DMK approval required
  → Privacy Router: Unlink withdraw() → burner wallet
  → Burner wallet signs x402 payment (EIP-3009 via @x402/evm)
  → Retries request with payment header
  → Returns API response to agent
```

### Network

- **Base Sepolia** (chain ID: 84532, EIP-155: `eip155:84532`) — imposed by Unlink SDK
- Token: USDC (testnet)

---

## Tech Stack

| Package | Version | Role |
|---------|---------|------|
| `typescript` | ^5.x | Language |
| `express` | ^4.x | HTTP server |
| `viem` | ^2.x | Ethereum primitives, wallet, signing |
| `@x402/fetch` | latest | Client-side x402 payment wrapping |
| `@x402/evm` | latest | EVM signer + scheme registration for x402 |
| `@x402/core` | latest | x402 protocol core |
| `@x402/server` | latest | Server-side x402 middleware (for mock server) |
| `@unlink-xyz/sdk` | latest | Privacy pool: deposit, withdraw, transfer |
| `@ledgerhq/device-management-kit` | latest | Ledger device connection (USB/BLE) |
| `@ledgerhq/device-signer-kit-ethereum` | latest | Ledger Ethereum transaction signing |
| `tsx` | latest | Dev runner |
| `vitest` | latest | Testing |

---

## Project Structure

```
src/
├── server.ts              # Express app, mounts routes
├── routes/
│   ├── agent.ts           # POST /agent/request, GET /agent/balance, GET /agent/history
│   └── health.ts          # GET /health
├── core/
│   ├── gateway.ts         # Proxies agent requests, detects 402, orchestrates payment
│   ├── policy.ts          # Evaluates spending rules, decides auto vs ledger approval
│   ├── privacy.ts         # Unlink SDK wrapper: deposit, withdraw to burner
│   ├── payment.ts         # x402 client: creates signer from burner, wraps fetch
│   └── ledger.ts          # Ledger DMK: connect, display tx, get approval
├── utils/
│   ├── burner.ts          # Generate ephemeral wallets (viem generatePrivateKey)
│   ├── config.ts          # Load and validate config
│   └── logger.ts          # Structured logging
├── types/
│   └── index.ts           # Shared TypeScript interfaces
├── config/
│   └── policy.json        # Policy engine rules (thresholds, whitelist, blacklist)
├── mock/
│   └── x402-server.ts     # Mock API protected by x402 middleware (@x402/server/express)
└── demo/
    └── agent-sim.ts       # Demo script simulating an AI agent making requests
```

---

## Key Integration Patterns

### x402 Client (Payment Signer)

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(burnerPrivateKey);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// Automatically handles 402 → sign → retry
const response = await fetchWithPayment("https://api.example.com/data");
```

### x402 Mock Server (Payment Receiver)

```typescript
import express from "express";
import { x402Middleware } from "@x402/server/express";
import { ExactEvmServer } from "@x402/evm";

const app = express();
app.use(x402Middleware({
  routes: {
    "GET /data": {
      scheme: "exact",
      network: "eip155:84532", // Base Sepolia
      payTo: RECEIVER_ADDRESS,
      price: "$0.01",
    },
  },
  facilitatorUrl: "https://x402.org/facilitator",
  servers: {
    "eip155:84532": new ExactEvmServer(),
  },
}));
```

### Unlink SDK (Privacy Layer)

```typescript
import { createUnlink } from "@unlink-xyz/sdk";

const unlink = createUnlink({
  apiKey: process.env.UNLINK_API_KEY,
  mnemonic: process.env.AGENT_MNEMONIC,
  network: "base-sepolia",
});

// One-time: fund the privacy pool
await unlink.deposit({ amount: "100", token: "USDC" });

// Per-payment: withdraw to ephemeral burner
await unlink.withdraw({ amount: "0.01", token: "USDC", to: burnerAddress });
```

### Ledger DMK (Human Approval)

```typescript
import { DeviceManager } from "@ledgerhq/device-management-kit";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";

const dmk = new DeviceManager();

// Discover and connect
dmk.startDiscovering().subscribe({
  next: async (device) => {
    const sessionId = await dmk.connect({ deviceId: device.id });
    const signerEth = new SignerEthBuilder({ sdk: dmk, sessionId }).build();
    // Sign approval transaction on device
    const { observable } = signerEth.signTransaction(derivationPath, transaction);
  },
});
```

### Burner Wallet Generation (viem)

```typescript
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const burnerKey = generatePrivateKey();
const burner = privateKeyToAccount(burnerKey);
// Use burner.address for Unlink withdraw target
// Use burnerKey for x402 signer
```

---

## Context7 Library IDs (for documentation lookup)

When you need up-to-date docs, use these Context7 IDs:

| Library | Context7 ID | Notes |
|---------|------------|-------|
| x402 protocol | `/coinbase/x402` | Client + server + facilitator docs (1708 snippets) |
| x402 website docs | `/websites/x402` | Higher-level protocol docs |
| Ledger DMK | `/ledgerhq/device-sdk-ts` | Device Management Kit + Signer SDK |
| Ledger Developer Portal | `/websites/developers_ledger` | Clear Signing, ERC-7730, app docs |
| viem | `/wevm/viem` | Ethereum TS primitives, accounts, signing |

**Usage**: When uncertain about an API, query Context7 with the library ID above before guessing.

---

## Code Rules

### TypeScript Strict

- **NO `any`** — never use `as any`, `: any`, or implicit any. Use proper types or `unknown` + type guards.
- **NO `@ts-ignore`** or `@ts-expect-error` — fix the type issue instead.
- Enable `strict: true` in tsconfig.json.
- Prefer `interface` over `type` for object shapes. Use `type` for unions/intersections.
- All function parameters and return types must be explicitly typed (no inference for public APIs).

### Error Handling

- Use typed custom errors extending `Error` (e.g., `PolicyDeniedError`, `LedgerTimeoutError`).
- Never swallow errors with empty catch blocks.
- Log errors with context (what was being attempted, relevant IDs).
- The gateway must ALWAYS return a response to the agent — even on failure, return a structured error JSON.

### Code Style

- Use `const` by default, `let` only when mutation is needed. Never `var`.
- Prefer early returns over nested if/else.
- Async/await everywhere — no raw `.then()` chains.
- Named exports only — no default exports.
- File names: kebab-case (`policy-engine.ts`, not `PolicyEngine.ts`).
- One concern per file. If a file exceeds ~200 lines, consider splitting.

### Security

- Private keys and mnemonics ONLY in environment variables — never in code, config files, or logs.
- Never log private keys, mnemonics, or full transaction payloads.
- Burner wallets must be generated fresh per payment and discarded after use.
- Validate all external input (agent requests, API responses, policy config).

### Dependencies

- Pin exact versions in package.json for hackathon stability.
- Prefer `viem` over `ethers.js` — it's already the dependency and x402 uses it internally.
- No unnecessary dependencies — if viem can do it, don't add another crypto lib.

### Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`.
- Feature branches: `feat/gateway`, `feat/privacy-router`, etc.
- PR per feature module, squash merge to main.

---

## Environment Variables

```env
# Unlink
UNLINK_API_KEY=           # From https://hackaton-apikey.vercel.app/
AGENT_MNEMONIC=           # BIP-39 mnemonic for the agent's Unlink pool

# Network
BASE_SEPOLIA_RPC_URL=     # e.g., https://sepolia.base.org

# Mock server
MOCK_SERVER_PORT=4021
MOCK_RECEIVER_ADDRESS=    # Address that receives payments on mock x402 server
MOCK_RECEIVER_PRIVATE_KEY= # Private key for mock server (testnet only)

# Gateway
GATEWAY_PORT=3000

# Policy
DEFAULT_MAX_PER_TX=5      # USD threshold for Ledger approval
DEFAULT_MAX_PER_DAY=50    # USD daily limit without Ledger

# Ledger (optional, only needed when Ledger device is connected)
LEDGER_ORIGIN_TOKEN=      # Origin token for Ledger clear signing context
```

---

## API Endpoints

### `POST /agent/request`
Agent sends a URL to call. Gateway proxies it, handles 402, returns the response.
```json
{
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {},
  "body": null
}
```

### `GET /agent/balance`
Returns the agent's private balance in the Unlink pool.

### `GET /agent/history`
Returns payment history (stored in-memory, not onchain).

### `GET /health`
Health check.

---

## Sponsor Tracks

### Unlink — "Best Private Application" ($3,000)
- Must use `@unlink-xyz/sdk` with working deposit + withdraw on Base Sepolia
- Show broken traceability: payment visible onchain but unlinkable to agent

### Arc/Circle — "Best Agentic Economy with Nanopayments" ($6,000)
- x402 protocol with nanopayments (sub-cent USDC payments, gas-free)
- Architecture diagram + working demo of agent paying for API access

### Ledger — "AI Agents x Ledger" ($6,000)
- Ledger DMK as human-in-the-loop for high-value agent payments
- Clear Signing JSON (ERC-7730) for readable tx display on device
- DX feedback in README about Ledger SDK experience

---

## Useful Links

| Resource | URL |
|----------|-----|
| Unlink Docs | https://docs.unlink.xyz |
| Unlink API Key | https://hackaton-apikey.vercel.app/ |
| Unlink Faucet | https://docs.unlink.xyz/faucet |
| x402 Protocol | https://www.x402.org/ |
| x402 GitHub | https://github.com/coinbase/x402 |
| Circle Nanopayments | https://developers.circle.com/gateway/nanopayments |
| Circle Faucet | https://faucet.circle.com |
| Ledger ETHGlobal | https://developers.ledger.com/ethglobal |
| Ledger DMK Docs | https://developers.ledger.com/docs/device-interaction/integration/how_to/dmk |
| Ledger Clear Signing | https://developers.ledger.com/docs/clear-signing/overview |
| Base Sepolia Explorer | https://sepolia.basescan.org |
