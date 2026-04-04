# SecretPay — CLAUDE.md

## Contexte

**ETHGlobal Cannes 2026 | Team DVB | 4-5 avril 2026**
Hackathon 36h. ~15h restantes. Deadline soumission : 5 avril 2026.
**Objectif** : gagner les 3 tracks sponsors = $15,000 max.

SecretPay est un **middleware backend Node.js/TypeScript** qui s'intercale entre un AI agent et des APIs payantes (protocole x402). Il rend les paiements **privés** (via Unlink privacy pool + burner wallets) et **contrôlés** (approbation Ledger hardware sur gros montants).

---

## Stack technique

- **Runtime** : Node.js + TypeScript (`tsx` pour le dev)
- **Serveur** : Express (port 3000)
- **Blockchain** : viem — Base Sepolia uniquement (chain ID 84532)
- **Privacy** : `@unlink-xyz/sdk` — pool ZK, burner wallets jetables
- **Paiements** : `@x402/fetch` + `@x402/evm` + `@x402/core` + `@x402/express`
- **Hardware** : `@ledgerhq/device-management-kit` + `@ledgerhq/device-signer-kit-ethereum`
- **Package manager** : pnpm

---

## Adresses blockchain (Base Sepolia)

| Ressource | Adresse / URL |
|-----------|---------------|
| Pool Unlink | `0x647f9b99af97e4b79DD9Dd6de3b583236352f482` |
| USDC Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |

---

## Variables d'environnement (`.env`)

```env
EVM_PRIVATE_KEY=         # 0x... private key of the EVM wallet holding USDC
UNLINK_API_KEY=          # https://hackaton-apikey.vercel.app/
AGENT_MNEMONIC=          # BIP-39 mnemonic du wallet agent
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MOCK_SERVER_PORT=4021
MOCK_RECEIVER_ADDRESS=   # Adresse receiver du mock server
MOCK_RECEIVER_PRIVATE_KEY=
GATEWAY_PORT=3000
DEFAULT_MAX_PER_TX=5
DEFAULT_MAX_PER_DAY=50
LEDGER_ORIGIN_TOKEN=     # Optionnel
```

---

## Structure des fichiers

```
src/
├── server.ts                  # Express app (port 3000)
├── routes/
│   ├── agent.ts               # POST /agent/request, GET /agent/balance, GET /agent/history
│   └── health.ts              # GET /health
├── core/
│   ├── gateway.ts             # Chef d'orchestre du flow de paiement
│   ├── policy.ts              # Policy Engine : auto / ledger / denied (Dev 4 — en cours)
│   ├── privacy.ts             # Unlink SDK : deposit, withdraw vers burner
│   ├── payment.ts             # x402 client : createX402Fetch(burnerKey)
│   └── ledger.ts              # Ledger DMK : connect, requestApproval, disconnect (Dev 4 — en cours)
├── utils/
│   ├── burner.ts              # generatePrivateKey() + privateKeyToAccount() (viem)
│   ├── config.ts              # Chargement .env + validation
│   └── logger.ts              # Logs colorés pour la demo
├── types/
│   └── index.ts               # AgentRequest, AgentResponse, PaymentRecord, PolicyDecision
├── config/
│   └── policy.json            # maxPerTransaction:5, maxPerDay:50, blacklist:[]
├── mock/
│   └── x402-server.ts         # API payante simulée (port 4021)
└── demo/
    └── agent-sim.ts           # Script qui enchaîne les 5 use cases
scripts/
├── test-gateway.ts            # Test audit du gateway (24 tests)
├── test-privacy.ts            # Test standalone privacy module
└── test-payment.ts            # Test standalone payment module
```

---

## Ownership des modules (règle : ne pas toucher au code des autres)

| Dev | Alias | Fichiers owned |
|-----|-------|----------------|
| Dev 1 | `@backend` | `server.ts`, `routes/`, `core/gateway.ts`, `types/`, `utils/config.ts`, `utils/logger.ts` |
| Dev 2 | `@privacy` | `core/privacy.ts`, `utils/burner.ts` |
| Dev 3 | `@payment` | `core/payment.ts`, `mock/x402-server.ts`, `demo/agent-sim.ts` |
| Dev 4 | `@trust` | `core/policy.ts`, `core/ledger.ts`, `config/policy.json`, dashboard (optionnel) |

