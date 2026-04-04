export interface AgentRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PaymentInfo {
  amount: string;
  recipient: string;
  burner: string;
  policy: "auto-approve" | "ledger-approved" | "denied";
  txHash?: string;
}

export interface AgentResponse {
  status: number;
  data?: unknown;
  payment?: PaymentInfo;
  error?: string;
  reason?: string;
}

export type PolicyDecision = "auto" | "ledger" | "denied";

export interface PaymentRecord {
  id: string;
  timestamp: number;
  url: string;
  amount: string;
  recipient: string;
  burner: string;
  policy: PolicyDecision;
  status: 'pending' | 'approved' | 'rejected' | 'denied';
  txHash?: string;
}

export interface PolicyConfig {
  maxPerTransaction: number;
  maxPerDay: number;
  allowedRecipients: string[];
  blockedRecipients: string[];
}

// ─── Onboarding types ────────────────────────────────────────────────

export interface AgentPolicy {
  agentAddress: string;
  label?: string;
  maxPerTx: number;
  maxPerDay: number;
  spentToday: number;
  lastResetDate: string; // ISO date "2026-04-05"
}

export interface UserVault {
  walletAddress: string;
  derivedMnemonic: string;
  vaultReady: boolean;
  agents: Map<string, AgentPolicy>; // agentAddress → policy
}
