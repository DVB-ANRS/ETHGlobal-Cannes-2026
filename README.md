# SecretPay

**Live demo: [https://secretpay.vercel.app](https://secretpay.vercel.app/)**

## Built for ETHGlobal Cannes 2026

SecretPay was built during **ETHGlobal Cannes 2026** (April 4-5, 2026), targeting three bounties: **AI Agents x Ledger** ($6,000), **Best Private Application** ($3,000), and **Best Agentic Economy with Nanopayments** ($6,000). We wanted to answer a simple question: why does every AI agent payment leave a permanent, public trace on-chain?

SecretPay is a **payment middleware for AI agents** that sits between an autonomous agent and paid APIs using the x402 protocol. It makes every transaction **private** (via Unlink ZK privacy pools + disposable burner wallets) and **controlled** (via Ledger hardware approval on high-value payments). The agent asks for data, SecretPay handles the rest — privacy, policy enforcement, and human oversight — in a single HTTP roundtrip.

## How it works

1. An AI agent sends a request to a paid API through SecretPay
2. The API returns **HTTP 402 Payment Required** with a price and recipient
3. SecretPay's **policy engine** evaluates the payment: auto-approve, require Ledger approval, or deny
4. If approved, a **fresh burner wallet** is generated and funded via the Unlink privacy pool (ZK withdraw)
5. The burner signs the x402 payment — the agent's real wallet never appears on-chain
6. The API serves the data, SecretPay returns it to the agent
7. The burner is discarded. No link between the agent and the payment exists on Basescan

```
AI Agent
   │
   ▼  POST /agent/request { url }
SecretPay Gateway (port 3000)
   │
   ├── Proxy request to target API
   │         │
   │         ▼  HTTP 402 { price, payTo, asset }
   │
   ├── Policy Engine ──► auto | ledger | denied
   │         │
   │         ▼  (if ledger) Dashboard approve/reject
   │
   ├── Unlink Privacy Pool ──► ZK withdraw to fresh burner
   │         │
   │         ▼  Burner funded (USDC on Base Sepolia)
   │
   ├── x402 Payment ──► Burner signs & pays
   │         │
   │         ▼  API returns 200 + data
   │
   └── Return data + payment receipt to agent
```

## The problem SecretPay solves

Every time an AI agent pays for an API call, the transaction is permanently visible on-chain: how much it spent, to whom, how often, and from which wallet. This is the equivalent of publishing your bank statement on Twitter. For autonomous agents making hundreds of micropayments per day, this creates a complete behavioral fingerprint — competitors can reverse-engineer your data sources, pricing strategies, and operational patterns.

SecretPay eliminates this by ensuring **no two payments are ever linkable**. Each transaction uses a disposable burner wallet funded through a ZK privacy pool, so on-chain observers see isolated payments from random addresses with no connection to the agent. Meanwhile, a policy engine with hardware-backed approval gives humans the final say on high-value transactions — the agent operates autonomously for small payments but cannot escalate spending without physical confirmation on a Ledger device.

## Policy engine

| Amount | Decision | Behavior |
|--------|----------|----------|
| < $0.10 | `denied` | Below minimum — rejected |
| $0.10 – $0.99 | `auto` | Instant payment, no human intervention |
| $1.00 – $2.00 | `ledger` | Requires approve/reject on Ledger (via dashboard) |
| > $2.00 | `denied` | Above cap — rejected |
| Blacklisted recipient | `denied` | Rejected regardless of amount |

## Parallel burner funding

The burner wallet is always fresh and disposable — it signs the x402 payment, never the agent's main wallet. To handle slow ZK withdrawals on Base Sepolia, we fund burners via **two parallel paths**:

```
Promise.allSettled([
  Path A: Unlink pool → burner    (ZK withdraw, ~30s — privacy proof for track)
  Path B: Backup wallet → burner  (direct ERC-20 transfer, ~3s — speed guarantee)
])
```

At least one must succeed. If both do, the burner has 2x the amount — acceptable for a hackathon. The backup wallet **never** signs x402 payments.

## Setup

```bash
# Install dependencies
pnpm install
cd dashboard && pnpm install && cd ..

# Configure environment
cp .env.example .env
# Fill in: UNLINK_API_KEY, AGENT_MNEMONIC, EVM_PRIVATE_KEY, MOCK_RECEIVER_*
```

```bash
# Terminal 1 — Speculos (Ledger emulator)
./scripts/start-speculos.sh

# Terminal 2 — Mock x402 API server
pnpm mock

# Terminal 3 — SecretPay gateway
pnpm dev

# Terminal 4 — Dashboard
cd dashboard && pnpm dev

# Terminal 5 — Demo agent
pnpm demo
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agent/request` | Submit a request through the payment gateway |
| GET | `/agent/balance` | Get USDC balance in the privacy pool |
| GET | `/agent/history` | List all payment records |
| GET | `/agent/logs` | SSE stream for live transaction updates |
| POST | `/ledger/approve` | Approve pending Ledger transaction (from dashboard) |
| POST | `/ledger/reject` | Reject pending Ledger transaction |
| GET | `/ledger/pending` | Get current pending approval request |
| GET | `/health` | Health check |

## Demo use cases

| # | Scenario | Endpoint | Price | Expected result |
|---|----------|----------|-------|-----------------|
| 1 | Auto-approve | `GET /data` | $0.10 | 200 — payment signed by burner, no human intervention |
| 2 | Ledger approve | `GET /bulk-data` | $1.50 | Dashboard prompt → approve → Speculos signs → 200 |
| 3 | Ledger reject | `GET /bulk-data` | $1.50 | Dashboard prompt → reject → 403 |
| 4 | Blacklist | Blocked recipient | — | 403 — denied by policy engine |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard (React + Vite :5173)                │
│  Privy Auth │ LedgerModal │ TxFeed │ AgentLive │ Stats         │
└──────────────────────┬──────────────────────────────────────────┘
                       │ poll /ledger/pending, /agent/history
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│               SecretPay Gateway (Express :3000)                 │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Gateway  │→ │  Policy  │→ │  Privacy  │→ │   Payment    │  │
│  │ (orchest)│  │ (engine) │  │ (Unlink)  │  │   (x402)     │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘  │
│        │              │             │               │           │
│        │       ┌──────┴──────┐     │               │           │
│        │       │   Ledger    │     │               │           │
│        │       │ (Speculos)  │     │               │           │
│        │       └─────────────┘     │               │           │
└────────┼───────────────────────────┼───────────────┼───────────┘
         │                           │               │
         ▼                           ▼               ▼
   Mock x402 API              Unlink Pool       Base Sepolia
    (:4021)                  (ZK privacy)      (USDC payments)
                                  │
                           ┌──────┴──────┐
                           │Fresh Burner │ ← disposable, unlinkable
                           └─────────────┘
```

## Technology stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (`tsx`) |
| Server | Express 5 |
| Blockchain | viem — Base Sepolia (chain ID 84532) |
| Privacy | `@unlink-xyz/sdk` — ZK privacy pool, burner wallet funding |
| Payments | `@x402/fetch` + `@x402/evm` + `@x402/express` — HTTP 402 payment protocol |
| Hardware | Speculos (Docker) + `@ledgerhq/hw-transport-node-speculos-http` + `@ledgerhq/hw-app-eth` |
| Dashboard | React 18 + Vite + Privy auth + Three.js + Motion |
| Package manager | pnpm |

## On-chain addresses (Base Sepolia)

| Resource | Address |
|----------|---------|
| Unlink Privacy Pool | `0x647f9b99af97e4b79DD9Dd6de3b583236352f482` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |

## Project structure

```
secretpay/
├── src/
│   ├── server.ts              # Express gateway (port 3000)
│   ├── core/
│   │   ├── gateway.ts         # Payment orchestration engine
│   │   ├── privacy.ts         # Unlink SDK: deposit, ZK withdraw to burner
│   │   ├── payment.ts         # x402 fetch wrapper (burner signs)
│   │   ├── policy.ts          # Policy engine: auto / ledger / denied
│   │   └── ledger.ts          # Speculos emulator: approve/reject + signing
│   ├── routes/
│   │   ├── agent.ts           # /agent/* endpoints
│   │   ├── onboard.ts         # /onboard/* endpoints
│   │   └── health.ts          # /health
│   ├── mock/
│   │   └── x402-server.ts     # Simulated paid API (port 4021)
│   ├── demo/
│   │   ├── agent-sim.ts       # Automated demo script (4 use cases)
│   │   └── agent-llm.ts       # LLM-powered agent demo
│   ├── config/
│   │   └── policy.json        # Policy thresholds & blacklist
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   └── utils/
│       ├── burner.ts          # Burner wallet generation + backup funding
│       ├── config.ts          # Environment loader
│       └── logger.ts          # Colored logs for demo
├── dashboard/                 # React + Vite frontend
│   └── src/
│       ├── App.tsx            # Main app (Privy auth, view routing)
│       └── components/
│           ├── LedgerModal.tsx    # Hardware approval UI
│           ├── TxFeed.tsx         # Payment history
│           ├── AgentLive.tsx      # Live agent simulator
│           └── Stats.tsx          # Balance & metrics
├── speculos-apps/             # Ledger firmware ELFs
│   ├── ethereum-nanosp.elf
│   └── ethereum-nanox.elf
└── scripts/
    └── start-speculos.sh      # Docker launcher for Speculos
```

## Track integration

### AI Agents x Ledger — $6,000

SecretPay uses Ledger as the **trust layer between AI autonomy and human control**. The policy engine routes transactions above $1.00 to the Ledger for hardware-backed approval before any funds move.

**Technical implementation:**
- **Speculos emulator** runs the official Ledger Ethereum app (`ethereum-nanosp.elf`) in Docker via `ghcr.io/ledgerhq/speculos`, exposing an HTTP API on port 5001
- **`@ledgerhq/hw-transport-node-speculos-http`** connects to Speculos over HTTP, same transport interface as a physical Nano S Plus
- **`@ledgerhq/hw-app-eth`** calls `signPersonalMessage()` on the emulated device — the signature is cryptographically real (v/r/s recovery)
- The **dashboard React app** polls `/ledger/pending` and renders a `LedgerModal` component where the operator approves or rejects. On approve, the backend navigates Speculos buttons programmatically (right → right → both to confirm) and extracts the hardware signature
- The signature is stored as a `LedgerProof` (`{ message, signature: { v, r, s }, signerAddress }`) in every payment record — auditable proof that a human approved the transaction
- **Human-in-the-loop flow**: Agent requests $1.50 API → policy returns `"ledger"` → gateway pauses → dashboard shows approval modal → operator clicks approve → Speculos signs → burner gets funded → x402 payment executes → data returned to agent
- If the operator doesn't respond within 120 seconds, the transaction is auto-rejected

**Qualification mapping:**
- *Ledger-secured payment flows (x402-style)*: Every x402 payment above $1 requires Ledger approval before the burner wallet is funded
- *Human-in-the-loop*: Operator approve/reject in the React dashboard, hardware signature via Speculos
- *Ledger as trust layer*: Device-backed signature proves human authorization — no transaction executes without cryptographic consent
- *AI copilot with risk surfacing*: Dashboard displays amount, recipient, and policy decision in real-time before the operator decides

### Best Private Application — $3,000

SecretPay makes AI agent payments **unlinkable on-chain**. No observer can connect two payments to the same agent by analyzing Basescan.

**Technical implementation:**
- **`@unlink-xyz/sdk`** (v0.0.2-canary.0) is initialized with the agent's mnemonic and API key, connecting to the Unlink privacy pool at `0x647f9b99af97e4b79DD9Dd6de3b583236352f482` on Base Sepolia
- **Deposit**: `client.deposit()` moves USDC from the agent's wallet into the ZK privacy pool — funds enter the anonymity set
- **Withdraw**: `client.withdraw()` extracts USDC to a **fresh burner wallet** (random private key generated per transaction via `generateBurner()`). The ZK proof ensures the withdrawal is valid without revealing which deposit funded it
- **Transaction polling**: `pollTransactionStatus()` monitors the withdraw until confirmation, with configurable timeout
- **Burner lifecycle**: Each burner exists for exactly one x402 payment. After the payment, the key is discarded. On Basescan, each payment comes from a different address with no shared history
- **Parallel funding** (`Promise.allSettled`): If `BACKUP_BURNER_PRIVATE_KEY` is set, a direct ERC-20 transfer races the ZK withdraw to guarantee the burner is funded within seconds
- **Balance tracking**: `client.getBalance()` returns the agent's current pool balance in USDC

**Qualification mapping:**
- *Uses `@unlink-xyz/sdk`*: Core dependency — deposit, withdraw, getBalance, pollTransactionStatus
- *Working demo on Base Sepolia*: Full E2E flow with Basescan-verifiable burner transactions
- *Private payment flow*: Agent deposits → ZK withdraw to burner → burner pays API → burner discarded. Sender privacy is preserved by design

### Best Agentic Economy with Nanopayments — $6,000

SecretPay enables **autonomous AI agents to pay for API calls per-use** via the x402 HTTP payment protocol, with zero human intervention for small amounts.

**Technical implementation:**
- **`@x402/fetch`** wraps the standard `fetch()` API with x402 payment handling. When an API returns HTTP 402, the wrapper automatically extracts payment requirements from the `X-PAYMENT` header (base64-encoded JSON: `{ accepts: [{ amount, payTo, asset, network }] }`)
- **`@x402/evm`** provides `ExactEvmScheme` for Base Sepolia (chain ID 84532) — the burner wallet's private key is passed to create a signer that produces EVM-compatible payment proofs
- **`@x402/express`** middleware powers the mock x402 server (port 4021) — it validates incoming payment headers against the facilitator at `https://x402.org/facilitator` and gates access to API endpoints
- **Payment flow**: `createPaymentFetch(burnerPrivateKey)` returns a fetch function that intercepts 402 responses, signs a payment with the burner key, attaches the payment header, and retries — the API serves data on the second request
- **Mock API endpoints** simulate real pricing: `/data` ($0.10), `/weather` ($0.02), `/sentiment` ($0.05), `/bulk-data` ($1.50), `/premium-report` ($2.00) — demonstrating the full range from nanopayments to capped transactions
- **Agent autonomy**: For amounts below $1.00, the policy engine returns `"auto"` — the gateway funds a burner and completes the payment without any human input. The agent demo (`agent-sim.ts`) chains multiple API calls showing fully autonomous agent-to-API commerce

**Qualification mapping:**
- *AI agents paying for API calls per-use*: Each request triggers an independent x402 micropayment from a burner wallet
- *Autonomous payment flows*: Auto-approve policy for sub-$1 payments — no human intervention needed
- *Functional MVP + architecture diagram*: Working gateway + dashboard + demo script + architecture in this README
- *Uses x402 protocol*: `@x402/fetch`, `@x402/evm`, `@x402/express` for the complete payment lifecycle

## DX Feedback (Ledger Track — required)

**Speculos:**
- Excellent emulator — the HTTP API makes programmatic button navigation straightforward. Running the official Ethereum app ELF in Docker gives confidence that signing behavior matches real hardware.
- Pain point: no documentation on automating `signPersonalMessage` approval via the API. We had to reverse-engineer the button sequence (right → right → both) by trial and error.
- The headless display mode works well for CI/demo, but debugging signing failures is hard without visual feedback on what screen the emulator is showing.

**`@ledgerhq/hw-transport-node-speculos-http`:**
- Drop-in replacement for USB transport — switching between Speculos and a real device requires changing one import. Clean abstraction.
- The transport occasionally hangs on long messages. A configurable timeout would help.

**`@ledgerhq/hw-app-eth`:**
- `signPersonalMessage()` works as expected. The v/r/s signature format integrates directly with viem for address recovery.
- Would be valuable to have built-in support for structured data signing (EIP-712) alongside personal messages, especially for x402 payment proofs.

## Environment variables

```env
UNLINK_API_KEY=              # Unlink privacy pool API key
AGENT_MNEMONIC=              # BIP-39 mnemonic for agent identity
EVM_PRIVATE_KEY=             # Private key for USDC deposits/approvals
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MOCK_SERVER_PORT=4021
MOCK_RECEIVER_ADDRESS=       # Address receiving x402 payments (mock)
MOCK_RECEIVER_PRIVATE_KEY=   # Testnet key for mock receiver
GATEWAY_PORT=3000
DEFAULT_MAX_PER_TX=2
BACKUP_BURNER_PRIVATE_KEY=   # Optional — parallel burner funding
LEDGER_MODE=speculos         # speculos | terminal
SPECULOS_HOST=http://127.0.0.1
SPECULOS_API_PORT=5001
```

## Team

Built by four students from **DeVinci Blockchain** (Paris, France).

| Dev | Scope |
|-----|-------|
| **@backend** | Server, routes, gateway orchestration, types, config |
| **@privacy** | Unlink SDK integration, burner wallet system |
| **@payment** | x402 payment protocol, mock server, demo scripts |
| **@trust** | Policy engine, Ledger emulator, dashboard LedgerModal |
