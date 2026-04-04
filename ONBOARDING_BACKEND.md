# SecretPay — Backend Onboarding Flow

## Principe

Zero database. Zero mnemonic à retenir. Tout repose sur le wallet de l'utilisateur + onchain.

L'utilisateur connecte MetaMask, signe un message, et son vault Unlink est dérivé automatiquement. S'il revient demain avec le même wallet, il retrouve le même vault.

---

## Problème : le mnemonic

Le SDK Unlink a besoin d'un mnemonic BIP-39 pour dériver une identité ZK (un "commitment" dans le privacy pool). Ce mnemonic est requis à CHAQUE opération : `ensureRegistered()`, `deposit()`, `withdraw()`, `getBalances()`.

Demander à l'utilisateur de le taper à chaque fois = mauvaise UX.

## Solution : dériver le seed depuis la signature wallet

```
User wallet (MetaMask)
    │
    ├── Signe un message déterministe :
    │   "SecretPay vault access for 0xABC...DEF"
    │
    ├── Signature = 0x7f3a...  (toujours la même pour le même wallet + même message)
    │
    ├── keccak256(signature) → 32 bytes → seed
    │
    └── seed → mnemonic BIP-39 (via entropyToMnemonic)
        │
        └── unlinkAccount.fromMnemonic({ mnemonic })
            → MÊME vault à chaque connexion
```

**Pourquoi ça marche :**
- Un wallet Ethereum signe de manière déterministe (même clé privée + même message = même signature)
- On hash la signature → ça donne 32 bytes d'entropie
- 32 bytes → 24 mots BIP-39 (ou 16 bytes tronqués → 12 mots)
- Même wallet = même mnemonic dérivé = même vault Unlink
- L'utilisateur n'a RIEN à mémoriser, juste à signer

**La ZK proof est intégrée :** Unlink utilise déjà du ZK en interne. Quand on `withdraw()`, le pool génère une preuve que le retrait est légitime SANS lier le dépôt au retrait. Le mnemonic prouve que tu possèdes les fonds dans le pool, la ZK proof empêche de tracer qui a déposé.

---

## Flow complet

### Étape 1 — Connect Wallet (Frontend)

```
User → MetaMask → connecte son wallet
Frontend récupère : walletAddress (0x...)
```

### Étape 2 — Sign & Derive (Frontend)

```
Message = "SecretPay vault access for {walletAddress}"
Signature = await wallet.signMessage(message)
Seed = keccak256(signature)  // 32 bytes
Mnemonic = entropyToMnemonic(seed.slice(0, 16))  // 12 mots
```

Le mnemonic n'est JAMAIS stocké, JAMAIS envoyé au serveur. Il est re-dérivé à chaque session.

### Étape 3 — Create Vault (Frontend → Backend)

```
POST /onboard/create-vault
Headers: { Authorization: "Bearer {signature}" }
Body: { walletAddress }

Backend:
  1. Vérifie la signature (ecrecover → doit matcher walletAddress)
  2. Dérive le même mnemonic (même algo que le frontend)
  3. createUnlink({ mnemonic, apiKey }) 
  4. ensureRegistered() → vault créé onchain (idempotent)
  5. Retourne { vaultReady: true, balance: "0" }
```

### Étape 4 — Deposit USDC (Frontend)

```
Le deposit se fait côté frontend via MetaMask directement :
  1. approve(USDC, unlinkPool, amount)  → tx MetaMask
  2. POST /onboard/deposit { walletAddress, amount }
     → Backend appelle client.deposit({ token, amount })
     → Attend confirmation
  3. Retourne { balance: "10.00" }
```

### Étape 5 — Configure Agent (Frontend)

```
POST /onboard/configure
Body: {
  walletAddress,
  agentAddress: "0x...",       // L'adresse de l'agent AI autorisé
  ledgerAddress: "0x...",      // Optionnel
  maxPerTx: 5,
  maxPerDay: 50
}

Backend:
  → Stocke en mémoire (Map<walletAddress, Config>)
  → Le gateway utilise cette config pour les requêtes de cet agent
```

### Étape 6 — Agent utilise le gateway

```
POST /agent/request
Headers: { X-Agent-Address: "0x..." }
Body: { url: "https://api.example.com/data" }

Gateway:
  1. Identifie l'agent via le header
  2. Trouve la config associée (quel user a whitelisté cet agent)
  3. Re-dérive le mnemonic de l'user (via la signature stockée en session)
  4. Utilise le vault de l'user pour le paiement
```

---

## API Routes Backend

### Onboarding

```
POST /onboard/create-vault
  Body: { walletAddress, signature }
  → Vérifie signature, dérive mnemonic, ensureRegistered()
  → Response: { vaultReady: true, balance: "0" }

POST /onboard/deposit
  Body: { walletAddress, signature, amount }
  → Appelle client.deposit()
  → Response: { balance: "10.00", txId: "..." }

GET /onboard/balance?wallet=0x...
  Headers: { Authorization: "Bearer {signature}" }
  → Appelle client.getBalances()
  → Response: { balance: "10.00", unit: "USDC" }

POST /onboard/configure
  Body: { walletAddress, signature, agentAddress, ledgerAddress?, maxPerTx?, maxPerDay? }
  → Stocke la config agent en mémoire
  → Response: { configured: true }
```

