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
- **Paiements** : `@x402/fetch` + `@x402/evm` + `@x402/core` + `@x402/server`
- **Ledger Emulator** : Speculos (Docker) + `@ledgerhq/hw-transport-node-speculos-http` + `@ledgerhq/hw-app-eth` — émulateur officiel Ledger, approve/reject via le dashboard React
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
UNLINK_API_KEY=          # https://hackaton-apikey.vercel.app/
AGENT_MNEMONIC=          # BIP-39 mnemonic du wallet agent
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MOCK_SERVER_PORT=4021
MOCK_RECEIVER_ADDRESS=   # Adresse receiver du mock server
MOCK_RECEIVER_PRIVATE_KEY=
GATEWAY_PORT=3000
DEFAULT_MAX_PER_TX=2
BACKUP_BURNER_PRIVATE_KEY=  # Optionnel — wallet de backup qui fund les burners en parallèle du pool Unlink
LEDGER_MODE=speculos      # speculos | terminal (default: speculos)
SPECULOS_API_URL=http://127.0.0.1:5000  # Speculos HTTP API
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
│   ├── policy.ts              # Policy Engine : auto / ledger / denied
│   ├── privacy.ts             # Unlink SDK : deposit, withdraw vers burner
│   ├── payment.ts             # x402 client : createX402Fetch(burnerKey)
│   └── ledger-emulator.ts     # Speculos emulator : requestApproval via dashboard + real signing
├── utils/
│   ├── burner.ts              # generateBurner() + fundBurnerFromBackup() (viem ERC-20 transfer)
│   ├── config.ts              # Chargement .env + validation
│   └── logger.ts              # Logs colorés pour la demo
├── types/
│   └── index.ts               # AgentRequest, AgentResponse, PaymentRecord, PolicyDecision
├── config/
│   └── policy.json            # maxPerTransaction:2, floor:0.1, blacklist:[]
├── mock/
│   └── x402-server.ts         # API payante simulée (port 4021)
└── demo/
    └── agent-sim.ts           # Script qui enchaîne les 5 use cases
```

---

## Ownership des modules (règle : ne pas toucher au code des autres)

| Dev | Alias | Fichiers owned |
|-----|-------|----------------|
| Dev 1 | `@backend` | `server.ts`, `routes/`, `core/gateway.ts`, `types/`, `utils/config.ts`, `utils/logger.ts` |
| Dev 2 | `@privacy` | `core/privacy.ts`, `utils/burner.ts` |
| Dev 3 | `@payment` | `core/payment.ts`, `mock/x402-server.ts`, `demo/agent-sim.ts` |
| Dev 4 | `@trust` | `core/policy.ts`, `core/ledger-emulator.ts`, `config/policy.json`, dashboard LedgerModal |

**Si tu dois modifier le fichier d'un autre → prévenir d'abord sur Slack/Discord. Merge sur `main` uniquement quand le module tourne en isolation.**

---

## Flow de paiement (gateway.ts)

```
1. Proxy HTTP vers l'URL cible
2. Si 200 → retourner directement
3. Si 402 → extraire prix + destinataire
4. policy.evaluate(prix, destinataire) → auto | ledger | denied
5. Si denied → retourner 403
6. Si ledger → ledgerEmulator.requestApproval() → notifie le dashboard, attend approve/reject du user dans le navigateur
7. privacy.withdrawToBurner(montant) → funding parallèle (voir ci-dessous)
8. payment.createX402Fetch(burnerPrivateKey) → fetch wrapper
9. Retenter la requête → l'API sert les données
10. Stocker PaymentRecord + retourner à l'agent
```

---

## Parallel Burner Funding (privacy.ts + burner.ts)

Le burner wallet est **toujours frais et jetable** — c'est lui qui signe le paiement x402, jamais le backup wallet.

Le problème : le withdraw Unlink (pool ZK → burner) peut être lent sur Base Sepolia. Pour garantir que le burner a des fonds, on lance **deux transferts en parallèle** vers le même burner :

```
withdrawToBurner(amount)
  1. generateBurner() → fresh burner { address, privateKey }
  2. Promise.allSettled([
       Path A: Unlink pool → burner   (withdraw ZK, peut prendre >30s)
       Path B: Backup wallet → burner  (ERC-20 transfer direct, ~3s)
     ])
  3. Au moins un doit réussir, sinon erreur
  4. Return { address, privateKey } du fresh burner
