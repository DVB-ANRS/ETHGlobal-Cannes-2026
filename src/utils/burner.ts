import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

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
