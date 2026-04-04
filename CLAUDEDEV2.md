# SecretPay — Dev 2 (@privacy) Instructions

## Identity & Scope

You are **Dev 2 (@privacy)** — Privacy Engineer on the SecretPay hackathon project.
**ETHGlobal Cannes 2026 | Team DVB | Deadline: April 5, 2026.**

You own the **Unlink SDK integration** and **burner wallet generation**. Your work is the core of the Unlink track ($3,000 prize).

---

## Your Files (ONLY these — do NOT touch anything else)

| File | Action | Description |
|------|--------|-------------|
| `src/utils/burner.ts` | **CREATE** | Burner wallet generation (viem) |
| `src/core/privacy.ts` | **CREATE** | PrivacyRouter class wrapping `@unlink-xyz/sdk` |
| `scripts/test-privacy.ts` | **CREATE** | Standalone test script proving the module works |

**OFF-LIMITS files** (owned by other devs):
- `src/server.ts`, `src/routes/*` — Dev 1 (@backend)
- `src/core/gateway.ts` — Dev 1 (@backend)
- `src/core/payment.ts`, `src/mock/*`, `src/demo/*` — Dev 3 (@payment)
- `src/core/policy.ts`, `src/core/ledger.ts`, `src/config/policy.json` — Dev 4 (@trust)
- `src/types/index.ts`, `src/utils/config.ts`, `src/utils/logger.ts` — Dev 1 (@backend)

If you absolutely must suggest a change to another dev's file (e.g., adding an env var to `config.ts`), **document it as a request** — do not edit the file.

---

## Existing Infrastructure You MUST Use

### `src/utils/config.ts` — App Configuration

```typescript
export const appConfig = {
  rpcUrl: string,              // BASE_SEPOLIA_RPC_URL (default: "https://sepolia.base.org")
  get unlinkApiKey(): string,  // from .env — throws if missing
  get agentMnemonic(): string, // from .env — throws if missing
};
```

### `src/utils/logger.ts` — Structured Logging

```typescript
export const logger = {
  privacy: (msg: string) => void, // Green [Privacy] tag — USE THIS for all your logs
  error: (msg: string) => void,   // Red [Error] tag
  info: (msg: string) => void,    // Gray [Info] tag
};
```

### `src/types/index.ts` — Shared Types

Already defines: `AgentRequest`, `AgentResponse`, `PaymentInfo`, `PaymentRecord`, `PolicyDecision`, `PolicyConfig`.

---

## Blockchain Constants

| Resource | Value |
|----------|-------|
| Chain | Base Sepolia (chain ID `84532`) |
| USDC Contract | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Unlink Pool | `0x647f9b99af97e4b79DD9Dd6de3b583236352f482` |
| RPC URL | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |
| USDC Decimals | **6** (1 USDC = `1000000`, 0.01 USDC = `10000`) |

---

## CRITICAL: Real @unlink-xyz/sdk API (v0.0.2-canary.0)

> **WARNING**: The TASKS.md and PROJECT_BIBLE contain simplified pseudo-code that does NOT match the real SDK.
> The information below was extracted from the actual SDK source in `node_modules/@unlink-xyz/sdk/dist/`.
> **Always trust THIS document over TASKS.md when there are conflicts.**

### What TASKS.md says vs What the SDK actually does

| TASKS.md (WRONG) | Real SDK (CORRECT) |
|---|---|
| `createUnlink({ apiKey, mnemonic })` | `createUnlink({ engineUrl, apiKey, account: unlinkAccount.fromMnemonic({ mnemonic }), evm: unlinkEvm.fromViem({ walletClient, publicClient }) })` |
| `unlink.deposit({ amount, token: "USDC" })` | `client.deposit({ token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount: "10000000" })` — token is the ERC-20 address, amount is in wei |
| `unlink.withdraw({ amount, token: "USDC", to: burner.address })` | `client.withdraw({ recipientEvmAddress: burner.address, token: "0x036...", amount: "10000" })` |
| `unlink.getBalance({ token: "USDC" })` | `client.getBalances({ token: "0x036..." })` → returns `{ balances: [{ token, amount }] }` |
| *(not mentioned)* | Must call `client.ensureRegistered()` before first operation |
| *(not mentioned)* | Must call `client.ensureErc20Approval()` before first deposit (Permit2) |
| *(not mentioned)* | Deposits require an EVM provider (viem walletClient) for Permit2 signing |

