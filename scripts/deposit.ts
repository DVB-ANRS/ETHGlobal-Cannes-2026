/**
 * Deposit USDC into the Unlink privacy pool
 *
 * Usage:
 *   pnpm tsx scripts/deposit.ts         → deposit 5 USDC (default)
 *   pnpm tsx scripts/deposit.ts 10      → deposit 10 USDC
 */

import { privacyRouter } from "../src/core/privacy.js";
import { appConfig } from "../src/utils/config.js";
import { logger } from "../src/utils/logger.js";

const amount = process.argv[2] ?? "5";

async function main() {
  logger.info(`Initializing Unlink client...`);
  await privacyRouter.init({
    apiKey: appConfig.unlinkApiKey,
    mnemonic: appConfig.agentMnemonic,
    evmPrivateKey: appConfig.agentEvmPrivateKey,
    rpcUrl: appConfig.rpcUrl,
  });

  const before = await privacyRouter.getBalance();
  logger.info(`Balance avant: ${before} USDC`);

  logger.info(`Depositing ${amount} USDC...`);
  await privacyRouter.deposit(amount);

  const after = await privacyRouter.getBalance();
  logger.info(`Balance après: ${after} USDC`);
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
