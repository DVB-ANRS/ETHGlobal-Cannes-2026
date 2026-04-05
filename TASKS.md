# SecretPay — Tasks par dev

> Règle : chaque dev travaille dans ses fichiers. On merge sur `main` quand un module tourne en isolation.
> Package `@x402/server` n'existe pas → utiliser `@x402/express`

---

## DEV 1 — @backend
**Fichiers** : `src/server.ts`, `src/routes/`, `src/core/gateway.ts`, `src/types/`, `src/utils/`

### Phase 1 — Routes (déjà en place, à compléter)
- [ ] `POST /agent/request` → wirer vers `gateway.handleRequest()` quand il sera prêt
- [ ] `GET /agent/balance` → appeler `privacy.getBalance()` quand prêt
- [ ] `GET /agent/history` → retourner le tableau `paymentHistory` du gateway

### Phase 2 — Gateway (le plus important)
Créer `src/core/gateway.ts` avec la classe `Gateway` :

```
handleRequest(agentReq: AgentRequest): Promise<AgentResponse>
  1. Proxy GET/POST vers agentReq.url (utiliser fetch natif)
  2. Si réponse 200 → retourner directement
  3. Si réponse 402 → extraire le prix et le payTo depuis les headers
  4. Appeler policy.evaluate(amount, recipient)
     - "denied"  → retourner { status: 403, error: "Payment denied", reason: "..." }
     - "ledger"  → appeler ledger.requestApproval(details) → attendre approve/reject
     - "auto"    → continuer
  5. Appeler privacy.withdrawToBurner(amount) → { address, privateKey }
  6. Appeler payment.createX402Fetch(privateKey) → fetchWithPayment
  7. Retenter la requête avec fetchWithPayment
  8. Créer un PaymentRecord et le push dans paymentHistory[]
  9. Retourner { status: 200, data, payment: { amount, recipient, burner, policy, txHash } }
```

- [ ] `paymentHistory: PaymentRecord[]` stocké en mémoire dans le gateway
- [ ] Chaque étape doit appeler `logger.gateway("...")` avec un message clair
- [ ] Gérer les erreurs : API down, timeout, balance insuffisante → toujours retourner du JSON

### Phase 3 — Polish
- [ ] Logs formatés et lisibles pour la demo (chaque étape du flow visible)
- [ ] `GET /agent/history` retourne le vrai historique
- [ ] `GET /agent/balance` appelle `privacy.getBalance()` pour vrai

**Validation** : `curl -X POST localhost:3000/agent/request -d '{"url":"http://localhost:4021/data"}'` retourne du JSON

---

## DEV 2 — @privacy
**Fichiers** : `src/core/privacy.ts`, `src/utils/burner.ts`

### Phase 1 — Burner wallets
Créer `src/utils/burner.ts` :
- [ ] `generateBurner()` → utiliser `generatePrivateKey()` + `privateKeyToAccount()` de `viem/accounts`
- [ ] Retourne `{ address: 0x..., privateKey: 0x... }`

### Phase 2 — Privacy Router
Créer `src/core/privacy.ts` avec la classe `PrivacyRouter` :

```typescript
class PrivacyRouter {
  private client  // instance Unlink SDK

  async init(apiKey: string, mnemonic: string): Promise<void>
  // → créer le client avec createUnlink({ apiKey, mnemonic })

  async deposit(amount: string): Promise<void>
  // → appeler unlink.deposit({ amount, token: "USDC" })
  // → logger.privacy(`Deposited ${amount} USDC into pool`)

  async withdrawToBurner(amount: string): Promise<{ address: string; privateKey: `0x${string}` }>
  // 1. Générer un burner wallet (burner.ts)
  // 2. Appeler unlink.withdraw({ amount, token: "USDC", to: burner.address })
  // 3. logger.privacy(`Withdrew ${amount} USDC → burner ${burner.address}`)
  // 4. Retourner { address: burner.address, privateKey: burner.privateKey }

  async getBalance(): Promise<string>
  // → appeler unlink.getBalance({ token: "USDC" })
  // → retourner le montant en string
}

export const privacyRouter = new PrivacyRouter()
```