**Si tu dois modifier le fichier d'un autre → prévenir d'abord sur Slack/Discord. Merge sur `main` uniquement quand le module tourne en isolation.**

---

## Flow de paiement (gateway.ts)

```
1. Proxy HTTP vers l'URL cible
2. Si 200 → retourner directement
3. Si 402 → extraire prix + destinataire
   Note : le header x402 PAYMENT-REQUIRED est en base64 — décoder avant de parser le JSON
4. policy.evaluate(prix, destinataire) → auto | ledger | denied
5. Si denied → retourner 403
6. Si ledger → ledger.requestApproval() → attendre approve/reject
7. privacy.withdrawToBurner(montant) → { address, privateKey }
8. payment.createX402Fetch(burnerPrivateKey) → fetch wrapper
9. Retenter la requête → l'API sert les données
   Note : le txHash est extrait du header PAYMENT-RESPONSE (aussi base64) dans la réponse 200
10. Stocker PaymentRecord + retourner à l'agent
```

---

## Policy Engine (policy.json)

```json
{
  "maxPerTransaction": 5,
  "maxPerDay": 50,
  "allowedRecipients": [],
  "blockedRecipients": []
}
```

Logique :
- recipient blacklisté → `"denied"`
- amount > $100 (hard cap) → `"denied"`
- dépense jour > maxPerDay → `"ledger"`
- amount > maxPerTransaction → `"ledger"`
- sinon → `"auto"`

---

## 5 Use Cases à démontrer

| # | Scénario | Endpoint mock | Prix | Résultat attendu |
|---|----------|--------------|------|-----------------|
| 1 | Auto-approve | `GET /data` | $0.01 | 200 + log AUTO-APPROVE |
| 2 | Ledger approve | `GET /bulk-data` | $10 | Ledger prompt → approve → 200 |
| 3 | Ledger reject | `GET /bulk-data` | $10 | Ledger prompt → reject → 403 |
| 4 | Budget jour | 50× `/data` | $0.01×50 | Bascule en "ledger" à $50 |
| 5 | Blacklist | URL blacklistée | - | 403 "denied" immédiat |

---

## Tracks sponsors (critères de submission)

### Track Unlink — $3,000
- `@unlink-xyz/sdk` utilisé (deposit, withdraw, getBalance)
- ≥1 tx privée réussie sur Base Sepolia
- Liens Basescan montrant les burners non-liés
- Vidéo ≤ 3 min + repo GitHub

### Track Arc/Circle (x402) — $6,000
- `@x402/fetch` + `@x402/evm` fonctionnels
- Diagramme d'architecture dans le README
- Tag soumission : "Agentic Economy with Nanopayments"

### Track Ledger — $6,000
- `@ledgerhq/device-management-kit` utilisé
- Human-in-the-loop : approve/reject fonctionnel
- Clear Signing JSON (ERC-7730) créé pour type `AgentPayment`
- Section "DX Feedback" dans le README (obligatoire)

---

## Comment lancer

```bash
# Terminal 1 — Mock x402 server
pnpm tsx src/mock/x402-server.ts

# Terminal 2 — SecretPay gateway
pnpm dev

# Terminal 3 — Demo agent
pnpm tsx src/demo/agent-sim.ts

# Tests standalone par module
pnpm tsx scripts/test-gateway.ts
pnpm tsx scripts/test-privacy.ts
pnpm tsx scripts/test-payment.ts    # nécessite mock server running
```

---

## API Gateway

```
POST /agent/request   { url, method?, headers?, body? }
GET  /agent/balance   → balance dans le pool Unlink
GET  /agent/history   → liste des PaymentRecord en mémoire
GET  /health          → { status: "ok" }
```

---

## Règles de code

- TypeScript strict (`strict: true`)
- Pas de tests unitaires — pas le temps. Focus sur le E2E.
- Logs structurés dans chaque étape du gateway (pour la demo)
- Aucun secret dans le repo (`.env` dans `.gitignore`)
- Pas de dashboard tant que le E2E n'est pas solide

---

## Fallbacks si ça plante

