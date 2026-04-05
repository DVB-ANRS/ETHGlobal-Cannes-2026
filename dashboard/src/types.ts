export interface LedgerProof {
  message: string
  signature: { v: number; r: string; s: string }
  signerAddress: string
}

export interface PaymentRecord {
  id: string
  timestamp: number
  url: string
  amount: string
  recipient: string
  burner: string
  policy: 'auto' | 'ledger' | 'denied'
  status: 'pending' | 'approved' | 'rejected' | 'denied'
  txHash?: string
  ledgerProof?: LedgerProof
  agentId?: string
}

export interface PolicyConfig {
  maxPerTransaction: number
  allowedRecipients: string[]
  blockedRecipients: string[]
}