- [ ] `init()` appelé au démarrage du gateway avec `appConfig.unlinkApiKey` et `appConfig.agentMnemonic`
- [ ] Gérer l'erreur "insufficient balance" dans `withdrawToBurner` → throw avec message clair
- [ ] Logger chaque étape

### Phase 3 — Script de test standalone
Créer `scripts/test-privacy.ts` :
- [ ] Afficher la balance avant
- [ ] Faire un withdraw de 0.01 USDC vers un burner
- [ ] Afficher la balance après
- [ ] Afficher le lien Basescan de la tx

**Validation** :
```bash
pnpm tsx scripts/test-privacy.ts
# Balance before: X USDC
# Withdrew 0.01 → burner 0x...
# Balance after: X-0.01 USDC
# Basescan: https://sepolia.basescan.org/tx/0x...
```

---

## DEV 3 — @payment
**Fichiers** : `src/core/payment.ts`, `src/mock/x402-server.ts`, `src/demo/agent-sim.ts`

### Phase 1 — Mock x402 Server
Créer `src/mock/x402-server.ts` (port 4021) :

```typescript
import express from "express"
import { paymentMiddleware } from "@x402/express"

// 3 endpoints avec prix différents :
GET /data       → $0.01  → { symbol: "ETH/USD", price: 3847.52 }
GET /news       → $0.005 → { articles: [{ title: "...", date: "..." }] }
GET /bulk-data  → $10.00 → { data: [...] }  // ← déclenche le Ledger
```