| Problème | Solution |
|----------|----------|
| Unlink SDK bloqué | Simuler le pool : transfers directs viem + documenter le workaround |
| x402 facilitator down | Self-host depuis le repo coinbase/x402 |
| Ledger USB instable | BLE → Speculos (simulateur) → montrer le code dans la vidéo |
| Withdraw trop lent | Pré-fund 3-5 burners en avance (pool de burners) |
| Flow E2E cassé à H14 | Scope réduit : juste auto-approve. Ledger = demo séparée |

---

## Planning 15h restantes (à partir de maintenant)

| Heure | Priorité |
|-------|----------|
| H0→H2 | Setup repo, install packages, server.ts minimal qui démarre |
| H2→H6 | 4 modules en isolation : gateway stub, privacy.ts, payment.ts, policy.ts |
| H6→H10 | Intégration gateway — flow auto-approve E2E fonctionnel |
| H10→H13 | Ledger intégré, 5 use cases passent |
| H13→H14 | Privacy proof sur Basescan, dry-run x3 |
| H14→H15 | Vidéo (3 min), README, submission |

---

## Script vidéo (3 min)

| Temps | Contenu |
|-------|---------|
| 0:00-0:25 | Problème : Basescan montre tout (wallet public) |
| 0:25-0:50 | Solution : schéma archi SecretPay |
| 0:50-1:20 | Demo auto-approve $0.01 — logs en direct |
| 1:20-2:00 | Demo Ledger $10 — device à la caméra, approve physique |
| 2:00-2:15 | Demo blacklist — refus instantané |
| 2:15-2:45 | Preuve onchain : Basescan, burners différents, non-reliables |
| 2:45-3:00 | Closing pitch |

---

## Pitch 30 secondes

> "Chaque fois qu'un AI agent paie pour un service, le monde entier voit combien, à qui, et à quelle fréquence. C'est comme publier votre relevé bancaire sur Twitter. SecretPay résout ça : les agents paient en USDC via le protocole x402, les transactions passent par un privacy pool Unlink via des burner wallets jetables, et les dépenses critiques sont approuvées physiquement sur un Ledger. Privacy pour les agents, contrôle pour les humains."

---

## Implementation Status

### Module Status

| Module | Dev | Status | Test Script |
|--------|-----|--------|-------------|
| **Gateway** (`src/core/gateway.ts`) | Dev 1 @backend | Functional — full 10-step flow with injectable DI stubs. 24/24 tests passing. | `scripts/test-gateway.ts` |
| **Privacy** (`src/core/privacy.ts`, `src/utils/burner.ts`) | Dev 2 @privacy | Functional — real `@unlink-xyz/sdk` integration (deposit, withdraw, getBalance). Burner wallet generation via viem. | `scripts/test-privacy.ts` |
| **Payment** (`src/core/payment.ts`, `src/mock/x402-server.ts`) | Dev 3 @payment | Functional — real `@x402/fetch` + `@x402/express`. Mock server with 3 priced endpoints. Payment fetch wrapper with EIP-3009 support. | `scripts/test-payment.ts` |
| **Demo** (`src/demo/agent-sim.ts`) | Dev 3 @payment | Functional — exercises all 5 use cases via POST /agent/request. | N/A (run manually) |
| **Policy** (`src/core/policy.ts`) | Dev 4 @trust | **NOT DELIVERED** — gateway uses inline stub (auto <$5, ledger >$5). | — |
| **Ledger** (`src/core/ledger.ts`) | Dev 4 @trust | **NOT DELIVERED** — gateway uses stub that auto-approves. | — |

### Technical Discoveries

#### x402 SDK (v2.9.0) — Key Differences from TASKS.md

