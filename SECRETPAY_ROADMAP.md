# SecretPay — Roadmap Hackathon (36h, 4 devs)

---

## Rôles de la team

| Rôle | Alias | Focus | Packages principaux |
|------|-------|-------|---------------------|
| **Dev 1** — Backend Lead | `@backend` | Express server, Gateway, routes, orchestration | `express`, `viem` |
| **Dev 2** — Privacy Engineer | `@privacy` | Unlink SDK, burner wallets, privacy router | `@unlink-xyz/sdk`, `viem` |
| **Dev 3** — Payment Engineer | `@payment` | x402 protocol, mock server, paiements | `@x402/*` |
| **Dev 4** — Trust Layer + Demo | `@trust` | Ledger DMK, Policy Engine, demo, vidéo | `@ledgerhq/*` |

**Règle** : Chaque dev est responsable de son module. Personne ne touche au code d'un autre sans prévenir. On merge sur `main` uniquement quand un module fonctionne en isolation.

---

## Phase 0 — Setup (H0 → H2)

> Vendredi 20h → 22h | Objectif : tout le monde peut run le projet en local

### `@backend`
- [ ] Init repo : `pnpm init`, `tsconfig.json` (strict: true), structure `src/` avec tous les dossiers
- [ ] Installer : `express cors viem tsx typescript @types/express`
- [ ] Créer `src/server.ts` minimal qui écoute sur le port 3000 et retourne "SecretPay running"
- [ ] Créer `.env.example`, `.gitignore` (inclure node_modules, .env, dist)
- [ ] Push sur GitHub, inviter toute la team

**Done quand** : `pnpm dev` affiche "SecretPay Gateway on :3000" et `curl localhost:3000/health` retourne `{"status":"ok"}`

### `@privacy`
- [ ] Aller sur https://hackaton-apikey.vercel.app/ → récupérer l'API key Unlink
- [ ] Générer un mnemonic BIP-39 (via `npx mnemonics` ou viem)
- [ ] Aller sur https://www.alchemy.com/faucets/base-sepolia → récupérer du ETH testnet
- [ ] Aller sur https://faucet.circle.com → récupérer du USDC testnet
- [ ] Remplir le `.env` avec `UNLINK_API_KEY` et `AGENT_MNEMONIC`
- [ ] Installer `@unlink-xyz/sdk` et tester que `createUnlink()` ne crash pas
- [ ] Si le faucet Unlink est dispo : appeler `requestPrivateTokens()` pour seed le pool

**Done quand** : Un script qui instancie `createUnlink()` sans erreur et affiche la balance (même si 0)

### `@payment`
- [ ] Lire la doc x402 : https://github.com/coinbase/x402 (README + examples)
- [ ] Installer : `@x402/fetch @x402/evm @x402/core @x402/server`
- [ ] Créer `src/mock/x402-server.ts` qui compile (juste le squelette avec les imports)
- [ ] Tester que les imports fonctionnent sans erreur TypeScript

**Done quand** : `pnpm tsx src/mock/x402-server.ts` démarre sans crash (même si aucun endpoint encore)

### `@trust`
- [ ] Lire la doc Ledger DMK : https://developers.ledger.com/docs/device-interaction/beginner/setup
- [ ] Installer : `@ledgerhq/device-management-kit @ledgerhq/device-transport-kit-web-hid @ledgerhq/device-signer-kit-ethereum`
- [ ] Si on a un Ledger physique : tester `startDiscovering()` dans un script browser
- [ ] Si pas de Ledger : installer Speculos (simulateur) et tester avec `speculosTransportFactory`
- [ ] Créer `src/core/policy.ts` avec le squelette de la classe PolicyEngine
- [ ] Créer `src/config/policy.json` avec les seuils par défaut

**Done quand** : PolicyEngine instancié, `evaluate(0.01, "0x...")` retourne `"auto"` et `evaluate(10, "0x...")` retourne `"ledger"`

### Sync point H2

Tout le monde pull `main`. Chacun confirme :
- `pnpm dev` démarre le serveur
- Son `.env` est rempli
- Ses packages sont installés et importables

---

## Phase 1 — Briques isolées (H2 → H6)

> Vendredi 22h → Samedi 2h | Objectif : chaque module fonctionne seul

### `@backend` — Server + Routes