### Gateway (existant, adapté)

```
POST /agent/request
  Headers: { X-Agent-Address: "0x..." }
  Body: { url, method?, headers?, body? }
  → Le gateway identifie le user via l'agent address
  → Utilise le vault du user pour payer

GET /agent/balance
  Headers: { X-Agent-Address: "0x..." }
  → Balance du vault du user associé à cet agent

GET /agent/history
  Headers: { X-Agent-Address: "0x..." }
  → Historique des paiements de cet agent
```

---

## Architecture mémoire (pas de DB)

```typescript
// En mémoire sur le serveur — reset au restart (acceptable pour hackathon)

interface UserSession {
  walletAddress: string;
  signature: string;          // Pour re-dériver le mnemonic à chaque opération
  derivedMnemonic: string;    // Dérivé au login, gardé en mémoire le temps de la session
  unlinkApiKey: string;       // Partagé (hackathon) ou par user (prod)
  vaultReady: boolean;
}

interface AgentConfig {
  ownerWallet: string;        // Quel user a whitelisté cet agent
  agentAddress: string;
  ledgerAddress?: string;
  maxPerTx: number;
  maxPerDay: number;
}

// Maps en mémoire
const sessions = new Map<string, UserSession>();       // walletAddress → session
const agentConfigs = new Map<string, AgentConfig>();   // agentAddress → config
```

---

## Sécurité

| Risque | Mitigation |
|--------|-----------|
| Signature interceptée | HTTPS obligatoire. La signature ne donne accès qu'au vault Unlink, pas au wallet ETH |
| Mnemonic en mémoire serveur | Dérivé à la volée, jamais persisté sur disque. Process restart = mémoire effacée |
| Agent non autorisé | Le gateway vérifie que l'agent address est dans la whitelist du user |
| Replay attack | Signature inclut l'adresse wallet — spécifique à un seul user |
| Serveur compromis | Seul le mnemonic Unlink est exposé (pas la clé privée ETH du user) |

---

## Diagramme séquence

```
┌────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐
│Frontend│     │ Backend  │     │  Unlink  │     │Onchain │
└───┬────┘     └────┬─────┘     └────┬─────┘     └───┬────┘
    │               │                │                │
    │ Connect wallet│                │                │
    ├──────────────►│                │                │
    │               │                │                │
    │ Sign message  │                │                │
    │ (MetaMask)    │                │                │
    │               │                │                │
    │ POST /create-vault             │                │
    ├──────────────►│                │                │
    │               │ derive mnemonic│                │
    │               │ ensureRegistered()              │
    │               ├───────────────►│                │
    │               │                │  create vault  │
    │               │                ├───────────────►│
    │               │   { vaultReady: true }          │
    │◄──────────────┤                │                │
    │               │                │                │
    │ approve USDC  │                │                │
    │ (MetaMask tx) ├────────────────────────────────►│
    │               │                │                │
    │ POST /deposit │                │                │
    ├──────────────►│                │                │
    │               │ client.deposit()               │
    │               ├───────────────►│                │
    │               │                │   deposit tx   │
    │               │                ├───────────────►│
    │               │   { balance: "10.00" }          │
    │◄──────────────┤                │                │
    │               │                │                │
    │ POST /configure (agent + ledger)                │
    ├──────────────►│                │                │
    │               │ store in memory│                │
    │   { configured: true }         │                │
    │◄──────────────┤                │                │
    │               │                │                │
    │               │                │                │
    │  ─── LATER: Agent makes a request ───          │
    │               │                │                │
    │         POST /agent/request    │                │
    │               ├─── identify user from agent ──►│
    │               │ withdrawToBurner()              │
    │               ├───────────────►│                │
    │               │                │  ZK withdraw   │
    │               │                ├───────────────►│
    │               │                │   burner funded│
    │               │ x402 payment with burner        │
    │               ├────────────────────────────────►│
    │               │            API data             │
    │               │◄────────────────────────────────│
    │               │                │                │
```

---

## Ce qui est déjà fait vs à faire

| Composant | Status |
|-----------|--------|
| Gateway (handleRequest, parse402, payment flow) | DONE |
| Privacy module (privacy.ts, burner.ts) | DONE |
| Payment module (payment.ts, x402) | DONE |
| Mock server (x402-server.ts) | DONE |
| Routes /onboard/* | TODO — Backend (nous) |
| Signature verification + mnemonic derivation | TODO — Backend (nous) |
| Session management (Map en mémoire) | TODO — Backend (nous) |
| Gateway multi-user (identify user from agent) | TODO — Backend (nous) |
| Frontend wallet connect + sign + deposit | TODO — Frontend (collègue) |

---

## Stack nécessaire (pas de nouvelles dépendances)

Tout est déjà dans le projet :
- `viem` → `verifyMessage()` pour vérifier les signatures, `keccak256()` pour le hash
- `viem/accounts` → `mnemonicToAccount()`, conversion entropy → mnemonic
- `@unlink-xyz/sdk` → `createUnlink()`, `ensureRegistered()`
- `express` → nouvelles routes

Seul ajout potentiel : `@scure/bip39` pour `entropyToMnemonic()` (convertir 16 bytes → 12 mots BIP-39)
