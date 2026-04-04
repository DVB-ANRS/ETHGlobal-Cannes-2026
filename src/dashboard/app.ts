import {
  DeviceManagementKitBuilder,
  type DeviceManagementKit,
  DeviceActionStatus,
} from "@ledgerhq/device-management-kit"
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid"
import { SignerEthBuilder, type SignerEth } from "@ledgerhq/device-signer-kit-ethereum"

const DERIVATION_PATH = "44'/60'/0'/0/0"
const WS_URL = "ws://localhost:3001"

let dmk: DeviceManagementKit | null = null
let sessionId: string | null = null
let signer: SignerEth | null = null
let operatorAddress: string | null = null
let ws: WebSocket | null = null

const log = (msg: string) => {
  const el = document.getElementById("log")!
  const line = document.createElement("div")
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  el.appendChild(line)
  el.scrollTop = el.scrollHeight
}

const setStatus = (text: string, color: string) => {
  const el = document.getElementById("status")!
  el.textContent = text
  el.style.background = color
}

function buildTypedData(amount: string, recipient: string, service: string) {
  return {
    domain: {
      name: "SecretPay",
      version: "1",
      chainId: 84532,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      AgentPayment: [
        { name: "amount", type: "string" },
        { name: "currency", type: "string" },
        { name: "recipient", type: "address" },
        { name: "service", type: "string" },
      ],
    },
    primaryType: "AgentPayment",
    message: {
      amount,
      currency: "USDC",
      recipient,
      service,
    },
  }
}

// 1. Connect Ledger + read operator address
async function connectLedger() {
  dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build()

  log("Scanning for Ledger device...")
  setStatus("Scanning...", "#1a1a2e")

  return new Promise<void>((resolve, reject) => {
    const sub = dmk!.startDiscovering().subscribe({
      next: async (device) => {
        sub.unsubscribe()
        log(`Found: ${device.deviceModel.productName}`)
        try {
          sessionId = await dmk!.connect({ deviceId: device.id })
          signer = new SignerEthBuilder({ sdk: dmk!, sessionId }).build()

          // Read the operator's Ethereum address from the Ledger
          log("Reading operator address from Ledger...")
          operatorAddress = await getAddressFromLedger()
          log(`Operator: ${operatorAddress}`)
          document.getElementById("operator")!.textContent = operatorAddress

          setStatus("LEDGER CONNECTED", "#1a4a1a")
          resolve()
        } catch (e) {
          reject(e)
        }
      },
      error: (err) => {
        log(`Discovery error: ${err}`)
        setStatus("ERROR", "#4a1a1a")
        reject(err)
      },
    })
  })
}

// Read address via getAddress device action
function getAddressFromLedger(): Promise<string> {
  return new Promise((resolve, reject) => {
    const { observable } = signer!.getAddress(DERIVATION_PATH)
    observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          resolve((state as any).output.address)
        }
        if (state.status === DeviceActionStatus.Error) {
          reject(new Error("Failed to read address from Ledger"))
        }
      },
    })
  })
}

// 2. Sign EIP-712 typed data — returns signature + operator address
async function approveOnLedger(amount: string, recipient: string, service: string): Promise<{ approved: boolean; signature?: string }> {
  if (!signer) throw new Error("Ledger not connected")

  const typedData = buildTypedData(amount, recipient, service)
  log("→ Check your Ledger — approve or reject")
  setStatus("APPROVE ON LEDGER", "#4a3a00")

  return new Promise((resolve) => {
    const { observable } = signer!.signTypedData(DERIVATION_PATH, typedData)

    observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case DeviceActionStatus.Pending:
            break
          case DeviceActionStatus.Completed: {
            const output = (state as any).output
            const sig = `0x${output.r}${output.s}${output.v.toString(16)}`
            log("✓ APPROVED on Ledger")
            setStatus("APPROVED", "#1a4a1a")
            resolve({ approved: true, signature: sig })
            break
          }
          case DeviceActionStatus.Error:
            log("✗ REJECTED on Ledger")
            setStatus("REJECTED", "#4a1a1a")
            resolve({ approved: false })
            break
          case DeviceActionStatus.Stopped:
            log("✗ CANCELLED")
            setStatus("CANCELLED", "#4a1a1a")
            resolve({ approved: false })
            break
        }
      },
    })
  })
}

// 3. WebSocket bridge to backend
function connectWebSocket() {
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    log("Connected to SecretPay backend")
    setStatus("LEDGER READY", "#1a4a1a")
    // Send operator address to backend on connect
    ws!.send(JSON.stringify({
      type: "status",
      payload: { message: "Ledger connected", operatorAddress },
    }))
  }

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type !== "approval_request") return

    const { amount, recipient, service } = msg.payload

    document.getElementById("details")!.innerHTML = `
      <div class="detail-row"><span>Amount</span><strong>$${amount} USDC</strong></div>
      <div class="detail-row"><span>Recipient</span><strong>${recipient}</strong></div>
      <div class="detail-row"><span>Service</span><strong>${service}</strong></div>
    `

    const result = await approveOnLedger(amount, recipient, service)

    document.getElementById("details")!.innerHTML = ""
    ws!.send(JSON.stringify({
      type: "approval_response",
      payload: {
        approved: result.approved,
        signature: result.signature,
        operatorAddress,
      },
    }))
    setStatus("LEDGER READY", "#1a4a1a")
  }

  ws.onclose = () => {
    log("Backend disconnected — reconnecting in 3s...")
    setStatus("RECONNECTING...", "#4a3a00")
    setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = () => {}
}

document.getElementById("btn-connect")!.addEventListener("click", async () => {
  const btn = document.getElementById("btn-connect") as HTMLButtonElement
  btn.disabled = true
  btn.textContent = "Connecting..."
  try {
    await connectLedger()
    btn.style.display = "none"
    connectWebSocket()
  } catch (e: any) {
    log(`Error: ${e.message}`)
    btn.disabled = false
    btn.textContent = "Retry"
  }
})