### SDK Exports

```typescript
import {
  createUnlink,       // Main factory
  unlinkAccount,      // Account providers (.fromMnemonic, .fromSeed, .fromKeys)
  unlinkEvm,          // EVM providers (.fromViem, .fromEthers, .fromSigner)
} from "@unlink-xyz/sdk";
```

### Initialization

```typescript
import { createUnlink, unlinkAccount, unlinkEvm } from "@unlink-xyz/sdk";
import { createWalletClient, createPublicClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// 1. Create viem clients (required — deposits use Permit2 which needs EVM signing)
const evmAccount = mnemonicToAccount(mnemonic);
const walletClient = createWalletClient({
  account: evmAccount,
  chain: baseSepolia,
  transport: http(rpcUrl),
});
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

// 2. Create Unlink client
const client = createUnlink({
  engineUrl: UNLINK_ENGINE_URL,  // SEE "ENGINE URL" SECTION BELOW
  apiKey: apiKey,
  account: unlinkAccount.fromMnemonic({ mnemonic }),
  evm: unlinkEvm.fromViem({ walletClient, publicClient }),
});

// 3. Register account (REQUIRED before any operation)
await client.ensureRegistered();
```

### deposit(params)

```typescript
// First time only: ensure ERC-20 approval for Permit2
await client.ensureErc20Approval({
  token: USDC_ADDRESS,
  amount: amountInWei,
});

// Then deposit
const result = await client.deposit({
  token: USDC_ADDRESS,  // "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  amount: amountInWei,  // string, e.g. "10000000" for 10 USDC
});
// Returns: { txId: string, status: string }
// status: "accepted" | "prepared" | "proving" | "proved" | "broadcasting" | "relayed" | "processed" | "failed"
```

### withdraw(params)

```typescript
const result = await client.withdraw({
  recipientEvmAddress: burnerAddress, // "0x..." — the burner wallet
  token: USDC_ADDRESS,
  amount: amountInWei,                // string, e.g. "10000" for 0.01 USDC
});
// Returns: { txId: string, status: string }
```

Withdraw uses **EdDSA signing** (derived from the mnemonic internally). No EVM signature needed.

### getBalances(params?)

```typescript
const result = await client.getBalances({
  token: USDC_ADDRESS,  // optional filter
});
// Returns: { balances: [{ token: string, amount: string }] }
// amount is in wei
```

### pollTransactionStatus(txId, options?)

```typescript
const result = await client.pollTransactionStatus(txId, {
  intervalMs: 2000,   // default
  timeoutMs: 60000,   // default
});
// Blocks until terminal status: "relayed" | "processed" | "failed"
```

### getTransactions(params?)

```typescript
const result = await client.getTransactions({
  type: "withdraw",  // "deposit" | "transfer" | "withdraw" | "execute"
  limit: 10,
});
// Returns: { transactions: [...], next_cursor?: string }
// Each tx has: id, type, status, tx_hash (when relayed), created_at, etc.
```

### getAddress()

```typescript
const unlinkAddress = await client.getAddress();
// Returns: Bech32m-encoded Unlink address (NOT an EVM address)
```

---

## ENGINE URL — BLOCKER

The `engineUrl` parameter is **required** by `createUnlink()` but is NOT in the project's `.env.example` or CLAUDE.md.

**How to find it:**
1. Check https://docs.unlink.xyz — look for API endpoint / engine URL
2. Check the hackathon API key page: https://hackaton-apikey.vercel.app/ — may display it alongside the API key
3. Search the SDK source: `grep -r "engine" node_modules/@unlink-xyz/sdk/dist/` for any default URL
4. **Ask the user** if none of the above works

**Do NOT guess.** A wrong URL means all SDK calls fail silently or throw.

