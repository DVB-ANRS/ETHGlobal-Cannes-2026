# SecretPay — Project Bible

## ETHGlobal Cannes 2026 | Team DVB | April 3-5

> Ce document explique TOUT le projet. Lis-le en entier avant de toucher au code.

---

## 1. C'est quoi SecretPay ?

SecretPay est un **middleware backend** (Node.js/TypeScript) qui se place entre un AI agent et les APIs payantes qu'il consomme. Il résout un problème simple : quand un agent paie pour un service onchain, tout le monde peut voir combien il paie, à qui, et à quelle fréquence. SecretPay rend ces paiements **privés** et **contrôlés**.

**En une phrase** : Les AI agents paient pour des APIs en USDC, de manière privée via un privacy pool, avec approbation hardware Ledger pour les gros montants.

---

## 2. Le problème qu'on résout

Aujourd'hui, les AI agents autonomes paient pour des services via le protocole x402 (un standard HTTP où les APIs répondent "402 Payment Required" et l'agent paie en crypto pour accéder). Le problème : chaque paiement est une transaction publique sur la blockchain.

**Conséquence concrète** : Un concurrent qui regarde la blockchain voit :
- Quelles APIs ton agent utilise (adresses des destinataires)
- Combien il paie chacune (montants)
- À quelle fréquence (timestamps)
- Sa balance totale (wallet public)

C'est comme si une entreprise publiait son relevé bancaire en temps réel. Pour une boîte qui fait du trading algo, de la recherche financière, ou n'importe quel usage stratégique d'agents — c'est inacceptable.

**Deuxième problème** : Un agent autonome qui paie sans contrôle humain, c'est dangereux. Un bug, un prompt injection, ou un service malveillant peut vider le wallet de l'agent. Il n'existe pas de "kill switch" hardware.

---

## 3. Notre solution

SecretPay intercepte les paiements de l'agent et les fait passer par 3 couches :

### Couche 1 — Privacy (Unlink)
Les USDC de l'agent sont déposés dans un **privacy pool** (smart contract Unlink sur Base Sepolia). Quand il faut payer, SecretPay crée un **wallet jetable** (burner), le fonde depuis le pool, et utilise ce burner pour payer l'API. Le burner est ensuite détruit.

**Résultat** : sur la blockchain, on voit que le pool a envoyé des USDC à un burner, et que le burner a payé l'API. Mais personne ne peut prouver quel utilisateur du pool a demandé ce retrait. Le lien agent → paiement est cassé.

### Couche 2 — Payment (x402 + Circle)
Le protocole x402 est le standard pour les paiements HTTP machine-to-machine. L'API répond "402 — paye-moi $X en USDC", le client signe une autorisation de paiement et retente la requête. Circle Gateway batch des milliers de ces paiements en une seule transaction onchain (= 0 gas par paiement).

### Couche 3 — Trust (Ledger)
Un **Policy Engine** évalue chaque paiement. Sous un seuil ($5/tx) → auto-approve, l'agent est autonome. Au-dessus → le Ledger physique de l'opérateur s'allume, affiche les détails en clair, et l'opérateur doit approuver physiquement. C'est le "kill switch" hardware.

---

## 4. Architecture technique

```
                              SecretPay Backend (Node.js, port 3000)
                        ┌──────────────────────────────────────────────┐
                        │                                              │
  AI Agent ──POST───→   │  Agent Gateway                               │
  (script ou LLM)       │    │                                         │
                        │    ├─→ Proxy HTTP vers l'API cible           │
                        │    │     └─→ Reçoit 402 Payment Required     │
                        │    │                                         │
                        │    ├─→ Policy Engine                         │
                        │    │     ├─ < seuil → AUTO-APPROVE           │
                        │    │     ├─ > seuil → LEDGER REQUIRED        │
                        │    │     └─ blacklist → DENIED               │
                        │    │                                         │
                        │    ├─→ Privacy Router (Unlink SDK)           │
                        │    │     ├─ Crée un burner wallet (viem)     │
                        │    │     └─ Withdraw du pool → burner        │
                        │    │                                         │
                        │    ├─→ Payment Module (@x402/fetch)          │
                        │    │     ├─ Signe le paiement avec le burner │
                        │    │     └─ Retente la requête avec le header│
                        │    │                                         │
                        │    └─→ Retourne la réponse API à l'agent     │
                        │                                              │
                        └──────────────────────────────────────────────┘
                           │                    │                  │
                    Unlink API          Base Sepolia RPC      Ledger USB
                 (privacy pool)          (blockchain)        (hardware)
```

