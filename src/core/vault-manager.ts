import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
  type UnlinkClient,
} from "@unlink-xyz/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  verifyMessage,
  keccak256,
  toBytes,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { generateBurner, type BurnerWallet } from "../utils/burner.js";
import { logger } from "../utils/logger.js";
import { appConfig } from "../utils/config.js";
import type { AgentPolicy, UserVault } from "../types/index.js";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;
const ENGINE_URL = "https://staging-api.unlink.xyz";
const TERMINAL_STATES = new Set(["relayed", "processed"]);
const SIGN_MESSAGE_PREFIX = "SecretPay vault access for ";

// ─── In-memory stores ────────────────────────────────────────────────

const vaults = new Map<string, UserVault>();
const unlinkClients = new Map<string, UnlinkClient>();
const agentToOwner = new Map<string, string>(); // agentAddress → walletAddress

// ─── Mnemonic derivation from wallet signature ──────────────────────

function deriveMessage(walletAddress: string): string {
  return `${SIGN_MESSAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

function deriveMnemonic(signature: string): string {
  const hash = keccak256(toBytes(signature));
  // keccak256 returns 32 bytes hex, we need 16 bytes for 12-word mnemonic
  const entropy = toBytes(hash).slice(0, 16);
  return entropyToMnemonic(entropy, english);
}

// ─── Signature verification ─────────────────────────────────────────

async function verifyWalletSignature(
  walletAddress: string,
  signature: string
): Promise<boolean> {
  // Use lowercased address for consistent message derivation
  const message = deriveMessage(walletAddress.toLowerCase());
  const valid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });
  return valid;
}

// ─── Unlink client creation ─────────────────────────────────────────

function createUnlinkClient(mnemonic: string): UnlinkClient {
  const evmAccount = privateKeyToAccount(appConfig.agentEvmPrivateKey);
  const rpcUrl = appConfig.rpcUrl;

  const walletClient = createWalletClient({
    account: evmAccount,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  return createUnlink({
    engineUrl: ENGINE_URL,
    apiKey: appConfig.unlinkApiKey,
    account: unlinkAccount.fromMnemonic({ mnemonic }),
    evm: unlinkEvm.fromViem({ walletClient, publicClient }),
  });
}

async function waitForCompletion(client: UnlinkClient, txId: string): Promise<void> {
  const confirmed = await client.pollTransactionStatus(txId, { timeoutMs: 120_000 });
  if (TERMINAL_STATES.has(confirmed.status)) return;
  if (confirmed.status === "failed") throw new Error(`Transaction ${txId} failed`);
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const s = await client.pollTransactionStatus(txId, { timeoutMs: 10_000 });
    logger.privacy(`  Poll ${i + 1}/12 — status: ${s.status}`);
    if (TERMINAL_STATES.has(s.status)) return;
    if (s.status === "failed") throw new Error(`Transaction ${txId} failed`);
  }
  throw new Error(`Transaction ${txId} stuck`);
}

// ─── Public API ─────────────────────────────────────────────────────

export const vaultManager = {
  deriveMessage,

  async setup(
    walletAddress: string,
    signature: string
  ): Promise<{ registered: boolean; balance: string }> {
    // Verify with original address (checksummed), store with lowercased
    const valid = await verifyWalletSignature(walletAddress, signature);
    if (!valid) throw new Error("Invalid signature");
    const addr = walletAddress.toLowerCase();

    // If already set up, just return balance
    if (vaults.has(addr) && unlinkClients.has(addr)) {
      const client = unlinkClients.get(addr)!;
      const balance = await getBalance(client);
      return { registered: true, balance };
    }

    const mnemonic = deriveMnemonic(signature);
    const client = createUnlinkClient(mnemonic);

    logger.info(`Registering vault for ${addr.slice(0, 10)}...`);
    await client.ensureRegistered();
    logger.info(`Vault registered for ${addr.slice(0, 10)}...`);

    const vault: UserVault = {
      walletAddress: addr,
      derivedMnemonic: mnemonic,
      vaultReady: true,
      agents: new Map(),
    };

    vaults.set(addr, vault);
    unlinkClients.set(addr, client);

    const balance = await getBalance(client);
    return { registered: true, balance };
  },

  async deposit(
    walletAddress: string,
    amount: string
  ): Promise<{ balance: string; txId: string }> {
    const addr = walletAddress.toLowerCase();
    const client = requireClient(addr);
    const amountWei = parseUnits(amount, USDC_DECIMALS).toString();

    logger.privacy(`Approving USDC for ${addr.slice(0, 10)}...`);
    await client.ensureErc20Approval({
      token: USDC_BASE_SEPOLIA,
      amount: amountWei,
    });

    logger.privacy(`Depositing ${amount} USDC for ${addr.slice(0, 10)}...`);
    const result = await client.deposit({
      token: USDC_BASE_SEPOLIA,
      amount: amountWei,
    });

    await waitForCompletion(client, result.txId);
    logger.privacy(`Deposit confirmed for ${addr.slice(0, 10)}...`);

    const balance = await getBalance(client);
    return { balance, txId: result.txId };
  },

  async getBalance(walletAddress: string): Promise<string> {
    const addr = walletAddress.toLowerCase();
    const client = requireClient(addr);
    return getBalance(client);
  },

  addAgent(
    walletAddress: string,
    agentAddress: string,
    policy: { label?: string; maxPerTx?: number }
  ): AgentPolicy {
    const addr = walletAddress.toLowerCase();
    const agentAddr = agentAddress.toLowerCase();
    const vault = requireVault(addr);

    const agentPolicy: AgentPolicy = {
      agentAddress: agentAddr,
      label: policy.label,
      maxPerTx: policy.maxPerTx ?? appConfig.maxPerTx,
    };

    vault.agents.set(agentAddr, agentPolicy);
    agentToOwner.set(agentAddr, addr);
    logger.info(`Agent ${agentAddr.slice(0, 10)}... whitelisted for ${addr.slice(0, 10)}...`);
    return agentPolicy;
  },

  removeAgent(walletAddress: string, agentAddress: string): void {
    const addr = walletAddress.toLowerCase();
    const agentAddr = agentAddress.toLowerCase();
    const vault = requireVault(addr);
    vault.agents.delete(agentAddr);
    agentToOwner.delete(agentAddr);
    logger.info(`Agent ${agentAddr.slice(0, 10)}... removed for ${addr.slice(0, 10)}...`);
  },

  listAgents(walletAddress: string): AgentPolicy[] {
    const addr = walletAddress.toLowerCase();
    const vault = requireVault(addr);
    return Array.from(vault.agents.values());
  },

  // ─── Used by the gateway to resolve agent → vault ──────────────

  resolveAgent(agentAddress: string): {
    client: UnlinkClient;
    policy: AgentPolicy;
    walletAddress: string;
  } | null {
    const agentAddr = agentAddress.toLowerCase();
    const ownerAddr = agentToOwner.get(agentAddr);
    if (!ownerAddr) return null;

    const vault = vaults.get(ownerAddr);
    const client = unlinkClients.get(ownerAddr);
    if (!vault || !client) return null;

    const policy = vault.agents.get(agentAddr);
    if (!policy) return null;

    return { client, policy, walletAddress: ownerAddr };
  },

  async withdrawForAgent(
    agentAddress: string,
    amountUsdc: string
  ): Promise<BurnerWallet> {
    const resolved = this.resolveAgent(agentAddress);
    if (!resolved) throw new Error(`Agent ${agentAddress} not registered`);

    const { client, policy } = resolved;
    const amount = parseFloat(amountUsdc);

    // Policy checks
    if (amount > policy.maxPerTx) {
      throw new Error(
        `Amount $${amountUsdc} exceeds agent limit $${policy.maxPerTx}/tx`
      );
    }
    // Check balance before attempting withdraw
    const balance = await getBalance(client);
    if (parseFloat(balance) < amount) {
      throw new Error(
        `Insufficient pool balance: need $${amountUsdc}, have $${balance}`
      );
    }

    const burner = generateBurner();
    const amountWei = parseUnits(amountUsdc, USDC_DECIMALS).toString();

    logger.privacy(`Withdrawing ${amountUsdc} USDC → burner ${burner.address}`);
    const result = await client.withdraw({
      recipientEvmAddress: burner.address,
      token: USDC_BASE_SEPOLIA,
      amount: amountWei,
    });

    await waitForCompletion(client, result.txId);
    logger.privacy(`Burner funded: ${burner.address}`);

    return burner;
  },

  async getBalanceForAgent(agentAddress: string): Promise<string> {
    const resolved = this.resolveAgent(agentAddress);
    if (!resolved) throw new Error(`Agent ${agentAddress} not registered`);
    return getBalance(resolved.client);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────

function requireVault(walletAddress: string): UserVault {
  const vault = vaults.get(walletAddress);
  if (!vault) throw new Error(`No vault for wallet ${walletAddress}`);
  return vault;
}

function requireClient(walletAddress: string): UnlinkClient {
  const client = unlinkClients.get(walletAddress);
  if (!client) throw new Error(`No Unlink client for wallet ${walletAddress} — call setup first`);
  return client;
}

async function getBalance(client: UnlinkClient): Promise<string> {
  const { balances } = await client.getBalances({ token: USDC_BASE_SEPOLIA });
  const raw = balances[0]?.amount ?? "0";
  return formatUnits(BigInt(raw), USDC_DECIMALS);
}