Fichiers à créer :
```
src/server.ts          → Express app complète (cors, json, error handler)
src/routes/agent.ts    → POST /agent/request (stub pour l'instant)
                         GET /agent/balance (stub)
                         GET /agent/history (stub)
src/routes/health.ts   → GET /health
src/types/index.ts     → Interfaces : AgentRequest, AgentResponse, PaymentRecord, PolicyDecision
```

- [ ] `POST /agent/request` accepte `{ url, method, headers, body }` et retourne un stub
- [ ] Les interfaces TypeScript sont définies et exportées
- [ ] Le serveur gère les erreurs proprement (try/catch, réponse JSON toujours)

**Test** : `curl -X POST localhost:3000/agent/request -H "Content-Type: application/json" -d '{"url":"http://test.com"}'` retourne du JSON.

### `@privacy` — Unlink SDK

Fichier : `src/core/privacy.ts`

```typescript
export class PrivacyRouter {
  init(apiKey: string, mnemonic: string): Promise<void>
  deposit(amount: string): Promise<TxResult>
  withdrawToBurner(amount: string): Promise<{ address: string; privateKey: `0x${string}` }>
  getBalance(): Promise<string>
}
```

- [ ] `init()` crée le client Unlink
- [ ] `deposit()` dépose des USDC dans le pool (appeler 1 fois avec ~10 USDC de test)
- [ ] `withdrawToBurner()` génère un burner wallet (viem `generatePrivateKey`), fait le withdraw Unlink, retourne la clé
- [ ] `getBalance()` retourne la balance dans le pool

**Test standalone** :
```bash
pnpm tsx scripts/test-privacy.ts
# Attendu :
# Balance before: 10.00 USDC
# Withdrawing 0.01 to burner 0xBurner_...
# Balance after: 9.99 USDC
# Burner funded: 0.01 USDC
```

Vérifier sur https://sepolia.basescan.org que la tx apparaît.

### `@payment` — Mock Server + x402 Client

Fichiers :
```
src/mock/x402-server.ts    → 3 endpoints protégés par x402
src/core/payment.ts        → createX402Fetch(privateKey) → fetch wrapper
```

Mock server — 3 endpoints :

| Route | Prix | Réponse |
|-------|------|---------|
| `GET /data` | $0.01 | `{ symbol: "ETH/USD", price: 3847.52 }` |
| `GET /news` | $0.005 | `{ articles: [{ title: "...", date: "..." }] }` |
| `GET /bulk-data` | $10 | `{ data: [...30 jours de données...] }` |

- [ ] Le mock server utilise `@x402/server/express` middleware
- [ ] Sans paiement → répond 402 avec les détails (prix, adresse, network)
- [ ] Avec paiement valide → sert les données
- [ ] `createX402Fetch(key)` retourne un fetch qui gère le flow 402 automatiquement

**Test standalone** :
```bash
# Terminal 1 :
pnpm tsx src/mock/x402-server.ts
# → "Mock x402 server on :4021"

# Terminal 2 :
pnpm tsx scripts/test-payment.ts
# Attendu :
# Fetching /data without payment... → 402
# Fetching /data with x402 payment... → 200 { symbol: "ETH/USD" }
```

### `@trust` — Policy Engine + Ledger

Fichiers :
```
src/core/policy.ts     → PolicyEngine class
src/config/policy.json → Config par défaut
src/core/ledger.ts     → LedgerBridge class
```

Policy Engine :
- [ ] `loadConfig()` lit `policy.json`
- [ ] `evaluate(amount, recipient)` retourne `"auto"` | `"ledger"` | `"denied"`
- [ ] `recordSpending(amount)` track la dépense cumulée du jour
- [ ] `resetDaily()` remet le compteur à 0

Ledger Bridge :
- [ ] `connect()` découvre et connecte le device
- [ ] `requestApproval({ amount, recipient, service })` affiche sur le Ledger et attend
- [ ] `disconnect()` cleanup

**Test** :
```bash
pnpm tsx scripts/test-policy.ts
# evaluate(0.01, "0xGood") → "auto"
# evaluate(10, "0xGood") → "ledger"
# evaluate(5, "0xBlacklisted") → "denied"
# recordSpending(48) → OK
# evaluate(0.01, "0xGood") after 48 spent → "ledger" (daily limit approaching)
```

### Sync point H6

Chaque dev fait une demo de 2 minutes de son module. 4 briques qui marchent séparément. On merge tout sur `main`.

---