### Réseau : Base Sepolia uniquement

Tout tourne sur **Base Sepolia** (testnet, chain ID 84532). C'est imposé par Unlink qui n'est déployé que sur cette chain. Circle nanopayments et le Ledger supportent aussi Base Sepolia.

**Adresses clés** :
- Pool Unlink : `0x647f9b99af97e4b79DD9Dd6de3b583236352f482`
- USDC Base Sepolia : `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC : `https://sepolia.base.org`
- Explorer : `https://sepolia.basescan.org`

---

## 5. Comment la privacy fonctionne (IMPORTANT — lire 2 fois)

C'est le coeur du projet. Chaque membre de la team doit comprendre ça.

### Sans SecretPay (public)

```
Wallet agent 0xAgent → envoie 0.01 USDC → API 0xDataAPI

Sur Basescan :
  From: 0xAgent       ← identifié
  To:   0xDataAPI      ← identifié
  Amount: 0.01 USDC    ← visible
  → Tout est traçable
```

### Avec SecretPay (privé)

```
Étape 1 : L'opérateur dépose 100 USDC dans le pool Unlink (1 fois)
  0xOperator → 100 USDC → 0xUnlinkPool
  (Cette tx est publique, mais c'est la seule)

Étape 2 : L'agent veut payer $0.01 pour une API
  → SecretPay crée un burner wallet 0xBurner_7f3a (jamais utilisé avant)
  → SecretPay fait un withdraw Unlink : Pool → 0.01 USDC → 0xBurner_7f3a
  → Le burner signe le paiement x402 et paie l'API
  → Le burner est détruit (clé supprimée)

Sur Basescan :
  Tx 1: 0xUnlinkPool → 0xBurner_7f3a  (0.01 USDC)
  Tx 2: 0xBurner_7f3a → 0xDataAPI     (0.01 USDC)

  QUI a demandé le withdraw du pool ? IMPOSSIBLE À SAVOIR.
  Le pool utilise des ZK proofs : il prouve que quelqu'un a le droit
  de retirer, sans révéler QUI.
```

### Pourquoi les burner wallets ?

Chaque paiement utilise un burner DIFFÉRENT. Même si un observateur voit 10 paiements vers la même API, il ne peut pas prouver qu'ils viennent du même agent — 10 burners différents, aucun lien entre eux.

### La limite honnête

Le deposit initial (étape 1) est public. Si tu déposes 100 USDC et qu'un burner retire 100 USDC 5 minutes après, c'est corrélable. Solution : déposer une fois un gros montant, puis faire plein de petits withdraws. Plus il y a d'utilisateurs dans le pool, plus la privacy est forte.

---

## 6. Stack technique

### Packages npm

| Package | Rôle |
|---------|------|
| `express` | Serveur HTTP (API du gateway) |
| `viem` | Wallet Ethereum, signatures, RPC (tout passe par viem) |
| `@x402/fetch` | Client x402 — wrappe fetch() pour gérer automatiquement les 402 |
| `@x402/evm` | Signer EVM pour x402 — enregistre le scheme "exact" pour signer les paiements |
| `@x402/core` | Types et logique core du protocole x402 |
| `@x402/server` | Middleware Express pour créer une API protégée par x402 (mock server) |
| `@unlink-xyz/sdk` | SDK Unlink — deposit(), withdraw(), transfer(), getBalance() |
| `@ledgerhq/device-management-kit` | Connexion au device Ledger (USB via WebHID) |
| `@ledgerhq/device-signer-kit-ethereum` | Signature de transactions Ethereum sur le Ledger |
| `tsx` | Runner TypeScript pour le dev |

### Structure du projet

