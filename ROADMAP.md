# ShadowPay — Roadmap Hackathon (36h, 4 devs)

## Team Roles

| Role | Alias | Focus |
|------|-------|-------|
| **Dev 1** — Backend Lead | `@backend` | Express server, Gateway, API routes, orchestration |
| **Dev 2** — Privacy Engineer | `@privacy` | Unlink SDK, burner wallets, privacy router |
| **Dev 3** — Payment Engineer | `@payment` | x402 protocol, mock server, Circle nanopayments |
| **Dev 4** — Trust Layer + Demo | `@trust` | Ledger DMK, Policy Engine, demo script, video |

---

## Phase 0 — Setup (H0 → H2) `Vendredi 20h → 22h`

**Objectif** : Tout le monde peut run le projet en local.

| Qui | Tache | Livrable | Done quand... |
|-----|-------|----------|---------------|
| `@backend` | Init repo : `pnpm init`, tsconfig strict, structure `src/`, ESLint, .env.example, .gitignore | Repo clonable, `pnpm dev` démarre sans erreur | `pnpm dev` affiche "Server running on :3000" |
| `@privacy` | Get Unlink API key, get Base Sepolia ETH (faucet), get USDC test tokens | .env rempli avec UNLINK_API_KEY + mnemonic | `createUnlink()` ne crash pas |
| `@payment` | Lire la doc x402, installer `@x402/fetch @x402/evm @x402/core @x402/server`, tester les imports | Imports OK, pas d'erreur TS | Un fichier `src/mock/x402-server.ts` qui compile |
| `@trust` | Lire doc Ledger DMK, installer packages, tester la connexion au device physique | Ledger connecté en USB, `startDiscovering()` trouve le device | Console log "Connected to device: ..." |

**Sync point H2** : Tout le monde pull main, vérifie que `pnpm dev` marche.

---

## Phase 1 — Fondations isolées (H2 → H6) `Vendredi 22h → Samedi 2h`

**Objectif** : Chaque brique fonctionne en isolation.

### `@backend` — Express Server + Agent Routes

```
src/server.ts          → Express app, cors, json middleware
src/routes/agent.ts    → POST /agent/request (stub), GET /balance (stub), GET /history (stub)
src/routes/health.ts   → GET /health
src/types/index.ts     → AgentRequest, AgentResponse, PaymentRecord interfaces
```

**Test** : `curl POST localhost:3000/agent/request` retourne un stub JSON.

### `@privacy` — Unlink SDK Integration

```
src/core/privacy.ts    → classe PrivacyRouter
  - init(apiKey, mnemonic)     → createUnlink()
  - deposit(amount)            → fund le pool (one-time)
  - withdrawToBurner(amount)   → withdraw vers une adresse donnée
  - getBalance()               → balance dans le pool
```

**Test** : Script standalone qui fait `deposit(1 USDC)` puis `withdraw(0.01 USDC)` vers une adresse random. Vérifier sur basescan.

### `@payment` — Mock x402 Server + Client

```
src/mock/x402-server.ts   → Express + @x402/server middleware
  - GET /data         → protégé, $0.01, retourne { data: "secret financial data" }
  - GET /news         → protégé, $0.005, retourne { news: [...] }
  - GET /bulk-data    → protégé, $10, retourne un gros dataset

src/core/payment.ts    → fonction createX402Fetch(privateKey) → fetch wrapper
```

**Test** : Lancer le mock server sur :4021. Depuis un script, faire un `fetchWithPayment("localhost:4021/data")` avec une clé privée funded — le paiement passe, les données sont retournées.

### `@trust` — Ledger Connection + Policy Engine

```
src/core/policy.ts     → classe PolicyEngine
  - loadConfig(path)                → lit policy.json
  - evaluate(amount, recipient)     → "auto" | "ledger" | "denied"
  - recordSpending(amount)          → track daily spending
  - resetDaily()                    → reset le compteur

src/config/policy.json → {
  maxPerTransaction: 5,
  maxPerDay: 50,
  allowedRecipients: [],
  blockedRecipients: []
}

src/core/ledger.ts     → classe LedgerBridge
  - connect()                   → discover + connect au device
  - requestApproval(txDetails)  → affiche sur le Ledger, attend approve/reject
  - disconnect()                → cleanup
```

**Test** : `PolicyEngine.evaluate(0.01, "0x...")` retourne `"auto"`. `PolicyEngine.evaluate(10, "0x...")` retourne `"ledger"`.
**Test Ledger** : `LedgerBridge.connect()` → device trouvé. `requestApproval({amount: 10, recipient: "DataAPI"})` → affiche sur l'écran du Ledger.

