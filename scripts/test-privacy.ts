import "dotenv/config"
import { privacyRouter } from "../src/core/privacy.js"

const UNLINK_API_KEY = process.env.UNLINK_API_KEY
const AGENT_MNEMONIC = process.env.AGENT_MNEMONIC
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"

if (!UNLINK_API_KEY || !AGENT_MNEMONIC || !EVM_PRIVATE_KEY) {
  console.error("Missing env vars: UNLINK_API_KEY, AGENT_MNEMONIC, EVM_PRIVATE_KEY")
  process.exit(1)
}

async function main() {
  console.log("=== SecretPay Privacy Module Test ===\n")

  // 1. Init
  console.log("[1] Initializing Unlink client...")
  await privacyRouter.init({
    apiKey: UNLINK_API_KEY!,
    mnemonic: AGENT_MNEMONIC!,
    evmPrivateKey: EVM_PRIVATE_KEY,
    rpcUrl: RPC_URL,
  })

  // 2. Check balance
  console.log("\n[2] Checking pool balance...")
  const balanceBefore = await privacyRouter.getBalance()
  console.log(`    Balance: ${balanceBefore} USDC`)

  if (parseFloat(balanceBefore) < 0.01) {
    console.log("\n[!] Balance too low. Depositing 1 USDC into pool...")
    await privacyRouter.deposit("1")
    const balanceAfterDeposit = await privacyRouter.getBalance()
    console.log(`    Balance after deposit: ${balanceAfterDeposit} USDC`)
  }

  // 3. Withdraw to burner
  console.log("\n[3] Withdrawing 0.01 USDC to burner wallet...")
  const burner = await privacyRouter.withdrawToBurner("0.01")
  console.log(`    Burner address: ${burner.address}`)
  console.log(`    Basescan: https://sepolia.basescan.org/address/${burner.address}`)

  // 4. Check balance after
  console.log("\n[4] Checking pool balance after withdraw...")
  const balanceAfter = await privacyRouter.getBalance()
  console.log(`    Balance: ${balanceAfter} USDC`)

  console.log("\n=== Test complete ===")
}

main().catch((err) => {
  console.error("\nTest failed:", err)
  process.exit(1)
})
