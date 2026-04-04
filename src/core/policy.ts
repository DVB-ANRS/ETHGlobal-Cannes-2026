import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { PolicyConfig, PolicyDecision } from "../types/index.js"
import { logger } from "../utils/logger.js"

const HARD_CAP = 100

class PolicyEngine {
  private config: PolicyConfig = { maxPerTransaction: 5, maxPerDay: 50, allowedRecipients: [], blockedRecipients: [] }
  private dailySpent = 0
  private lastReset = new Date()

  loadConfig(configPath?: string): void {
    const __dirname = typeof import.meta.dirname === "string" ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))
    const path = configPath ?? join(__dirname, "../config/policy.json")
    const raw = readFileSync(path, "utf-8")
    this.config = JSON.parse(raw) as PolicyConfig
    logger.policy(`Config loaded — max/tx: $${this.config.maxPerTransaction}, max/day: $${this.config.maxPerDay}, blacklist: ${this.config.blockedRecipients.length}`)
  }

  evaluate(amount: number, recipient: string): PolicyDecision {
    this.checkDailyReset()

    if (amount <= 0) {
      logger.policy(`$${amount} → DENIED (invalid amount)`)
      return "denied"
    }

    const recipientLower = recipient.toLowerCase()

    if (this.config.blockedRecipients.some(a => a.toLowerCase() === recipientLower)) {
      logger.policy(`$${amount} to ${recipient} → DENIED (blacklisted)`)
      return "denied"
    }

    if (amount > HARD_CAP) {
      logger.policy(`$${amount} to ${recipient} → DENIED (exceeds hard cap $${HARD_CAP})`)
      return "denied"
    }

    if (this.config.allowedRecipients.length > 0 && !this.config.allowedRecipients.some(a => a.toLowerCase() === recipientLower)) {
      logger.policy(`$${amount} to ${recipient} → LEDGER (not in whitelist)`)
      return "ledger"
    }

    if (this.dailySpent + amount > this.config.maxPerDay) {
      logger.policy(`$${amount} to ${recipient} → LEDGER (daily limit: $${this.dailySpent}/$${this.config.maxPerDay})`)
      return "ledger"
    }

    if (amount > this.config.maxPerTransaction) {
      logger.policy(`$${amount} to ${recipient} → LEDGER (exceeds $${this.config.maxPerTransaction}/tx)`)
      return "ledger"
    }

    logger.policy(`$${amount} to ${recipient} → AUTO-APPROVE`)
    return "auto"
  }

  recordSpending(amount: number): void {
    this.dailySpent += amount
    logger.policy(`Daily spent: $${this.dailySpent.toFixed(2)}/$${this.config.maxPerDay}`)
  }

  getDailySpent(): number {
    return this.dailySpent
  }

  private checkDailyReset(): void {
    const now = new Date()
    if (now.getDate() !== this.lastReset.getDate() || now.getMonth() !== this.lastReset.getMonth()) {
      this.dailySpent = 0
      this.lastReset = now
      logger.policy("Daily counter reset")
    }
  }
}

export const policyEngine = new PolicyEngine()