**Sync point H6** : Chaque dev fait une demo de sa brique en isolation. 4 features qui marchent séparément.

---

## Phase 2 — Intégration Gateway (H6 → H10) `Samedi 2h → 6h`

**Objectif** : Le Gateway orchestre tout le flow end-to-end.

### `@backend` + `@privacy` — Gateway + Privacy Router

```
src/core/gateway.ts    → classe AgentGateway
  - handleRequest(agentRequest)
    1. Proxy la requête HTTP vers l'URL cible
    2. Si réponse 200 → retourner directement
    3. Si réponse 402 → extraire le prix du header
    4. Appeler PolicyEngine.evaluate(prix, destinataire)
    5. Si "auto" → PrivacyRouter.withdrawToBurner(prix)
    6. Si "ledger" → LedgerBridge.requestApproval() → si OK → withdrawToBurner
    7. Si "denied" → retourner erreur à l'agent
    8. Créer un x402 fetch avec la clé du burner
    9. Retenter la requête avec le paiement
    10. Retourner la réponse à l'agent
```

| Qui | Tache |
|-----|-------|
| `@backend` | Implémenter `gateway.ts` — le chef d'orchestre. Wire les routes `/agent/*` vers le gateway. |
| `@privacy` | Connecter `privacy.ts` au gateway. S'assurer que `withdrawToBurner` crée un burner via `utils/burner.ts`, fait le withdraw Unlink, et retourne la clé privée du burner. |
| `@payment` | S'assurer que `createX402Fetch(burnerKey)` fonctionne quand appelé par le gateway. Débugger le flow 402 → sign → retry avec le mock server. |
| `@trust` | Intégrer le Policy Engine dans le gateway. Tester le branch "ledger required". |

**Sync point H10** : Le flow complet fonctionne pour le cas "auto-approve" :
```
Agent → POST /agent/request → Gateway → 402 détecté → auto-approve
  → Unlink withdraw → burner wallet → x402 payment → API response → Agent
```

---

## Phase 3 — Ledger Flow + E2E (H10 → H14) `Samedi 6h → 10h`

**Objectif** : Le flow Ledger fonctionne. Le E2E est solide.

| Qui | Tache |
|-----|-------|
| `@backend` | Ajouter le stockage in-memory des PaymentRecords. Implémenter GET /agent/history et GET /agent/balance (via PrivacyRouter.getBalance). |
| `@privacy` | Optimisation : pré-fund 2-3 burner wallets en avance pour réduire la latence de withdraw. Gérer le cas "insufficient balance". |
| `@payment` | Tester avec différents montants ($0.001, $0.01, $1, $10). Vérifier que le mock server accepte tous les paiements. |
| `@trust` | **Flow Ledger complet** : gateway détecte "ledger" → LedgerBridge.requestApproval() → device affiche montant/destinataire → approve → continue le flow. Créer le fichier Clear Signing JSON (ERC-7730). |

**Tests E2E à valider** :

| # | Scénario | Attendu |
|---|----------|---------|
| 1 | Agent GET /data ($0.01) — sous le seuil | Auto-approve, données retournées |
| 2 | Agent GET /bulk-data ($10) — au-dessus du seuil | Ledger prompt → approve → données retournées |
| 3 | Agent GET /bulk-data ($10) — Ledger reject | Erreur retournée à l'agent |
| 4 | Agent GET /data × 100 — dépasse maxPerDay | À un moment le Policy Engine switch à "ledger" |
| 5 | Agent GET avec recipient en blacklist | "denied" immédiat |

**Sync point H14** : Demo run-through complet en équipe. Tout le monde regarde le flow de bout en bout.

---

## Phase 4 — Privacy Proof + Polish (H14 → H18) `Samedi 10h → 14h`

**Objectif** : Prouver onchain que la privacy fonctionne. Polish pour la demo.

| Qui | Tache |
|-----|-------|
| `@backend` | Logging propre pour la demo (pas de noise, juste les étapes clés). Ajouter des timestamps aux PaymentRecords. Cleanup code, remove dead code. |
| `@privacy` | **Privacy proof** : montrer sur basescan que le deposit vient de l'opérateur, mais le paiement vient d'une adresse inconnue. Préparer les screenshots/liens basescan pour la video. |
| `@payment` | Vérifier que le facilitator x402 fonctionne sur Base Sepolia. Fallback : si le facilitator public ne marche pas, documenter et utiliser un facilitator self-hosted. |
| `@trust` | Tester le Clear Signing JSON sur le device physique. Préparer le Ledger pour la demo (app Ethereum installée, Base Sepolia supporté). Écrire le DX feedback pour le README. |

**Tous ensemble (H16-H18)** :
- Fix les derniers bugs
- Dry-run de la demo 3× de suite sans interruption
- Écrire le script de demo minute par minute