```
secretpay/
├── src/
│   ├── server.ts                  # Express app principal (port 3000)
│   ├── routes/
│   │   ├── agent.ts               # POST /agent/request, GET /agent/balance, GET /agent/history
│   │   └── health.ts              # GET /health
│   ├── core/
│   │   ├── gateway.ts             # Chef d'orchestre : reçoit la requête, orchestre le flow
│   │   ├── policy.ts              # Évalue : auto-approve / ledger / denied
│   │   ├── privacy.ts             # Unlink SDK : deposit, withdraw vers burner
│   │   ├── payment.ts             # x402 client : crée le fetch wrapper avec la clé du burner
│   │   └── ledger.ts              # Ledger DMK : connexion, affichage, signature
│   ├── utils/
│   │   ├── burner.ts              # Génération de wallets jetables (viem generatePrivateKey)
│   │   ├── config.ts              # Chargement et validation de la config
│   │   └── logger.ts              # Logs structurés pour la demo
│   ├── types/
│   │   └── index.ts               # Interfaces TypeScript partagées
│   ├── config/
│   │   └── policy.json            # Seuils, whitelist, blacklist
│   ├── mock/
│   │   └── x402-server.ts         # API mockée protégée par x402 (port 4021)
│   └── demo/
│       └── agent-sim.ts           # Script qui simule un agent AI
├── .env                           # Variables d'environnement (jamais commit)
├── .env.example                   # Template des variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## 7. Les 5 modules du backend (chacun dans un fichier)

### 7.1 — Gateway (`src/core/gateway.ts`)

C'est le chef d'orchestre. Il reçoit la requête de l'agent et coordonne tout le flow.

**Input** : URL d'une API + agentId
**Output** : La réponse de l'API (ou une erreur)

```
handleRequest(agentRequest) {
  1. Proxy la requête HTTP vers l'URL cible
  2. Si réponse 200 → retourner directement (pas de paiement nécessaire)
  3. Si réponse 402 → extraire le prix et le destinataire
  4. Appeler policy.evaluate(prix, destinataire)
  5. Si "auto" → continuer
  6. Si "ledger" → ledger.requestApproval() → attendre approve/reject
  7. Si "denied" → retourner erreur
  8. privacy.withdrawToBurner(montant) → récupérer la clé privée du burner
  9. payment.createX402Fetch(burnerKey) → créer un fetch qui paie automatiquement
  10. Retenter la requête → l'API sert les données
  11. Retourner les données à l'agent
}
```

### 7.2 — Policy Engine (`src/core/policy.ts`)

Décide si un paiement passe automatiquement, nécessite le Ledger, ou est bloqué.

**Config** (`config/policy.json`) :
```json
{
  "maxPerTransaction": 5,
  "maxPerDay": 50,
  "allowedRecipients": [],
  "blockedRecipients": ["0xShadyService..."]
}
```

**Logique** :
```
evaluate(amount, recipient) →
  - recipient dans blacklist → "denied"
  - amount > hard cap ($100) → "denied"
  - recipient pas dans whitelist (si whitelist non vide) → "ledger"
  - dépense jour > maxPerDay → "ledger"
  - amount > maxPerTransaction → "ledger"
  - sinon → "auto"
```

### 7.3 — Privacy Router (`src/core/privacy.ts`)

Wrapper autour du SDK Unlink. Gère le pool privé et la création des burner wallets.

**Fonctions** :
```
init(apiKey, mnemonic)     → initialise le client Unlink
deposit(amount)            → dépose des USDC dans le pool (one-time setup)
withdrawToBurner(amount)   → crée un burner (viem), withdraw du pool vers le burner,
                             retourne { burnerAddress, burnerPrivateKey }
getBalance()               → balance actuelle dans le pool
```

**Le flow critique** :
```typescript
// 1. Générer un burner wallet (viem — 1 ligne)
const burnerKey = generatePrivateKey();
const burner = privateKeyToAccount(burnerKey);

// 2. Withdraw depuis le pool Unlink vers le burner
await unlink.withdraw({
  amount: "0.01",
  token: "USDC",
  to: burner.address
});

// 3. Retourner la clé du burner au gateway
return { address: burner.address, privateKey: burnerKey };
```

### 7.4 — Payment Module (`src/core/payment.ts`)

Utilise les packages `@x402` pour créer un fetch qui gère automatiquement les paiements x402.

**Fonctions** :
```
createX402Fetch(burnerPrivateKey) → retourne une fonction fetch qui :
  1. Fait la requête HTTP
  2. Si 402 → lit le prix, signe avec la clé du burner, retente
  3. Retourne la réponse finale
```

**Le code clé** :
```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

