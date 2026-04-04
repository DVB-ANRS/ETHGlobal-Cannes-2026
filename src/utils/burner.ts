import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { createWalletClient, createPublicClient, http, parseUnits } from "viem"
import { baseSepolia } from "viem/chains"
import { appConfig } from "./config.js"
import { logger } from "./logger.js"

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const
const USDC_DECIMALS = 6

const erc20TransferAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

export interface BurnerWallet {
  address: `0x${string}`
  privateKey: `0x${string}`
}

export function generateBurner(): BurnerWallet {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  return {
    address: account.address,
    privateKey,
    toJSON() { return { address: account.address } },
  } as BurnerWallet
}

/**
 * Sends USDC from the backup wallet to a fresh burner address.
 * Returns the txHash on success, or null on failure.
 * If BACKUP_BURNER_PRIVATE_KEY is not configured, returns null immediately.
 */
export async function fundBurnerFromBackup(
  burnerAddress: `0x${string}`,
  amountUsdc: number,
): Promise<{ txHash: string } | null> {
  const key = appConfig.backupBurnerPrivateKey
  if (!key) return null

  try {
    const account = privateKeyToAccount(key)
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(appConfig.rpcUrl),
    })
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(appConfig.rpcUrl),
    })

    const amount = parseUnits(amountUsdc.toString(), USDC_DECIMALS)

    logger.privacy(`Backup wallet ${account.address.slice(0, 10)}... → ${burnerAddress.slice(0, 10)}... (${amountUsdc} USDC)`)

    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [burnerAddress, amount],
    })

    await publicClient.waitForTransactionReceipt({ hash: txHash })
    logger.privacy(`Backup transfer confirmed: ${txHash}`)
    return { txHash }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.privacy(`⚠ Backup wallet transfer failed: ${msg}`)
    return null
  }
}
