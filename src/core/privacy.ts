import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
  type UnlinkClient,
} from "@unlink-xyz/sdk"
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { generateBurner, fundBurnerFromBackup, type BurnerWallet } from "../utils/burner.js"
import { logger } from "../utils/logger.js"

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const USDC_DECIMALS = 6
const ENGINE_URL = process.env.UNLINK_API_URL ?? "https://staging-api.unlink.xyz"
const TERMINAL_STATES = new Set(["relayed", "processed"])

interface InitParams {
  apiKey: string
  mnemonic: string
  evmPrivateKey: `0x${string}`
  rpcUrl?: string
}

class PrivacyRouter {
  private client: UnlinkClient | null = null

  async init(params: InitParams): Promise<void> {
    if (this.client) {
      logger.privacy("Already initialized, skipping")
      return
    }
    const rpcUrl = params.rpcUrl ?? "https://sepolia.base.org"

    const evmAccount = privateKeyToAccount(params.evmPrivateKey)

    const walletClient = createWalletClient({
      account: evmAccount,
      chain: baseSepolia,
      transport: http(rpcUrl),
    })

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    })

    this.client = createUnlink({
      engineUrl: ENGINE_URL,
      apiKey: params.apiKey,
      account: unlinkAccount.fromMnemonic({ mnemonic: params.mnemonic }),
      evm: unlinkEvm.fromViem({ walletClient, publicClient }),
    })

    await this.client.ensureRegistered()
    logger.privacy(`Initialized — EVM wallet ${evmAccount.address}`)
  }

  async deposit(amountUsdc: string): Promise<void> {
    this.validateAmount(amountUsdc)
    const c = this.requireClient()
    const amountWei = parseUnits(amountUsdc, USDC_DECIMALS).toString()

    logger.privacy(`Approving USDC for Permit2...`)
    const approval = await c.ensureErc20Approval({
      token: USDC_BASE_SEPOLIA,
      amount: amountWei,
    })
    if (approval.status === "submitted") {
      logger.privacy(`Approval tx submitted, waiting...`)
    }

    logger.privacy(`Depositing ${amountUsdc} USDC into pool...`)
    const result = await c.deposit({
      token: USDC_BASE_SEPOLIA,
      amount: amountWei,
    })
    logger.privacy(`Deposit submitted (txId: ${result.txId}), polling...`)

    await this.waitForCompletion(c, result.txId)
    logger.privacy(`Deposit confirmed`)
  }

  async withdrawToBurner(amountUsdc: string): Promise<BurnerWallet> {
    this.validateAmount(amountUsdc)
    const c = this.requireClient()
    const burner = generateBurner()
    const amountWei = parseUnits(amountUsdc, USDC_DECIMALS).toString()
    const amountNum = Number(amountUsdc)

    logger.privacy(`Funding burner ${burner.address} with ${amountUsdc} USDC (parallel paths)`)

    // Fire both funding paths in parallel
    const [unlinkResult, backupResult] = await Promise.allSettled([
      // Path A: Unlink privacy pool → burner
      (async () => {
        const result = await c.withdraw({
          recipientEvmAddress: burner.address,
          token: USDC_BASE_SEPOLIA,
          amount: amountWei,
        })
        logger.privacy(`Unlink withdraw submitted (txId: ${result.txId}), polling...`)
        await this.waitForCompletion(c, result.txId)
        logger.privacy(`Unlink withdraw confirmed ✓`)
      })(),
      // Path B: Backup wallet → burner (direct USDC transfer)
      fundBurnerFromBackup(burner.address, amountNum),
    ])

    const unlinkOk = unlinkResult.status === "fulfilled"
    const backupOk = backupResult.status === "fulfilled" && backupResult.value !== null

    if (!unlinkOk && !backupOk) {
      const unlinkErr = unlinkResult.status === "rejected" ? unlinkResult.reason : "unknown"
      throw new Error(`Both funding paths failed — burner has no funds (unlink: ${unlinkErr})`)
    }

    logger.privacy(`Burner funded: unlink=${unlinkOk}, backup=${backupOk}`)
    return burner
  }

  async getBalance(): Promise<string> {
    const c = this.requireClient()
    const { balances } = await c.getBalances({ token: USDC_BASE_SEPOLIA })
    const raw = balances[0]?.amount ?? "0"
    return formatUnits(BigInt(raw), USDC_DECIMALS)
  }

  private async waitForCompletion(c: UnlinkClient, txId: string): Promise<void> {
    const confirmed = await c.pollTransactionStatus(txId, { timeoutMs: 120_000 })
    if (TERMINAL_STATES.has(confirmed.status)) {
      logger.privacy(`  Status: ${confirmed.status} ✓`)
      return
    }
    if (confirmed.status === "failed") {
      throw new Error(`Transaction ${txId} failed`)
    }
    // Still in intermediate state — poll a few more times
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5_000))
      const s = await c.pollTransactionStatus(txId, { timeoutMs: 10_000 })
      logger.privacy(`  Poll ${i + 1}/12 — status: ${s.status}`)
      if (TERMINAL_STATES.has(s.status)) return
      if (s.status === "failed") throw new Error(`Transaction ${txId} failed`)
    }
    throw new Error(`Transaction ${txId} stuck at non-terminal state`)
  }

  private validateAmount(amountUsdc: string): void {
    const n = Number(amountUsdc)
    if (!amountUsdc || isNaN(n) || n <= 0 || n > 10_000) {
      throw new Error(`Invalid USDC amount: "${amountUsdc}" (must be 0 < amount <= 10000)`)
    }
  }

  private requireClient(): UnlinkClient {
    if (!this.client) throw new Error("PrivacyRouter not initialized — call init() first")
    return this.client
  }
}

export const privacyRouter = new PrivacyRouter()