- **Import names differ**: use `wrapFetchWithPaymentFromConfig` (not `createX402Fetch`), `ExactEvmScheme` + `toClientEvmSigner`
- **Client vs Server `ExactEvmScheme`**: `@x402/evm/exact/client` vs `@x402/evm/exact/server` — different classes, do NOT mix
- **402 header is base64-encoded**: `PAYMENT-REQUIRED` header contains base64(JSON) with `{ x402Version, accepts: [{ amount, payTo, asset, ... }] }`
- **Amount in raw units**: The `amount` field in 402 headers is in token base units (USDC = 6 decimals). Gateway's `parse402()` converts raw → human-readable (e.g. `"10000"` → `"0.01"`)
- **Settlement response**: 200 responses include `PAYMENT-RESPONSE` header (base64 JSON) with `{ transaction: "0x..." }` — the settlement txHash on Basescan
- **Facilitator URL**: `https://x402.org/facilitator` — used by mock server for payment verification/settlement
- **`paymentMiddleware` signature**: `paymentMiddleware(routes, resourceServer, { testnet: true }, undefined, true)` — 5th param enables facilitator sync on startup

#### Unlink SDK (v0.0.2-canary.0) — Key Differences from TASKS.md

- **`createUnlink()` requires full config**: `{ engineUrl, apiKey, account: unlinkAccount.fromMnemonic({ mnemonic }), evm: unlinkEvm.fromViem({ walletClient, publicClient }) }`
- **Engine URL**: `https://staging-api.unlink.xyz` (hardcoded in privacy.ts)
- **Must call `ensureRegistered()`** before any operation
- **Must call `ensureErc20Approval()`** before first deposit (Permit2)
- **Token is ERC-20 address** not string "USDC": `"0x036CbD53842c5426634e7929541eC2318f3dCF7e"`
- **Amounts in wei** (6 decimals for USDC): use `parseUnits`/`formatUnits` from viem
- **`withdraw()` uses `recipientEvmAddress`** not `to`
- **Transaction polling**: `pollTransactionStatus(txId, { timeoutMs })` — terminal states: `"relayed"`, `"processed"`, `"failed"`

### Wallet Setup (.env)

Two separate wallets are required:

| Variable | Role | Description |
|----------|------|-------------|
| `EVM_PRIVATE_KEY` | Agent/Payer wallet | Funds the privacy pool, used as fallback payer. Needs Base Sepolia ETH (gas) + USDC. |
| `AGENT_MNEMONIC` | Unlink account | BIP-39 mnemonic for Unlink SDK (EdDSA signing for withdrawals). |
| `MOCK_RECEIVER_ADDRESS` | Receiver wallet | Dedicated address for the mock x402 server's `payTo`. |
| `MOCK_RECEIVER_PRIVATE_KEY` | Receiver key | Private key of the receiver (used by facilitator for settlement). |

**Important**: The agent (payer) and mock receiver must be **different wallets**. Using the same wallet for both causes facilitator settlement to fail.

### Gateway Integration Status

- Privacy module wired into gateway with graceful fallback if env vars are missing
- Payment module (`createPaymentFetch`) wired — gateway creates x402 fetch wrapper with burner key
- Gateway parses 402 headers (base64 decode) and extracts `amount` (raw→USDC) + `payTo`
- Gateway extracts `txHash` from `PAYMENT-RESPONSE` header on successful 200 responses
- Policy and Ledger still use stubs — pending Dev 4 delivery

### What's Missing (Dev 4 @trust)

- `src/core/policy.ts` — PolicyEngine with auto/ledger/denied logic based on amount thresholds, daily budget, blacklist
- `src/core/ledger.ts` — Ledger hardware bridge (WebHID/BLE or terminal mock)
- `src/config/policy.json` — exists with defaults but no engine to consume it
- **Impact**: UC2 (ledger approve), UC3 (ledger reject), UC4 (budget exhaustion), UC5 (blacklist) rely on policy/ledger — currently handled by gateway stubs
- **Gateway stubs behavior**: amount >$5 → "ledger" (auto-approved by stub), otherwise → "auto". No blacklist check.

### Remaining Coordination Points

- **UC4 (budget exhaustion)**: Requires real PolicyEngine with `dailySpent` tracking + `maxPerDay` threshold
- **UC5 (blacklist)**: Requires `blockedRecipients` in policy.json + PolicyEngine check
- **Demo script** (`agent-sim.ts`): UC2/UC3 print "Press APPROVE/REJECT on Ledger" — needs real Ledger bridge or terminal mock
- **Server startup**: `server.ts` calls `privacyRouter.init()` — needs `EVM_PRIVATE_KEY` and `UNLINK_API_KEY` in `.env`
