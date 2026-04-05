import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../api'
import type { PaymentRecord } from '../types'
import type { AgentConfig } from './AgentForm'

interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'payment' | 'response' | 'error' | 'done'
  agentId: string
  timestamp: number
  data: Record<string, unknown>
}

type EventCard = {
  id: number
  ts: number
  kind: 'thinking' | 'request' | 'payment' | 'response' | 'error' | 'done'
  title: string
  detail?: string
  policy?: 'auto' | 'ledger' | 'denied'
  amount?: string
  burner?: string
  txHash?: string
}

let _uid = 0
function uid() { return ++_uid }

function eventToCard(ev: AgentEvent): EventCard | null {
  const ts = ev.timestamp
  switch (ev.type) {
    case 'thinking':
      return { id: uid(), ts, kind: 'thinking', title: String(ev.data.message ?? 'Thinking…') }

    case 'tool_call':
      return { id: uid(), ts, kind: 'request', title: 'API request', detail: String(ev.data.endpoint ?? '') }

    case 'payment': {
      const rawPolicy = String(ev.data.policy ?? '')
      const policy: 'auto' | 'ledger' | 'denied' =
        rawPolicy === 'auto-approve' ? 'auto' :
        rawPolicy === 'ledger-approved' ? 'ledger' : 'denied'
      return {
        id: uid(), ts, kind: 'payment',
        title: policy === 'auto' ? 'Auto-approved' : policy === 'ledger' ? 'Ledger approved' : 'Payment denied',
        detail: String(ev.data.endpoint ?? ''),
        policy,
        amount: String(ev.data.amount ?? ''),
        burner: ev.data.burner ? String(ev.data.burner) : undefined,
        txHash: ev.data.txHash ? String(ev.data.txHash) : undefined,
      }
    }

    case 'response':
      return { id: uid(), ts, kind: 'response', title: String(ev.data.text ?? 'Task complete') }

    case 'error':
      return { id: uid(), ts, kind: 'error', title: String(ev.data.message ?? 'Unknown error') }

    case 'done':
      return { id: uid(), ts, kind: 'done', title: ev.data.reason === 'stopped by user' ? 'Stopped by user' : 'Agent completed' }

    default:
      return null
  }
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtElapsed(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

// ── Terminal line renderers ──────────────────────────────────

const TERM_LABEL: Record<EventCard['kind'], string> = {
  thinking: 'AGENT',
  request:  'GATEWAY',
  payment:  'PAYMENT',
  response: 'AGENT',
  error:    'ERROR',
  done:     'AGENT',
}

function TermLine({ card }: { card: EventCard }) {
  const ts   = fmtTime(card.ts)
  const kind = card.kind
  const label = TERM_LABEL[kind]

  // For payment cards, pick sub-label based on policy
  const payLabel = card.policy === 'auto' ? 'AUTO' : card.policy === 'ledger' ? 'LEDGER' : 'DENIED'

  return (
    <div className={`al-term-line al-term-${kind}${card.policy ? ` al-term-pay-${card.policy}` : ''}`}>
      <span className="al-term-ts">{ts}</span>

      {kind === 'payment' ? (
        <>
          <span className={`al-term-label al-term-label-policy al-term-label-${card.policy}`}>
            {payLabel}
          </span>
          <span className="al-term-msg">
            Decision: <span className={`al-term-decision al-term-decision-${card.policy}`}>
              {card.policy === 'auto' ? 'AUTO-APPROVE' : card.policy === 'ledger' ? 'LEDGER-APPROVED' : 'DENIED'}
            </span>
          </span>
          {card.amount && (
            <span className="al-term-amount">${parseFloat(card.amount).toFixed(2)} USDC</span>
          )}
        </>
      ) : (
        <>
          <span className={`al-term-label al-term-label-${kind}`}>{label}</span>
          <span className="al-term-msg">{card.title}</span>
          {card.detail && <span className="al-term-detail">{card.detail}</span>}
        </>
      )}

      {/* Extra lines for payment meta */}
      {kind === 'payment' && card.burner && (
        <span className="al-term-burner">
          {'  '}
          <span className="al-term-label al-term-label-privacy">PRIVACY</span>
          <span className="al-term-msg">Burner: </span>
          <a
            className="al-term-link"
            href={`https://sepolia.basescan.org/address/${card.burner}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortAddr(card.burner)} ↗
          </a>
        </span>
      )}
    </div>
  )
}

interface Props {
  config: AgentConfig
  walletAddress: string | null
  onOpenDashboard: () => void
  onBack: () => void
}

export default function AgentLive({ config, walletAddress, onOpenDashboard, onBack }: Props) {
  const [cards, setCards]     = useState<EventCard[]>([])
  const [history, setHistory] = useState<PaymentRecord[]>([])
  const [done, setDone]       = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const bottomRef             = useRef<HTMLDivElement>(null)
  const startRef              = useRef(Date.now())

  // Poll payment history
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/agents/${config.id}/history`)
        if (r.ok) {
          const d = await r.json() as { payments: PaymentRecord[] }
          setHistory(d.payments ?? [])
        }
      } catch { /* ignore */ }
    }, 1500)
    return () => clearInterval(id)
  }, [config.id])

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [])

  // SSE stream
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/agents/${config.id}/events`)
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as AgentEvent
      const card = eventToCard(event)
      if (card) setCards(prev => [...prev, card])
      if (event.type === 'done') { setDone(true); es.close() }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [config.id])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [cards])

  const approved = history.filter(t => t.status === 'approved')
  const denied   = history.filter(t => t.policy === 'denied' || t.status === 'rejected')
  const pending  = history.filter(t => t.status === 'pending')
  const spent    = approved.reduce((s, t) => s + parseFloat(t.amount || '0'), 0)

  async function handleStop() {
    try { await fetch(`${API_BASE}/agents/${config.id}/stop`, { method: 'POST' }) } catch { /* ignore */ }
    setDone(true)
  }

  return (
    <div className="al-root">

      {/* ── Top bar ── */}
      <div className="al-topbar">
        <button className="al-back-btn" onClick={onBack}>← New agent</button>

        <div className="al-topbar-center">
          <span className="al-agent-name">{config.name}</span>
          {walletAddress && (
            <span className="al-wallet-chip">{shortAddr(walletAddress)}</span>
          )}
          {done ? (
            <span className="al-status-badge al-status-done">Done</span>
          ) : (
            <span className="al-status-badge al-status-live">
              <span className="al-live-dot" />
              Running · {fmtElapsed(elapsed)}
            </span>
          )}
        </div>

        <div className="al-topbar-right">
          {!done && (
            <button className="al-stop-btn" onClick={handleStop}>Stop</button>
          )}
          <button className="al-dashboard-btn" onClick={onOpenDashboard}>
            Dashboard ↗
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="al-body">

        {/* ── Left: terminal log ── */}
        <div className="al-feed-col">
          <div className="al-feed-header">
            <span className="al-feed-title">Agent log</span>
            <span className="al-feed-count">{cards.length} lines</span>
          </div>

          <div className="al-terminal">
            {cards.length === 0 && (
              <div className="al-term-empty">
                <span className="al-term-cursor">▋</span> Waiting for agent events…
              </div>
            )}

            {cards.map(card => (
              <TermLine key={card.id} card={card} />
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Right: task + stats + transactions ── */}
        <div className="al-side-col">

          {/* Task */}
          <div className="al-side-section">
            <div className="al-side-label">Task</div>
            <p className="al-task-text">{config.task}</p>
          </div>

          {/* Ledger pending alert */}
          {pending.length > 0 && (
            <div className="al-ledger-alert">
              <div className="al-ledger-alert-title">Ledger approval needed</div>
              <p className="al-ledger-alert-body">
                {pending.length} transaction{pending.length > 1 ? 's' : ''} waiting on your hardware device.
              </p>
            </div>
          )}

          {/* Session stats */}
          <div className="al-side-section">
            <div className="al-side-label">Session Stats</div>
            <div className="al-stats-grid">
              <div className="al-stat">
                <div className="al-stat-val">{approved.length}</div>
                <div className="al-stat-key">Approved</div>
              </div>
              <div className="al-stat">
                <div className={`al-stat-val${pending.length > 0 ? ' al-val-pulse' : ''}`}>{pending.length}</div>
                <div className="al-stat-key">Pending</div>
              </div>
              <div className="al-stat">
                <div className="al-stat-val">{denied.length}</div>
                <div className="al-stat-key">Denied</div>
              </div>
              <div className="al-stat al-stat-spend">
                <div className="al-stat-val">${spent.toFixed(2)}</div>
                <div className="al-stat-key">Spent</div>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          {history.length > 0 && (
            <div className="al-side-section al-side-txs">
              <div className="al-side-label">Transactions</div>
              <div className="al-tx-list">
                {[...history].reverse().slice(0, 8).map(tx => (
                  <TxItem key={tx.id} tx={tx} />
                ))}
              </div>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="al-done-banner">
              <div className="al-done-title">Agent completed</div>
              <div className="al-done-meta">{fmtElapsed(elapsed)} · {approved.length} approved · ${spent.toFixed(2)} spent</div>
              <button className="al-view-dashboard" onClick={onOpenDashboard}>
                View full dashboard →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function TxItem({ tx }: { tx: PaymentRecord }) {
  const pendingClass = tx.status === 'pending' ? ' al-tx-pending' : ''

  let path = tx.url
  try { path = new URL(tx.url).pathname } catch { /* keep full url */ }

  return (
    <div className={`al-tx-item${pendingClass}`}>
      <div className="al-tx-top">
        <span className={`al-tx-badge al-tx-badge-${tx.policy}`}>{tx.policy}</span>
        <span className="al-tx-amount">${parseFloat(tx.amount || '0').toFixed(2)}</span>
      </div>
      <div className="al-tx-path">{path}</div>
      {tx.burner && (
        <a
          className="al-tx-link"
          href={`https://sepolia.basescan.org/address/${tx.burner}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tx.burner.slice(0, 10)}…{tx.burner.slice(-6)}
        </a>
      )}
    </div>
  )
}