Once found, read it from `process.env.UNLINK_ENGINE_URL` (since you cannot modify `config.ts`).

---

## Implementation Spec

### File 1: `src/utils/burner.ts`

```typescript
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export interface BurnerWallet {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

export function generateBurner(): BurnerWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}
```

Simple, no dependencies on Unlink. This can be written and validated immediately.

### File 2: `src/core/privacy.ts`

Exports a **singleton** `privacyRouter`. This is the contract that Dev 1's gateway.ts will import.

**Public API (what the gateway calls):**

```typescript
class PrivacyRouter {
  /** Initialize the Unlink client. Called once at server startup. */
  async init(apiKey: string, mnemonic: string): Promise<void>

  /** Deposit USDC into the Unlink privacy pool. Amount in human-readable USDC (e.g. "10"). */
  async deposit(amount: string): Promise<{ txId: string }>

  /** Generate a burner wallet and withdraw USDC from pool to it. Amount in human-readable USDC (e.g. "0.01"). */
  async withdrawToBurner(amount: string): Promise<BurnerWallet>

  /** Get current USDC balance in the pool. Returns human-readable string (e.g. "9.99"). */
  async getBalance(): Promise<string>
}

export const privacyRouter = new PrivacyRouter();
```

**Internal implementation details:**

1. `init()`:
   - Read `UNLINK_ENGINE_URL` and `BASE_SEPOLIA_RPC_URL` from `process.env`
   - Create viem walletClient + publicClient from the mnemonic
   - Create Unlink client with all providers
   - Call `client.ensureRegistered()`
   - Log: `logger.privacy("Initialized — Unlink client ready")`

2. `deposit(amount)`:
   - Convert human amount to wei: `parseFloat(amount) * 1e6`
   - Call `ensureErc20Approval()` then `client.deposit()`
   - Poll with `pollTransactionStatus()` until terminal
   - Log: `logger.privacy(\`Deposited ${amount} USDC into privacy pool\`)`
   - Return `{ txId }`

3. `withdrawToBurner(amount)`:
   - Generate burner via `generateBurner()`
   - Convert amount to wei
   - Call `client.withdraw({ recipientEvmAddress: burner.address, token: USDC, amount: wei })`
   - Poll with `pollTransactionStatus()` until terminal
   - Log: `logger.privacy(\`Withdrew ${amount} USDC → burner ${burner.address}\`)`
   - Return the BurnerWallet `{ address, privateKey }`

4. `getBalance()`:
   - Call `client.getBalances({ token: USDC })`
   - Extract amount from `balances[0]?.amount ?? "0"`
   - Convert from wei to human-readable
   - Return as string

**Amount conversion helpers (internal):**

```typescript
const USDC_DECIMALS = 6;

function toWei(humanAmount: string): string {
  const parts = humanAmount.split(".");
  const integer = parts[0] || "0";
  const decimal = (parts[1] || "").padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  const raw = BigInt(integer) * BigInt(10 ** USDC_DECIMALS) + BigInt(decimal);
  return raw.toString();
}

function fromWei(weiAmount: string): string {
  const total = BigInt(weiAmount);
  const integer = total / BigInt(10 ** USDC_DECIMALS);
  const decimal = (total % BigInt(10 ** USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, "0");
  return `${integer}.${decimal}`.replace(/\.?0+$/, "") || "0";
}
```

Use `BigInt` for precision — no floating point for financial amounts.

### File 3: `scripts/test-privacy.ts`

Standalone script run via `pnpm tsx scripts/test-privacy.ts`.

```
1. Load .env (dotenv)
2. Init privacyRouter
3. Print Unlink address
4. Get and print balance
5. If balance > 0:
   a. Withdraw 0.01 USDC to a burner
   b. Print burner address
   c. Print new balance
   d. Print Basescan link: https://sepolia.basescan.org/address/{burner.address}
   e. Get tx history and print tx hash if available
6. If balance == 0:
   a. Print warning: "Pool is empty — deposit USDC first"
   b. Optionally: deposit a small amount if USDC is available in wallet
```