```

- **Path A** (Unlink) : `client.withdraw()` + `pollTransactionStatus()` — important pour la privacy proof (track sponsor)
- **Path B** (Backup) : `fundBurnerFromBackup()` dans `burner.ts` — simple `walletClient.writeContract()` ERC-20 `transfer(burnerAddress, amount)` depuis `BACKUP_BURNER_PRIVATE_KEY`
- Si `BACKUP_BURNER_PRIVATE_KEY` n'est pas configuré, seul le path Unlink tourne (comportement original)
- Si les deux réussissent, le burner a 2× le montant — acceptable pour un hackathon
- Le backup wallet **n'est jamais passé à `createPaymentFetch()`** — seule la clé du fresh burner est utilisée pour signer

---

## Policy Engine (policy.json)

```json
{
  "maxPerTransaction": 2,
  "allowedRecipients": [],
  "blockedRecipients": []
}
```

### Seuils de transaction (en USDC)

| Paramètre | Valeur | Effet |
|-----------|--------|-------|
| Floor (minimum) | $0.10 | En dessous → `"denied"` |
| Cap / hard cap | $2.00 | Au dessus → `"denied"` |
| Seuil Ledger | $1.00 | `>= $1` → `"ledger"` (approbation hardware) |

Pas de limite quotidienne — toutes les transactions passent tant qu'elles respectent le floor/cap.

### Logique d'évaluation (ordre de priorité)

```
if amount < 0.10          → "denied" (en dessous du minimum)
if amount > 2.00          → "denied" (au dessus du cap)
if recipient blacklisté   → "denied"
if amount >= 1.00         → "ledger"
else                       → "auto"
```

---

## 5 Use Cases à démontrer

| # | Scénario | Endpoint mock | Prix | Résultat attendu |
|---|----------|--------------|------|-----------------|
| 1 | Auto-approve | `GET /data` | $0.10 | 200 + log AUTO-APPROVE |
| 2 | Ledger approve | `GET /bulk-data` | $1.50 | Ledger prompt → approve → 200 |
| 3 | Ledger reject | `GET /bulk-data` | $1.50 | Ledger prompt → reject → 403 |
| 4 | Blacklist | URL blacklistée | - | 403 "denied" immédiat |

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
- Speculos emulator (officiel Ledger) via Docker avec `@ledgerhq/hw-transport-node-speculos-http` + `@ledgerhq/hw-app-eth`
- Human-in-the-loop : approve/reject dans le dashboard React, signature réelle via Speculos (`signPersonalMessage`)
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
| Speculos Docker down | Fallback : LEDGER_MODE=terminal (readline) — approve/reject sans signature |
| Withdraw trop lent | Parallel funding : backup wallet envoie USDC au burner en même temps que le pool Unlink |
| Réseau saturé | Même mécanisme — le transfert direct backup→burner passe même si le pool est lent |
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
| 0:50-1:20 | Demo auto-approve $0.10 — logs en direct |
| 1:20-2:00 | Demo Ledger $1.50 — device à la caméra, approve physique |
| 2:00-2:15 | Demo blacklist — refus instantané |
| 2:15-2:45 | Preuve onchain : Basescan, burners différents, non-reliables |
| 2:45-3:00 | Closing pitch |

---

## Pitch 30 secondes

> "Chaque fois qu'un AI agent paie pour un service, le monde entier voit combien, à qui, et à quelle fréquence. C'est comme publier votre relevé bancaire sur Twitter. SecretPay résout ça : les agents paient en USDC via le protocole x402, les transactions passent par un privacy pool Unlink via des burner wallets jetables, et les dépenses critiques sont approuvées physiquement sur un Ledger. Privacy pour les agents, contrôle pour les humains."
