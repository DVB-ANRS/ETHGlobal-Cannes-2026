import { config } from "dotenv";

config();

function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const appConfig = {
  gatewayPort: parseInt(optional("GATEWAY_PORT", "3000")),
  mockServerPort: parseInt(optional("MOCK_SERVER_PORT", "4021")),
  rpcUrl: optional("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
  maxPerTx: parseFloat(optional("DEFAULT_MAX_PER_TX", "2")),
  backupBurnerPrivateKey: process.env.BACKUP_BURNER_PRIVATE_KEY
    ? (`0x${process.env.BACKUP_BURNER_PRIVATE_KEY.replace(/^0x/, "")}` as `0x${string}`)
    : null,

  get unlinkApiKey() { return require("UNLINK_API_KEY"); },
  get agentMnemonic() { return require("AGENT_MNEMONIC"); },
  get agentEvmPrivateKey() { return require("EVM_PRIVATE_KEY") as `0x${string}`; },
  get mockReceiverAddress() { return require("MOCK_RECEIVER_ADDRESS"); },
  get mockReceiverPrivateKey() { return require("MOCK_RECEIVER_PRIVATE_KEY"); },
};
