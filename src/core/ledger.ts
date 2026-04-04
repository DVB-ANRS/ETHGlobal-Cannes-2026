import { createInterface } from "readline"
import { logger } from "../utils/logger.js"

interface ApprovalDetails {
  amount: string
  recipient: string
  service: string
}

class LedgerBridge {
  private connected = false

  async connect(): Promise<void> {
    this.connected = true
    logger.ledger("Device connected (terminal mock)")
  }

  async requestApproval(details: ApprovalDetails): Promise<"approved" | "rejected"> {
    if (!this.connected) await this.connect()

    logger.ledger("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.ledger(`  SecretPay — Approval Required`)
    logger.ledger(`  Amount:    $${details.amount} USDC`)
    logger.ledger(`  Recipient: ${details.recipient}`)
    logger.ledger(`  Service:   ${details.service}`)
    logger.ledger("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    const answer = await this.prompt("  Approve? [y/n] > ")
    const approved = answer.trim().toLowerCase() === "y"

    if (approved) {
      logger.ledger("✓ APPROVED by operator")
      return "approved"
    } else {
      logger.ledger("✗ REJECTED by operator")
      return "rejected"
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    logger.ledger("Device disconnected")
  }

  private prompt(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close()
        resolve(answer)
      })
    })
  }
}

export const ledgerBridge = new LedgerBridge()
