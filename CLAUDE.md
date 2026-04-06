# SecretPay — CLAUDE.md

## Context

**ETHGlobal Cannes 2026 | Team DeVinci Blockchain | April 4-5, 2026**
Hackathon project — completed and submitted.
Targeting 3 sponsor tracks: AI Agents x Ledger ($6k), Best Private Application ($3k), Best Agentic Economy with Nanopayments ($6k).

SecretPay is a **backend middleware (Node.js/TypeScript)** between an AI agent and paid APIs (x402 protocol). It makes payments **private** (Unlink ZK privacy pool + disposable burner wallets) and **controlled** (Ledger hardware approval on high-value amounts).

---

## Tech Stack

- **Runtime**: Node.js + TypeScript (`tsx` for dev)
- **Server**: Express 5 (port 3000)
- **Blockchain**: viem — Base Sepolia only (chain ID 84532)
- **Privacy**: `@unlink-xyz/sdk` — ZK pool, disposable burner wallets
- **Payments**: `@x402/fetch` + `@x402/evm` + `@x402/core` + `@x402/express`
- **Ledger Emulator**: Speculos (Docker) + `@ledgerhq/hw-transport-node-speculos-http` + `@ledgerhq/hw-app-eth`
- **Dashboard**: React 18 + Vite + Privy auth + Three.js + Motion
- **LLM Agent**: Groq SDK (llama-3.3-70b)
- **Package manager**: pnpm

---

## On-chain Addresses (Base Sepolia)

| Resource | Address |
|----------|---------|
| Unlink Pool | `0x647f9b99af97e4b79DD9Dd6de3b583236352f482` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |

---

## Environment Variables

Two env files:
- `.env` — core backend config (from `.env.example`)
- `.env.local` — local overrides, secrets, Groq key (from `.env.local.example`)

Required vars: `UNLINK_API_KEY`, `AGENT_MNEMONIC`, `EVM_PRIVATE_KEY`, `MOCK_RECEIVER_ADDRESS`, `MOCK_RECEIVER_PRIVATE_KEY`

Optional: `BACKUP_BURNER_PRIVATE_KEY` (parallel burner funding), `GROQ_API_KEY` (LLM agent)

---

## File Structure

```
src/
├── server.ts                  # Express app entry point
├── routes/
│   ├── agent.ts               # POST /agent/request, GET /agent/balance, GET /agent/history, GET /agent/logs
│   ├── agents.ts              # Multi-agent support
│   ├── onboard.ts             # Agent onboarding / vault setup
│   └── health.ts              # GET /health
├── core/
│   ├── gateway.ts             # Payment orchestration (10-step flow)
│   ├── policy.ts              # Policy engine: auto / ledger / denied
│   ├── privacy.ts             # Unlink SDK: deposit, ZK withdraw to burner
│   ├── payment.ts             # x402 client: createPaymentFetch(burnerKey)
│   ├── ledger.ts              # Speculos emulator: approve/reject + signPersonalMessage
│   ├── vault-manager.ts       # Multi-agent vault management
│   └── agent-runner.ts        # LLM agent orchestration (Groq)
├── utils/
│   ├── burner.ts              # generateBurner() + fundBurnerFromBackup()
│   ├── config.ts              # Env loading + validation
│   └── logger.ts              # Colored logs for demo
├── types/
│   └── index.ts               # AgentRequest, AgentResponse, PaymentRecord, PolicyDecision
├── config/
│   └── policy.json            # maxPerTransaction, thresholds, blacklist
├── mock/
│   └── x402-server.ts         # Simulated paid API (port 4021)
└── demo/
    ├── agent-sim.ts           # Automated 4 use-case demo
    └── agent-llm.ts           # LLM-powered agent demo

dashboard/                     # React + Vite frontend (deployed on Vercel)
├── src/
│   ├── App.tsx                # Privy auth, view routing
│   ├── main.tsx               # React entry
│   └── components/
│       ├── Header.tsx         # Navigation
│       ├── Landing.tsx        # Welcome / pitch screen
│       ├── LedgerModal.tsx    # Hardware approval UI (polls /ledger/pending)
│       ├── AgentForm.tsx      # Agent config form
│       ├── AgentLive.tsx      # Live simulator
│       ├── TxFeed.tsx         # Payment history
│       ├── Stats.tsx          # Balance & metrics
│       ├── DecryptedText.tsx  # Encrypted data display
│       └── SidePanel.tsx      # Settings panel
```

---

## Payment Flow (gateway.ts)

```
1. Proxy HTTP request to target URL
2. If 200 → return directly
3. If 402 → extract price + recipient from headers
4. policy.evaluate(price, recipient) → auto | ledger | denied
5. If denied → return 403
6. If ledger → push to pending, dashboard polls, operator approve/reject (120s timeout)
7. privacy.withdrawToBurner(amount) → parallel funding (Unlink ZK + backup ERC-20)
8. payment.createPaymentFetch(burnerPrivateKey) → x402-enabled fetch
9. Retry request with payment → API returns data
10. Store PaymentRecord + return to agent
```

---

## Parallel Burner Funding (privacy.ts + burner.ts)

```
withdrawToBurner(amount)
  1. generateBurner() → fresh { address, privateKey }
  2. Promise.allSettled([
       Path A: Unlink pool → burner   (ZK withdraw, ~30s)
       Path B: Backup wallet → burner  (ERC-20 transfer, ~3s)
     ])
  3. At least one must succeed
  4. Return fresh burner credentials
```

- Path B only runs if `BACKUP_BURNER_PRIVATE_KEY` is set
- Backup wallet never signs x402 payments — only the fresh burner does

---

## Policy Engine (policy.json)

| Amount | Decision |
|--------|----------|
| < $0.10 | `denied` (below minimum) |
| $0.10 - $0.99 | `auto` |
| $1.00 - $2.00 | `ledger` (hardware approval) |
| > $2.00 | `denied` (above cap) |
| Blacklisted recipient | `denied` |

---

## NPM Scripts

```bash
pnpm dev          # Start SecretPay gateway
pnpm mock         # Start mock x402 API server
pnpm demo         # Run 4-scenario automated demo
pnpm agent        # Start LLM-powered agent (needs GROQ_API_KEY)
pnpm build        # TypeScript compile
```

---

## Deployments

- **Dashboard**: Vercel — https://secretpay.vercel.app
- **Backend**: Docker (Dockerfile + docker-compose.yml with Speculos)
- **Demo video**: https://youtu.be/OhiKjd5AnFk

---

## Code Rules

- TypeScript strict mode
- No unit tests — E2E focus only
- Structured logs at each gateway step (for demo visibility)
- No secrets in repo (`.env` and `.env.local` are gitignored)
- All user-facing text in English
