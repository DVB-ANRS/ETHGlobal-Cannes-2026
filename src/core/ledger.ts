import { WebSocketServer, WebSocket } from "ws"
import { logger } from "../utils/logger.js"

const LEDGER_WS_PORT = 3001

interface ApprovalDetails {
  amount: string
  recipient: string
  service: string
}

interface WsMessage {
  type: "approval_request" | "approval_response" | "status"
  payload: Record<string, unknown>
}

class LedgerBridge {
  private wss: WebSocketServer | null = null
  private browserSocket: WebSocket | null = null
  private operatorAddress: string | null = null
  private pendingApproval: {
    resolve: (result: "approved" | "rejected") => void
  } | null = null

  async start(): Promise<void> {
    if (this.wss) return

    this.wss = new WebSocketServer({ port: LEDGER_WS_PORT })

    this.wss.on("connection", (ws) => {
      logger.ledger("Dashboard connected via WebSocket")
      this.browserSocket = ws

      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as WsMessage

        if (msg.type === "status" && msg.payload.operatorAddress) {
          this.operatorAddress = msg.payload.operatorAddress as string
          logger.ledger(`Operator address: ${this.operatorAddress}`)
        }

        if (msg.type === "approval_response" && this.pendingApproval) {
          const approved = msg.payload.approved === true
          const signerAddress = msg.payload.operatorAddress as string | undefined

          if (approved && this.operatorAddress && signerAddress) {
            if (signerAddress.toLowerCase() !== this.operatorAddress.toLowerCase()) {
              logger.ledger(`✗ REJECTED — signer ${signerAddress} ≠ operator ${this.operatorAddress}`)
              this.pendingApproval.resolve("rejected")
              this.pendingApproval = null
              return
            }
          }

          logger.ledger(approved ? "✓ APPROVED on Ledger" : "✗ REJECTED on Ledger")
          this.pendingApproval.resolve(approved ? "approved" : "rejected")
          this.pendingApproval = null
        }
      })

      ws.on("close", () => {
        logger.ledger("Dashboard disconnected")
        this.browserSocket = null
        this.operatorAddress = null
        if (this.pendingApproval) {
          this.pendingApproval.resolve("rejected")
          this.pendingApproval = null
        }
      })
    })

    logger.ledger(`WebSocket server on :${LEDGER_WS_PORT} — open dashboard in browser`)
  }

  getOperatorAddress(): string | null {
    return this.operatorAddress
  }

  async requestApproval(details: ApprovalDetails): Promise<"approved" | "rejected"> {
    if (!this.browserSocket || this.browserSocket.readyState !== WebSocket.OPEN) {
      logger.ledger("No dashboard connected — approval denied")
      return "rejected"
    }

    if (!this.operatorAddress) {
      logger.ledger("No operator address registered — approval denied")
      return "rejected"
    }

    logger.ledger("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.ledger(`  Requesting approval on Ledger`)
    logger.ledger(`  Operator: ${this.operatorAddress}`)
    logger.ledger(`  Amount:   $${details.amount} USDC`)
    logger.ledger(`  To:       ${details.recipient}`)
    logger.ledger(`  Service:  ${details.service}`)
    logger.ledger("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    const msg: WsMessage = {
      type: "approval_request",
      payload: { ...details },
    }
    this.browserSocket.send(JSON.stringify(msg))

    return new Promise((resolve) => {
      this.pendingApproval = { resolve }
      setTimeout(() => {
        if (this.pendingApproval) {
          logger.ledger("Approval timeout (60s) — rejected")
          this.pendingApproval.resolve("rejected")
          this.pendingApproval = null
        }
      }, 60_000)
    })
  }

  async stop(): Promise<void> {
    this.wss?.close()
    this.wss = null
    this.browserSocket = null
    this.operatorAddress = null
  }
}

export const ledgerBridge = new LedgerBridge()