- [ ] Utiliser `paymentMiddleware` de `@x402/express` (pas `@x402/server` qui n'existe pas)
- [ ] `network: "eip155:84532"` (Base Sepolia)
- [ ] `payTo`: `appConfig.mockReceiverAddress`
- [ ] `facilitatorUrl: "https://x402.org/facilitator"`
- [ ] Sans paiement → 402 avec les détails
- [ ] Avec paiement valide → sert les données
- [ ] logger.info() au démarrage

### Phase 2 — Payment Module
Créer `src/core/payment.ts` :

```typescript
import { createX402Fetch } from "@x402/fetch"
import { privateKeyToAccount } from "viem/accounts"

export function createPaymentFetch(burnerPrivateKey: `0x${string}`) {
  const account = privateKeyToAccount(burnerPrivateKey)
  return createX402Fetch(fetch, account)
}
```

- [ ] Vérifier les exports exacts de `@x402/fetch` (ils changent entre versions)
- [ ] La fonction retourne un `fetch` wrappé qui gère le 402 automatiquement
- [ ] Logger le paiement quand il se produit : `logger.payment("Paid $X to 0xRecipient")`

### Phase 3 — Script de test standalone
Créer `scripts/test-payment.ts` :
- [ ] Lancer contre le mock server
- [ ] Tester GET /data sans clé → vérifier qu'on reçoit 402
- [ ] Tester GET /data avec une clé de test → vérifier qu'on reçoit les données

### Phase 4 — Agent simulator
Créer `src/demo/agent-sim.ts` :
- [ ] Script qui enchaîne les 5 use cases en séquence via `POST /agent/request`
- [ ] Affiche clairement chaque scénario et le résultat
- [ ] Use case 1 : `GET /data` ($0.01) → auto
- [ ] Use case 2 : `GET /bulk-data` ($10) → ledger approve
- [ ] Use case 3 : `GET /bulk-data` ($10) → ledger reject
- [ ] Use case 4 : budget épuisé → bascule en ledger
- [ ] Use case 5 : URL blacklistée → denied

**Validation** :
```bash
# Terminal 1
pnpm mock
# Terminal 2
curl -s http://localhost:4021/data
# → 402
curl -s http://localhost:4021/data -H "X-Payment: ..."
# → {"symbol":"ETH/USD","price":3847.52}
```

---

## DEV 4 — @trust
**Fichiers** : `src/core/policy.ts`, `src/core/ledger.ts`, `src/config/policy.json`

### Phase 1 — Policy Engine
Créer `src/core/policy.ts` avec la classe `PolicyEngine` :

```typescript
class PolicyEngine {
  private config: PolicyConfig
  private dailySpent: number = 0
  private lastReset: Date = new Date()

  loadConfig(): void
  evaluate(amount: number, recipient: string): PolicyDecision
  recordSpending(amount: number): void
  private checkDailyReset(): void
}

export const policyEngine = new PolicyEngine()
```

- [ ] Logger chaque décision : `logger.policy("$0.01 < $5 threshold → AUTO-APPROVE")`
- [ ] `recordSpending()` appelé par le gateway APRÈS un paiement réussi

### Phase 2 — Ledger Emulator (Speculos)
**FAIT** — `src/core/ledger.ts` implémenté.

Architecture :
- **Speculos** (Docker) fait tourner le vrai firmware Ledger Ethereum via QEMU
- **Backend** se connecte à Speculos via `@ledgerhq/hw-transport-node-speculos-http` (port 5001)
- **Dashboard** affiche un modal Approve/Reject (composant `LedgerModal`)
- Quand l'utilisateur clique **Approve** → le backend signe un message via `eth.signPersonalMessage()` sur Speculos (preuve crypto réelle) → resolve "approved"
- Quand l'utilisateur clique **Reject** → resolve "rejected" immédiat, aucun fonds dépensé

Routes Express exposées :
- `GET /ledger/pending` → tx en attente ou null
- `POST /ledger/approve` → approuve + signe via Speculos
- `POST /ledger/reject` → rejette
- `GET /ledger/status` → état de la connexion Speculos

Modes :
- `LEDGER_MODE=speculos` (défaut) : full integration Speculos + dashboard
- `LEDGER_MODE=terminal` : readline dans le terminal (fallback sans Docker)

Lancer Speculos :
```bash
./scripts/start-speculos.sh
```

- [x] `requestApproval()` crée un pending, expose via API, attend le clic utilisateur
- [x] Approve → `signPersonalMessage` via Speculos (signature réelle)
- [x] Reject → résolution immédiate, zéro fonds dépensés
- [x] Timeout 120s → auto-reject
- [x] Dashboard `LedgerModal` intégré (poll /ledger/pending toutes les 2s)
- [ ] Tester E2E avec Speculos Docker tournant

### Phase 3 — Clear Signing JSON (track Ledger)
Créer `src/config/erc7730.json` :
```json
{
  "$schema": "https://erc7730.org/schema/v1.json",
  "context": { "contract": { "abi": [...] } },
  "display": {
    "formats": {
      "AgentPayment": {
        "intent": "SecretPay Agent Payment",
        "fields": [
          { "path": "amount", "label": "Amount", "format": "amount" },
          { "path": "recipient", "label": "Recipient", "format": "address" },
          { "path": "service", "label": "Service", "format": "raw" }
        ]
      }
    }
  }
}
```

### Phase 4 — Scripts de test
Créer `scripts/test-policy.ts` :
- [ ] `evaluate(0.01, "0xGood")` → "auto"
- [ ] `evaluate(10, "0xGood")` → "ledger"
- [ ] `evaluate(5, "0xBlacklisted")` → "denied"
- [ ] `recordSpending(48)` puis `evaluate(0.01, "0xGood")` → "ledger"

**Validation** :
```bash
pnpm tsx scripts/test-policy.ts
# $0.01 to 0xGood → auto ✓
# $10 to 0xGood → ledger ✓
# $5 to 0xBlacklisted → denied ✓
# After $48 spent: $0.01 to 0xGood → ledger ✓
```

---

## Sync points

| Heure | Objectif | Validation |
|-------|----------|------------|
| **H+2** | Chaque module tourne en isolation | Scripts de test passent |
| **H+6** | Gateway wired avec tous les modules | `POST /agent/request` → flow auto-approve E2E |
| **H+10** | 5 use cases passent | Dry-run complet |
| **H+12** | Privacy proof Basescan + polish | Liens Basescan prêts |
| **H+14** | Vidéo + README + submission | 3 tracks soumis |

## En cas de blocage

| Blocage | Solution de secours |
|---------|---------------------|
| Unlink SDK ne fonctionne pas | Simuler avec un transfer viem direct (`sendTransaction`) |
| x402 facilitator down | Self-host : `pnpm tsx node_modules/@x402/...` |
| Speculos Docker down | `LEDGER_MODE=terminal` → readline fallback sans signature |
| Withdraw trop lent | Pré-fund 3 burners au démarrage du gateway |
