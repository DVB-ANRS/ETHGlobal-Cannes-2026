# SecretPay

Privacy-first payment middleware for AI agents. Built at [ETHGlobal Cannes 2026](https://ethglobal.com/events/cannes2026) by **DeVinci Blockchain** (Paris, Blockchain) - four hackers, 36 hours, [Sofiane Ben Taleb](https://github.com/gamween), [Ramzy Chibani](https://github.com/DZ-Ramzy), [Armand Séchon](https://github.com/STOOOKEEE), [Noé Wales](https://github.com/CHAAIISE).


---

## The Problem

Every time an AI agent pays for an API call, the transaction is permanently visible on-chain — how much it spent, to whom, how often, and from which wallet. For autonomous agents making hundreds of micropayments per day, this creates a complete behavioral fingerprint. Competitors can reverse-engineer data sources, pricing strategies, and operational patterns.

## The Solution

**SecretPay** sits between an AI agent and paid APIs (via the [x402](https://github.com/coinbase/x402) protocol). It makes every payment **private** through Unlink ZK privacy pools and disposable burner wallets, and **controlled** through Ledger hardware approval on high-value transactions.

No two payments are ever linkable on-chain. The agent operates autonomously for small amounts, but cannot escalate spending without physical confirmation on a Ledger device.

## Links

- **GitHub Repository**: https://github.com/DVB-ANRS/SecretPay
- **App**: https://secretpay.vercel.app
- **Youtube Presentation**: https://youtu.be/OhiKjd5AnFk

## How It Works

```
AI Agent
   |
   v  POST /agent/request { url }
SecretPay Gateway (:3000)
   |
   |-- 1. Proxy request to target API
   |         |
   |         v  HTTP 402 { price, payTo, asset }
   |
   |-- 2. Policy Engine --> auto | ledger | denied
   |         |
   |         v  (if ledger) Dashboard approve/reject
   |
   |-- 3. Unlink Privacy Pool --> ZK withdraw to fresh burner
   |         |
   |         v  Burner funded (USDC on Base Sepolia)
   |
   |-- 4. x402 Payment --> Burner signs & pays
   |         |
   |         v  API returns 200 + data
   |
   '-- 5. Return data + payment receipt to agent
```

1. The agent sends a request to a paid API through SecretPay
2. The API returns **HTTP 402** with a price and recipient
3. The **policy engine** evaluates: auto-approve, require Ledger approval, or deny
4. A **fresh burner wallet** is generated and funded via the Unlink privacy pool (ZK withdraw)
5. The burner signs the x402 payment — the agent's real wallet never appears on-chain
6. The API serves the data, SecretPay returns it to the agent
7. The burner is discarded — no link between the agent and the payment exists on Basescan

## Architecture

```
+-----------------------------------------------+
|         Dashboard (React + Vite :5173)         |
|   Privy Auth | LedgerModal | TxFeed | Stats   |
+---------------------+-------------------------+
                      | poll /ledger/pending
                      v
+-----------------------------------------------+
|        SecretPay Gateway (Express :3000)       |
|                                                |
|  Gateway --> Policy --> Privacy --> Payment     |
|  (orchestrate) (engine)  (Unlink)   (x402)     |
|                  |                              |
|               Ledger                            |
|             (Speculos)                          |
+--------+------------+---------------+----------+
         |            |               |
         v            v               v
   Mock x402 API  Unlink Pool    Base Sepolia
     (:4021)     (ZK privacy)   (USDC payments)
                      |
               Fresh Burner  <-- disposable, unlinkable
```

## Policy Engine

| Amount | Decision | Behavior |
|--------|----------|----------|
| < $0.10 | `denied` | Below minimum |
| $0.10 - $0.99 | `auto` | Instant payment, no human intervention |
| $1.00 - $2.00 | `ledger` | Requires approve/reject on Ledger device |
| > $2.00 | `denied` | Above cap |
| Blacklisted recipient | `denied` | Rejected regardless of amount |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Server | Express 5 |
| Blockchain | viem - Base Sepolia (chain 84532) |
| Privacy | [@unlink-xyz/sdk](https://www.npmjs.com/package/@unlink-xyz/sdk) - ZK privacy pool + burner wallets |
| Payments | [@x402](https://github.com/coinbase/x402) - HTTP 402 payment protocol |
| Hardware | [Speculos](https://github.com/LedgerHQ/speculos) + @ledgerhq/hw-app-eth - Ledger emulator |
| Frontend | React 18 + Vite + [Privy](https://privy.io) + Three.js |

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/)
- Docker (for Speculos)

### Install

```bash
pnpm install
cd dashboard && pnpm install && cd ..
```

### Configure

```bash
cp .env.example .env
# Fill in: UNLINK_API_KEY, AGENT_MNEMONIC, EVM_PRIVATE_KEY, MOCK_RECEIVER_*
```

### Run

```bash
# Terminal 1 - Speculos (Ledger emulator)
docker compose up speculos

# Terminal 2 - Mock x402 API server
pnpm mock

# Terminal 3 - SecretPay gateway
pnpm dev

# Terminal 4 - Dashboard
cd dashboard && pnpm dev

# Terminal 5 - Run the demo
pnpm demo
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agent/request` | Submit a request through the payment gateway |
| `GET` | `/agent/balance` | Current USDC balance in the privacy pool |
| `GET` | `/agent/history` | List all payment records |
| `GET` | `/agent/logs` | SSE stream for live transaction updates |
| `POST` | `/ledger/approve` | Approve pending Ledger transaction |
| `POST` | `/ledger/reject` | Reject pending Ledger transaction |
| `GET` | `/ledger/pending` | Current pending approval request |
| `GET` | `/health` | Health check |

## Project Structure

```
src/
  server.ts              # Express gateway entry point
  core/
    gateway.ts           # Payment orchestration (10-step flow)
    privacy.ts           # Unlink SDK: deposit, ZK withdraw to burner
    payment.ts           # x402 fetch wrapper (burner signs)
    policy.ts            # Policy engine: auto / ledger / denied
    ledger.ts            # Speculos emulator: approve/reject + signing
  routes/
    agent.ts             # /agent/* endpoints
    health.ts            # /health
  mock/
    x402-server.ts       # Simulated paid API (:4021)
  demo/
    agent-sim.ts         # Automated demo (4 use cases)
    agent-llm.ts         # LLM-powered agent demo (Groq)
  config/
    policy.json          # Policy thresholds & blacklist
  utils/
    burner.ts            # Burner wallet generation + backup funding
    config.ts            # Environment loader
    logger.ts            # Colored logs for demo
dashboard/               # React + Vite frontend (Vercel)
```

## Bounty Tracks

### Unlink - Best Private Application

SecretPay makes AI agent payments **unlinkable on-chain**. Each transaction uses a disposable burner wallet funded through a ZK privacy pool (`@unlink-xyz/sdk`). On Basescan, each payment appears from a different address with no shared history.

- `client.deposit()` moves USDC into the anonymity set
- `client.withdraw()` extracts USDC to a fresh burner via ZK proof
- Parallel funding (`Promise.allSettled`) races ZK withdraw (~30s) against direct ERC-20 transfer (~3s) to guarantee speed
- Each burner exists for exactly one payment, then the key is discarded

### x402 (Coinbase) - Best Agentic Economy with Nanopayments

SecretPay enables autonomous AI agents to pay for API calls per-use via the x402 HTTP payment protocol. `@x402/fetch` wraps `fetch()` to automatically handle HTTP 402 responses, extract payment requirements, sign with the burner wallet, and retry.

- Sub-$1 payments are fully autonomous (no human intervention)
- Mock API with tiered pricing: `/data` ($0.10), `/weather` ($0.02), `/bulk-data` ($1.50)
- `@x402/evm` + `@x402/express` for the complete payment lifecycle

### Ledger - AI Agents x Ledger

SecretPay uses Ledger as the **trust layer between AI autonomy and human control**. Payments above $1 require hardware-backed approval before any funds move.

- Speculos emulator runs the official Ethereum app (`ethereum-nanosp.elf`) in Docker
- `@ledgerhq/hw-transport-node-speculos-http` + `@ledgerhq/hw-app-eth` for real cryptographic signatures
- Dashboard polls `/ledger/pending` and renders an approval modal with 120s timeout
- `LedgerProof` with `signPersonalMessage()` provides auditable proof of human authorization

## DX Feedback (Ledger)

**Speculos:** Excellent emulator - the HTTP API makes programmatic button navigation straightforward. Running the official Ethereum app ELF in Docker gives confidence that signing behavior matches real hardware. Pain point: no documentation on automating `signPersonalMessage` approval via the API - we had to reverse-engineer the button sequence (right, right, both) by trial and error.

**@ledgerhq/hw-transport-node-speculos-http:** Drop-in replacement for USB transport. Switching between Speculos and a real device requires changing one import. The transport occasionally hangs on long messages - a configurable timeout would help.

**@ledgerhq/hw-app-eth:** `signPersonalMessage()` works as expected. The v/r/s signature format integrates directly with viem for address recovery. Would be valuable to have built-in EIP-712 support for structured data signing, especially for payment proofs.

## License

MIT