The test script must produce output suitable for the Unlink track submission — Basescan links proving privacy.

---

## How the Gateway Will Call You

Dev 1 (@backend) will integrate your module in `gateway.ts` like this:

```typescript
import { privacyRouter } from "./privacy.js";

// At server startup (server.ts or gateway constructor):
await privacyRouter.init(appConfig.unlinkApiKey, appConfig.agentMnemonic);

// In the payment flow (step 7 of handleRequest):
const burner = await privacyRouter.withdrawToBurner("0.01");
// → burner.address goes into PaymentRecord
// → burner.privateKey goes to payment.createX402Fetch()

// For GET /agent/balance route:
const balance = await privacyRouter.getBalance();
// → returned as { balance: "9.99", unit: "USDC" }
```

**Your exported API MUST match this contract. Do not change function signatures without coordinating with Dev 1.**

---

## Environment Requirements

### `.env` variables needed by your module:

```env
UNLINK_API_KEY=<from https://hackaton-apikey.vercel.app/>
AGENT_MNEMONIC=<BIP-39 12/24-word mnemonic>
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
UNLINK_ENGINE_URL=<MUST DETERMINE — see ENGINE URL section>
```

### Wallet funding (before testing):

The EVM wallet derived from `AGENT_MNEMONIC` needs:
1. **Base Sepolia ETH** (for gas) → https://www.alchemy.com/faucets/base-sepolia
2. **USDC testnet** (for the pool) → https://faucet.circle.com

**Ask the user to confirm these are funded before running tests.**

---

## Track Unlink — $3,000 Prize Criteria

Your module is the primary deliverable for this track:

| Criterion | How your code satisfies it |
|-----------|---------------------------|
| `@unlink-xyz/sdk` used | `createUnlink()`, `deposit()`, `withdraw()`, `getBalances()` |
| ≥1 private tx on Base Sepolia | `withdrawToBurner()` creates a real onchain withdraw |
| Basescan links showing unlinkable burners | Test script prints burner addresses + Basescan links |
| Video ≤ 3 min + GitHub repo | Your logs are visible in the demo video |

---

## Error Handling

| Scenario | What to do |
|----------|-----------|
| Insufficient pool balance | Throw: `"Insufficient balance in privacy pool: have ${balance}, need ${amount}"` |
| ERC-20 approval fails | Throw with the error from `ensureErc20Approval()` |
| Withdraw times out (>60s) | Let `pollTransactionStatus` throw its timeout error |
| Init fails (bad API key / mnemonic) | Throw immediately — the server should not start |
| Network error (RPC down) | Let it bubble up — gateway handles it |
| Engine URL missing | Throw: `"UNLINK_ENGINE_URL environment variable is required"` |

---

## Fallback — LAST RESORT ONLY

If the Unlink SDK is **completely non-functional** (crashes, API down, no engine URL found):

1. Replace `withdraw()` with a direct viem `sendTransaction` from the agent wallet to the burner
2. This breaks privacy (no ZK pool) but preserves the burner wallet pattern
3. **Document the issue clearly** in code comments and tell the team
4. The privacy proof on Basescan won't work — adjust the demo narrative

**Do NOT use this fallback unless you have exhausted all SDK options and confirmed with the user.**

---

## Validation Checklist

Before marking your work as done:

- [ ] `src/utils/burner.ts` — `generateBurner()` returns `{ address, privateKey }`, both valid hex
- [ ] `src/core/privacy.ts` — `privacyRouter` singleton exported
- [ ] `init()` creates Unlink client, registers, logs success
- [ ] `deposit()` deposits USDC into pool, polls until confirmed
- [ ] `withdrawToBurner()` generates burner, withdraws from pool, polls until confirmed, returns burner
- [ ] `getBalance()` returns human-readable USDC string
- [ ] `scripts/test-privacy.ts` runs standalone, prints balance + burner + Basescan link
- [ ] All operations log via `logger.privacy()`
- [ ] Amount conversion uses BigInt (no floating point rounding issues)
- [ ] No modifications to any file outside your scope
- [ ] TypeScript compiles with `strict: true`