## Phase 2 — Intégration Gateway (H6 → H10)

> Samedi 2h → 6h | Objectif : le flow end-to-end fonctionne (cas auto-approve)

C'est la phase critique. On connecte les 4 briques.

### `@backend` — Le chef d'orchestre

Fichier : `src/core/gateway.ts`

- [ ] Implémenter `handleRequest()` avec les 10 étapes du flow
- [ ] Wire les routes `/agent/*` vers le gateway
- [ ] Gérer tous les cas d'erreur (API down, Unlink down, insufficient balance, timeout)
- [ ] Chaque étape doit logger clairement (pour la demo)

### `@privacy` — Connexion au gateway

- [ ] Le gateway appelle `privacy.withdrawToBurner(amount)` → doit retourner `{ address, privateKey }`
- [ ] Gérer le cas "insufficient balance" proprement
- [ ] Tester que le burner reçoit bien les USDC après le withdraw

### `@payment` — Connexion au gateway

- [ ] Le gateway appelle `payment.createX402Fetch(burnerKey)` → doit retourner un fetch qui paie
- [ ] Tester le flow complet : burner funded → x402 fetch → mock server accepte → données retournées
- [ ] Debug le format des headers x402 si ça ne matche pas

### `@trust` — Policy dans le gateway

- [ ] Le gateway appelle `policy.evaluate()` avant chaque paiement
- [ ] Tester les 3 branches : auto, ledger (mocké pour l'instant), denied
- [ ] Commencer l'intégration Ledger réelle (si le device est dispo)

### Test E2E — Le moment de vérité

```bash
# Terminal 1 : Mock server
pnpm tsx src/mock/x402-server.ts

# Terminal 2 : SecretPay backend
pnpm dev

# Terminal 3 : Test manuel
curl -X POST localhost:3000/agent/request \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:4021/data"}'

# Attendu :
# Backend logs :
#   [Gateway] Received request for http://localhost:4021/data
#   [Gateway] Got 402 — price: $0.01, payTo: 0xReceiver
#   [Policy] $0.01 < $5 threshold → AUTO-APPROVE
#   [Privacy] Created burner 0xBurner_7f3a
#   [Privacy] Withdrew 0.01 USDC from pool → burner
#   [Payment] x402 payment signed by burner
#   [Gateway] Retried request → 200 OK
#   [Gateway] Returning data to agent
#
# Response :
#   { "status": 200, "data": { "symbol": "ETH/USD", "price": 3847.52 }, ... }
```

### Sync point H10

Le flow **auto-approve** fonctionne de bout en bout. L'agent envoie une URL, SecretPay fait tout le travail, l'agent reçoit les données. On peut le montrer en demo.

---

## Phase 3 — Ledger + E2E complet (H10 → H14)

> Samedi 6h → 10h | Objectif : le flow Ledger fonctionne, les 5 use cases passent

### `@backend`
- [ ] Ajouter le stockage in-memory des `PaymentRecord`
- [ ] Implémenter `GET /agent/history` (retourne la liste des paiements)
- [ ] Implémenter `GET /agent/balance` (appelle `privacy.getBalance()`)
- [ ] Logs formatés proprement pour la demo (pas de bruit)

### `@privacy`
- [ ] Tester avec différents montants ($0.001, $0.01, $1, $10)
- [ ] Gérer le edge case : withdraw prend trop de temps (timeout + retry)
- [ ] Optionnel : pré-fund 2-3 burners en avance pour réduire la latence

### `@payment`
- [ ] Vérifier que le facilitator x402 fonctionne sur Base Sepolia
- [ ] Si le facilitator public ne marche pas → utiliser le facilitator du repo x402
- [ ] Tester les 3 prix différents ($0.005, $0.01, $10)

### `@trust`
- [ ] **Flow Ledger complet** intégré dans le gateway :
  - Gateway détecte "ledger" → appelle `ledger.requestApproval()`
  - Le device affiche les détails (montant, destinataire, service)
  - Opérateur approve → gateway continue le flow
  - Opérateur reject → gateway retourne erreur à l'agent
- [ ] Créer le fichier Clear Signing JSON (ERC-7730) pour le type `AgentPayment`
- [ ] Tester approve ET reject

### Tests E2E — les 5 scénarios

| # | Scénario | Commande | Résultat attendu |
|---|----------|----------|------------------|
| 1 | Petit paiement auto ($0.01) | `POST /agent/request { url: "/data" }` | 200 + données + log "AUTO-APPROVE" |
| 2 | Gros paiement Ledger ($10) | `POST /agent/request { url: "/bulk-data" }` | Ledger prompt → approve → 200 + données |
| 3 | Gros paiement Ledger rejeté | `POST /agent/request { url: "/bulk-data" }` | Ledger prompt → reject → 403 erreur |
| 4 | Budget jour dépassé | 50× `POST /agent/request { url: "/data" }` | Les premiers passent en auto → à $50 → Ledger |
| 5 | Blacklist | `POST /agent/request { url: "/shady" }` | 403 "denied" immédiat |

### Sync point H14

Dry-run complet en équipe. Tout le monde regarde le flow tourner. On note les bugs restants.

---

## Phase 4 — Privacy Proof + Polish (H14 → H18)

> Samedi 10h → 14h | Objectif : prouver que la privacy marche, polish pour la demo

### `@backend`
- [ ] Cleanup code : supprimer le dead code, commenter les parties complexes
- [ ] Logs de demo : format propre, couleurs, timestamps
- [ ] S'assurer que le server ne crash jamais (catch all errors)

### `@privacy`
- [ ] **Privacy proof** : aller sur Basescan et documenter :
  - L'adresse du pool Unlink
  - Les transactions des burners
  - Montrer que les burners sont tous différents et non-liés
- [ ] Préparer les liens Basescan pour la vidéo (copier les URLs exactes)
- [ ] Screenshots des transactions pour le README

### `@payment`
- [ ] Vérifier que tous les paiements sont bien settled
- [ ] Documenter les montants testés et les tx hashes

### `@trust`
- [ ] Tester le Clear Signing JSON sur le device physique
- [ ] S'assurer que le Ledger affiche : "SecretPay — $10.00 USDC — DataAPI"
- [ ] Écrire le feedback DX pour le README (obligatoire pour le track Ledger)
- [ ] Préparer le Ledger pour la demo (app Ethereum installée, PIN connu)

### Tous ensemble (H16 → H18)
- [ ] Fix les derniers bugs
- [ ] Dry-run de la demo 3 fois de suite sans interruption
- [ ] Écrire le script de demo minute par minute

---

## Phase 5 — Dashboard (H18 → H22) — NICE TO HAVE

> Samedi 14h → 18h | Seulement si le E2E est solide

Si tout fonctionne bien, `@trust` peut construire un mini dashboard :

```
dashboard/
├── index.html          → Single page, pas de framework lourd
├── style.css           → Minimal
└── app.js              → Fetch vers le backend + WebSocket pour le live feed
```

**2 panels** :
- **Gauche** : Live feed des paiements (logs qui scrollent)
- **Droite** : Panneau d'approbation Ledger (quand une tx est en attente)

**Si le E2E n'est pas solide** : SKIP le dashboard. La demo fonctionne en terminal. Un terminal propre avec des bons logs est plus impressionnant qu'un dashboard cassé.

---

## Phase 6 — Demo + Submission (H22 → H30)

> Samedi 18h → Dimanche 2h

### H22 → H24 — Enregistrer la vidéo (3 min max)

**Script minute par minute** :

| Temps | Contenu | Qui parle |
|-------|---------|-----------|
| 0:00 → 0:25 | **Le problème** : ouvrir Basescan, montrer un wallet agent public avec toutes ses tx visibles. "Quand un AI agent paie onchain, tout le monde voit sa stratégie." | 1 personne |
| 0:25 → 0:50 | **La solution** : montrer le schéma d'architecture SecretPay. "SecretPay casse le lien entre l'agent et ses paiements." | même personne |
| 0:50 → 1:20 | **Demo — Auto-approve** : terminal avec le script agent, un paiement $0.01 passe automatiquement, les logs montrent le flow | montrer l'écran |
| 1:20 → 2:00 | **Demo — Ledger** : un paiement $10 trigger le Ledger, montrer le device à la caméra, l'écran affiche les détails, l'opérateur approuve physiquement | montrer le Ledger |
| 2:00 → 2:15 | **Demo — Block** : un paiement vers un service blacklisté est refusé | montrer l'écran |
| 2:15 → 2:45 | **Preuve onchain** : ouvrir Basescan, montrer les burners différents, expliquer "impossible de relier ces paiements au même agent" | montrer Basescan |
| 2:45 → 3:00 | **Closing** : "SecretPay — privacy pour les agents, contrôle pour les humains. Built avec Unlink, x402, et Ledger." | 1 personne |

**Tips vidéo** :
- Filmer en screencast (OBS ou QuickTime) avec voix off
- Montrer le Ledger physique avec la caméra du téléphone en picture-in-picture
- Pas de musique, pas d'intro fancy — les juges skip ça

### H24 → H26 — README + documentation

| Qui | Quoi |
|-----|------|
| `@backend` | README : description, architecture diagram (ASCII art), install instructions, lien vidéo |
| `@privacy` | Section "Privacy Proof" dans le README : liens Basescan, explication de la privacy |
| `@payment` | Section "x402 Integration" : comment le protocole est utilisé |
| `@trust` | Section "Ledger DX Feedback" : retour d'expérience sur le SDK Ledger (obligatoire pour le track) |

### H26 → H28 — Submission sur les 3 tracks

Pour chaque track, préparer :
- [ ] Titre : "SecretPay — Private Payment Layer for AI Agents"
- [ ] Description : adapter le pitch à chaque sponsor (mettre leur tech en avant)
- [ ] Lien GitHub
- [ ] Lien vidéo
- [ ] Screenshots

### H28 → H30 — Préparer le pitch live

- [ ] Qui présente ? (1-2 personnes max)
- [ ] Qui gère la demo live ? (1 personne sur le laptop)
- [ ] Qui branche le Ledger ? (la personne à côté du laptop)
- [ ] Fallback : si le Ledger plante en live, basculer sur la vidéo pré-enregistrée

---

## Checklist finale de submission

### Repo GitHub
- [ ] README complet (description, archi, install, vidéo, screenshots)
- [ ] Code propre, pas de secrets dans le repo
- [ ] `.env.example` documenté
- [ ] `LICENSE` (MIT)
- [ ] Lien vers la vidéo dans le README

### Track Unlink ($3,000)
- [ ] `@unlink-xyz/sdk` utilisé dans le code
- [ ] Au moins 1 transaction privée réussie sur Base Sepolia
- [ ] Liens Basescan montrant la privacy (burners non-liés)
- [ ] Vidéo demo ≤ 3 min

### Track Arc/Circle ($6,000)
- [ ] Protocole x402 fonctionnel avec `@x402/fetch` + `@x402/evm`
- [ ] Diagramme d'architecture dans le README
- [ ] Vidéo demo montrant l'agent qui paie
- [ ] Soumission taggée "Agentic Economy with Nanopayments"

### Track Ledger ($6,000)
- [ ] Ledger DMK utilisé comme trust layer
- [ ] Human-in-the-loop : approve/reject sur gros montants
- [ ] Clear Signing JSON (ERC-7730) créé
- [ ] Section "DX Feedback" dans le README

---

## Risques et fallbacks

| Risque | Proba | Impact | Fallback |
|--------|-------|--------|----------|
| Unlink SDK bug / mal documenté | Moyenne | Bloquant | Tester dès H0. Si bloqué : simuler le pool avec des transfers directs + documenter le problème |
| x402 facilitator indisponible sur Base Sepolia | Moyenne | Bloquant | Vérifier dès H2. Fallback : self-host le facilitator depuis le repo x402 |
| Ledger DMK connexion instable | Haute | Dégradant | Tester USB tôt. Si USB fail : BLE. Si tout fail : Speculos (simulateur) + montrer le code |
| Withdraw Unlink trop lent (>10s) | Moyenne | UX | Pré-fund des burner wallets en avance. Pool de 3-5 burners prêts |
| Plus de USDC testnet | Faible | Bloquant | Faucet dès H0, demander 100+ USDC. Garder une réserve |
| Le flow E2E ne fonctionne pas à H10 | Moyenne | Critique | Réduire le scope : faire marcher juste auto-approve (sans Ledger). Le Ledger devient une demo séparée |

---

## Règle d'or

> **Si ça marche en demo, ça suffit.**
>
> Un flow end-to-end qui fonctionne > dix features à moitié finies.
> Pas de over-engineering. Pas de tests unitaires. Pas de CI/CD.
>
> Le seul livrable qui compte : une vidéo de 3 minutes où un agent paie une API de manière privée, avec un Ledger qui approuve les gros montants, et Basescan qui prouve que la privacy fonctionne.
