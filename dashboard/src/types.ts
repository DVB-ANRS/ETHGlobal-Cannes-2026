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
}

export interface PolicyConfig {
  maxPerTransaction: number
  allowedRecipients: string[]
  blockedRecipients: string[]
}
