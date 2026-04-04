import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { logger } from "../utils/logger.js";
import { appConfig } from "../utils/config.js";

/**
 * Creates a payment-enabled fetch wrapper from a burner wallet's private key.
 * The wrapper automatically handles 402 Payment Required responses by signing
 * and retrying with a valid x402 payment payload.
 */
export function createPaymentFetch(
  burnerPrivateKey: `0x${string}`
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  // 1. Create viem account from the burner's private key
  const account = privateKeyToAccount(burnerPrivateKey);

  // 2. Create public client for readContract support (EIP-3009 detection on USDC)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(appConfig.rpcUrl),
  });

  // 3. Adapt viem account to x402 ClientEvmSigner interface
  const signer = toClientEvmSigner(account, publicClient);

  // 4. Create the Exact EVM scheme client for Base Sepolia
  const scheme = new ExactEvmScheme(signer, {
    rpcUrl: appConfig.rpcUrl,
  });

  // 5. Wrap native fetch with x402 payment handling
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:84532",
        client: scheme,
      },
    ],
  });

  logger.payment(`Payment fetch ready for burner ${account.address}`);
  return fetchWithPayment;
}