function createX402Fetch(burnerPrivateKey: `0x${string}`) {
  const signer = privateKeyToAccount(burnerPrivateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  return wrapFetchWithPayment(fetch, client);
}
```

### 7.5 — Ledger Bridge (`src/core/ledger.ts`)

Gère la connexion au Ledger et les demandes d'approbation.

**Fonctions** :
```
connect()                          → découvre le device USB, établit la session
requestApproval(txDetails)         → affiche les détails sur le Ledger, attend approve/reject
disconnect()                       → ferme la session
```

**Note importante** : Le Ledger DMK utilise **WebHID** qui ne fonctionne que dans un **navigateur**. Pour le backend Node.js, deux options :
1. Un mini dashboard React qui fait le pont (option propre)
2. Utiliser le transport **Speculos** (simulateur) pour la demo si pas de device physique

---

## 8. Le Mock x402 Server (`src/mock/x402-server.ts`)

C'est une API Express qui simule un service payant. Elle utilise `@x402/server` pour protéger ses endpoints.

**3 endpoints** :

| Endpoint | Prix | Données retournées |
|----------|------|--------------------|
| `GET /data` | $0.01 | Prix de marché temps réel (JSON) |
| `GET /news` | $0.005 | Articles de news financières |
| `GET /bulk-data` | $10 | Dataset historique 30 jours |

**Comment ça marche** :
```typescript
import { x402Middleware } from "@x402/server/express";

app.use(x402Middleware({
  routes: {
    "GET /data": {
      scheme: "exact",
      network: "eip155:84532",  // Base Sepolia
      payTo: RECEIVER_ADDRESS,
      price: "$0.01",
    },
  },
  facilitatorUrl: "https://x402.org/facilitator",
}));

app.get("/data", (req, res) => {
  res.json({ symbol: "ETH/USD", price: 3847.52 });
});
```

Sans paiement → l'API répond 402.
Avec le bon header de paiement → l'API sert les données.

---

## 9. Use cases définis

### Use case 1 — Micro-paiement auto-approve

**Scénario** : L'agent fait un GET sur `/data` ($0.01).
**Flow** : Agent → Gateway → 402 → Policy: auto → Unlink withdraw → burner → x402 pay → données.
**Temps** : ~3-5 secondes.
**Ledger** : Non requis.
**Ce qu'on démontre** : Le paiement fonctionne et la privacy est assurée.

### Use case 2 — Gros paiement avec Ledger

**Scénario** : L'agent fait un GET sur `/bulk-data` ($10).
**Flow** : Agent → Gateway → 402 → Policy: ledger → Notification → Opérateur approuve sur Ledger → Unlink withdraw → burner → x402 pay → données.
**Temps** : ~10-30 secondes (dépend de l'opérateur).
**Ledger** : Requis. Affiche "SecretPay — $10.00 USDC — DataAPI".
**Ce qu'on démontre** : Le contrôle humain hardware fonctionne.

### Use case 3 — Paiement bloqué

**Scénario** : L'agent fait un GET vers un service blacklisté.
**Flow** : Agent → Gateway → 402 → Policy: denied → Erreur retournée.
**Temps** : Instantané.
**Ledger** : Non requis (même le Ledger ne peut pas override).
**Ce qu'on démontre** : La protection contre les services malveillants.

### Use case 4 — Dépassement du budget journalier

**Scénario** : L'agent a déjà dépensé $48 aujourd'hui. Il fait un GET sur `/data` ($0.01). Puis un autre. À $50 cumulé, le Policy Engine bascule en mode "ledger required" même pour les petits montants.
**Flow** : Les premiers passent en auto → à partir du seuil jour → Ledger requis.
**Ce qu'on démontre** : Le budget journalier protège contre les agents qui s'emballent.

### Use case 5 — Preuve de privacy sur Basescan

**Scénario** : Après les use cases 1-4, on va sur Basescan.
**Flow** : Ouvrir l'explorer → montrer les transactions du pool Unlink → montrer que 4+ burners différents ont payé → impossible de les relier au même agent.
**Ce qu'on démontre** : La privacy fonctionne réellement onchain.

---

## 10. Variables d'environnement

Créer un fichier `.env` à la racine (jamais commit — ajouter au .gitignore) :

```env
# === Unlink (Privacy Pool) ===
UNLINK_API_KEY=                    # Depuis https://hackaton-apikey.vercel.app/
AGENT_MNEMONIC=                    # BIP-39 mnemonic pour le pool de l'agent

# === Réseau ===
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# === Mock Server ===
MOCK_SERVER_PORT=4021
MOCK_RECEIVER_ADDRESS=             # Adresse qui reçoit les paiements du mock
MOCK_RECEIVER_PRIVATE_KEY=         # Clé privée du receiver (testnet seulement)

# === Gateway ===
GATEWAY_PORT=3000

# === Policy ===
DEFAULT_MAX_PER_TX=5               # Seuil USD pour Ledger approval
DEFAULT_MAX_PER_DAY=50             # Budget journalier sans Ledger

# === Ledger (optionnel) ===
LEDGER_ORIGIN_TOKEN=               # Token pour le Clear Signing context
```

**Où trouver les clés** :
- Unlink API key → https://hackaton-apikey.vercel.app/
- Base Sepolia ETH → https://www.alchemy.com/faucets/base-sepolia
- USDC testnet → https://faucet.circle.com
- Mnemonic → générer avec `npx mnemonics` ou via viem

---

## 11. Comment lancer le projet

```bash
# Terminal 1 — Mock x402 server (l'API payante simulée)
pnpm tsx src/mock/x402-server.ts
# → "Mock x402 server on :4021"

# Terminal 2 — SecretPay backend (le gateway)
pnpm dev
# → "SecretPay Gateway on :3000"

# Terminal 3 — Demo agent (simule un AI agent)
pnpm tsx src/demo/agent-sim.ts
# → Exécute les 5 use cases en séquence
```

---

## 12. API du Gateway

### `POST /agent/request`

L'agent envoie une URL à appeler. Le gateway fait tout le travail.

**Request** :
```json
{
  "url": "http://localhost:4021/data",
  "method": "GET",
  "headers": {},
  "body": null
}
```

**Response (success)** :
```json
{
  "status": 200,
  "data": { "symbol": "ETH/USD", "price": 3847.52 },
  "payment": {
    "amount": "0.01",
    "recipient": "0xDataAPI...",
    "burner": "0xBurner_7f3a",
    "policy": "auto-approve",
    "txHash": "0x..."
  }
}
```

**Response (blocked)** :
```json
{
  "status": 403,
  "error": "Payment denied by policy",
  "reason": "Recipient is blacklisted"
}
```

### `GET /agent/balance`

Retourne la balance privée de l'agent dans le pool Unlink.

### `GET /agent/history`

Retourne l'historique des paiements (stocké en mémoire côté backend, pas onchain).

### `GET /health`

Health check. Retourne `{ "status": "ok" }`.

---

## 13. Tracks de sponsors ciblés

### Track 1 — Unlink : "Best Private Application" ($3,000)

**Ce qu'on utilise** : `@unlink-xyz/sdk` — deposit, withdraw, getBalance.
**Ce qu'on démontre** : Un agent qui paie une API sans que personne puisse tracer le paiement à l'agent.
**Critères** : Working demo sur Base Sepolia + au moins 1 tx privée + repo GitHub + vidéo 3 min.

### Track 2 — Arc/Circle : "Best Agentic Economy with Nanopayments" ($6,000)

**Ce qu'on utilise** : Protocole x402 via `@x402/fetch` + `@x402/evm` — paiements USDC gas-free.
**Ce qu'on démontre** : Un agent qui paie des APIs en sub-cent USDC, automatiquement, via le standard x402.
**Critères** : MVP fonctionnel + diagramme d'architecture + vidéo + taguer "Agentic Economy with Nanopayments".

### Track 3 — Ledger : "AI Agents x Ledger" ($6,000)

**Ce qu'on utilise** : `@ledgerhq/device-management-kit` + `@ledgerhq/device-signer-kit-ethereum`.
**Ce qu'on démontre** : Un agent dont les gros paiements sont approuvés physiquement sur un Ledger.
**Critères** : Human-in-the-loop + Clear Signing JSON + DX feedback dans le README.

**Prize pool total possible** : $15,000.

---

## 14. Liens essentiels

| Ressource | URL |
|-----------|-----|
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
| Ledger Telegram Support | https://t.me/LedgerETHGlobal |
| Base Sepolia Explorer | https://sepolia.basescan.org |
| Base Sepolia Faucet | https://www.alchemy.com/faucets/base-sepolia |

---

## 15. Pitch en 30 secondes

> "Chaque fois qu'un AI agent paie pour un service, le monde entier voit combien, à qui, et à quelle fréquence. C'est comme publier votre relevé bancaire sur Twitter. SecretPay résout ça : les agents paient en USDC via le protocole x402, les transactions passent par un privacy pool Unlink via des burner wallets jetables, et les dépenses critiques sont approuvées physiquement sur un Ledger. Privacy pour les agents, contrôle pour les humains."