---

## Phase 5 — Dashboard (H18 → H22) `Samedi 14h → 18h` (NICE TO HAVE)

**Si le E2E est solide**, `@trust` peut démarrer un dashboard minimal React :

```
dashboard/
├── src/
│   ├── App.tsx              → Layout principal
│   ├── components/
│   │   ├── BalanceCard.tsx   → Affiche la balance Unlink
│   │   ├── HistoryTable.tsx  → Liste des paiements
│   │   └── PendingApproval.tsx → Tx en attente de Ledger
│   └── hooks/
│       └── useApi.ts        → Fetch vers le backend
```

**Si le E2E n'est pas solide** : skip le dashboard, focus sur la stabilité et la demo CLI.

---

## Phase 6 — Demo & Submission (H22 → H30) `Samedi 18h → Dimanche 2h`

| Heure | Qui | Tache |
|-------|-----|-------|
| H22-H24 | Tous | **Enregistrer la vidéo de demo** (max 3 min). Script : |
| | | 1. (0:00-0:30) Expliquer le problème — agent payments sont publics |
| | | 2. (0:30-1:00) Montrer l'architecture ShadowPay |
| | | 3. (1:00-1:45) Demo live : agent fait une requête → auto-approve → paiement privé |
| | | 4. (1:45-2:15) Demo live : grosse requête → Ledger approval → paiement |
| | | 5. (2:15-2:45) Montrer basescan : impossible de tracer le paiement |
| | | 6. (2:45-3:00) Récap : 3 sponsors, 1 solution cohérente |
| H24-H26 | `@backend` | README complet : install, architecture, screenshots |
| H24-H26 | `@privacy` | Documenter la privacy proof (liens basescan, explication) |
| H24-H26 | `@payment` | Documenter l'intégration x402/nanopayments |
| H24-H26 | `@trust` | Documenter Ledger DX feedback (obligatoire pour le track Ledger) |
| H26-H28 | Tous | Submit sur les 3 tracks ETHGlobal |
| H28-H30 | Tous | Préparer le pitch live (slides optionnel, la demo parle d'elle-même) |

---

## Checklist de submission finale

### Repo GitHub
- [ ] README avec : description, architecture diagram, install instructions, demo video link
- [ ] Code propre, pas de secrets dans le repo
- [ ] .env.example avec toutes les variables documentées
- [ ] LICENSE (MIT)

### Track Unlink ($3,000)
- [ ] `@unlink-xyz/sdk` utilisé
- [ ] Au moins 1 tx privée réussie sur Base Sepolia
- [ ] Lien basescan montrant la privacy
- [ ] Video demo

### Track Arc/Circle ($6,000)
- [ ] x402 protocol fonctionnel avec nanopayments
- [ ] Architecture diagram dans le README
- [ ] Video demo montrant l'agent qui paie
- [ ] Soumission taggée "Agentic Economy with Nanopayments"

### Track Ledger ($6,000)
- [ ] Agent utilise Ledger comme trust layer
- [ ] Human-in-the-loop : Ledger approve/reject sur gros montants
- [ ] Clear Signing JSON (ERC-7730) créé
- [ ] DX feedback section dans le README

---

## Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Unlink SDK ne marche pas / mal documenté | Moyenne | Bloquant | Tester le SDK en isolation dès H0. Fallback : simuler le privacy pool avec des transfers directs + documenter ce qui n'a pas marché |
| x402 facilitator pas dispo sur Base Sepolia | Moyenne | Bloquant | Vérifier dès H2. Fallback : self-host le facilitator depuis le repo x402 |
| Ledger DMK connexion instable | Haute | Dégradant | Avoir le Ledger connecté tôt. Si USB ne marche pas, tester BLE. Worst case : mocker le Ledger pour la video et montrer le code |
| Latence Unlink withdraw trop haute (>10s) | Moyenne | UX | Pré-fund des burner wallets. Pool de 3-5 burners prêts à l'emploi |
| Circle nanopayments en beta/cassé | Faible | Bloquant | x402 est open source, le flow fonctionne même sans Circle settlement — le facilitator gère |
| Pas assez de testnet USDC | Faible | Bloquant | Faucet Unlink + Circle faucet dès H0. Demander 100+ USDC de test |

---

## Règle d'or du hackathon

> **Si ça marche en demo, ça suffit.**
> 
> Pas de over-engineering. Pas de tests unitaires exhaustifs. Pas de CI/CD.
> Un flow qui marche de bout en bout > dix features à moitié finies.
> 
> Le seul livrable qui compte : une video de 3 minutes où un agent paie une API de manière privée, avec un Ledger qui approuve les gros montants.
