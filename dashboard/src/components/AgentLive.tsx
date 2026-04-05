import { useEffect, useRef, useState } from 'react'
import type { PaymentRecord } from '../types'
import type { AgentConfig } from './AgentForm'

interface LogEntry {
  ts: number
  tag: string
  msg: string
  level: 'info' | 'success' | 'warn' | 'error' | 'payment'
}

interface Props {
  config: AgentConfig
  onOpenDashboard: () => void
  onBack: () => void
}

const TAG_COLOR: Record<string, string> = {
  Agent:   'al-tag-agent',
  Gateway: 'al-tag-gateway',
  Policy:  'al-tag-policy',
  Privacy: 'al-tag-privacy',
  Payment: 'al-tag-payment',
  Chain:   'al-tag-chain',
  Ledger:  'al-tag-ledger',
  Error:   'al-tag-error',
}

const LEVEL_CLASS: Record<string, string> = {
  info:    '',
  success: 'al-line-success',
  warn:    'al-line-warn',
  error:   'al-line-error',
  payment: 'al-line-payment',
}

function fmt(ts: number) {
  return new Date(ts).toISOString().split('T')[1].replace('Z', '').slice(0, 12)
}

export default function AgentLive({ config, onOpenDashboard, onBack }: Props) {
  const [logs, setLogs]         = useState<LogEntry[]>([])
  const [history, setHistory]   = useState<PaymentRecord[]>([])
  const [done, setDone]         = useState(false)
  const [elapsed, setElapsed]   = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const startRef  = useRef(Date.now())
  const cursorRef = useRef(Date.now() - 5000)

  // Poll payment history
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch('/agent/history')
        if (r.ok) {
          const d = await r.json() as { payments: PaymentRecord[] }
          setHistory(d.payments ?? [])
        }
      } catch { /* ignore */ }
    }, 1500)
    return () => clearInterval(id)
  }, [])

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [])

  // SSE log stream
  useEffect(() => {
    const es = new EventSource(`/agent/logs?since=${cursorRef.current}`)

    es.onmessage = (e) => {
      const entry = JSON.parse(e.data) as LogEntry
      cursorRef.current = entry.ts
      setLogs(prev => [...prev, entry])

      // Detect completion
      if (entry.msg.includes('shutting down') || entry.msg.includes('Task complete')) {
        setDone(true)
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const approved = history.filter(t => t.status === 'approved')
  const denied   = history.filter(t => t.policy === 'denied' || t.status === 'rejected')
  const pending  = history.filter(t => t.status === 'pending')
  const spent    = approved.reduce((s, t) => s + parseFloat(t.amount || '0'), 0)

  return (
    <div className="al-root">

      {/* Top bar */}
      <div className="al-topbar">
        <button className="al-back" onClick={onBack}>← New agent</button>
        <div className="al-topbar-center">
          <span className="al-agent-name">{config.name}</span>
          <span className="al-topbar-sep">/</span>
          <span className="al-provider">{config.provider}</span>
        </div>
        <div className="al-topbar-right">
          {done ? (
            <span className="al-pill al-pill-done">Done</span>
          ) : (
            <span className="al-pill al-pill-live">
              <span className="al-live-dot" />
              Running · {elapsed}s
            </span>
          )}
          <button className="al-dashboard-btn" onClick={onOpenDashboard}>
            Dashboard ↗
          </button>
        </div>
      </div>

      <div className="al-layout">

        {/* Terminal */}
        <div className="al-terminal">
          <div className="al-terminal-header">
            <span className="al-terminal-title">AGENT LOG</span>
            <span className="al-terminal-count">{logs.length} lines</span>
          </div>
          <div className="al-terminal-body">
            {logs.length === 0 && (
              <div className="al-terminal-waiting">
                <span className="al-cursor" />
                Waiting for agent output…
              </div>
            )}
            {logs.map((l, i) => (
              <div key={i} className={`al-line ${LEVEL_CLASS[l.level] || ''}`}>
                <span className="al-time">{fmt(l.ts)}</span>
                <span className={`al-tag ${TAG_COLOR[l.tag] || 'al-tag-default'}`}>{l.tag}</span>
                <span className="al-msg">{l.msg}</span>
              </div>
            ))}
            {!done && logs.length > 0 && (
              <div className="al-line">
                <span className="al-time">{fmt(Date.now())}</span>
                <span className="al-tag al-tag-default">_</span>
                <span className="al-cursor" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Right panel */}
        <div className="al-panel">

          {/* Task */}
          <div className="al-panel-section">
            <div className="al-panel-label">Task</div>
            <p className="al-task-text">{config.task}</p>
          </div>

          {/* Stats */}
          <div className="al-panel-section">
            <div className="al-panel-label">Session stats</div>
            <div className="al-stats">
              <div className="al-stat">
                <div className="al-stat-val al-stat-green">{approved.length}</div>
                <div className="al-stat-key">Approved</div>
              </div>
              <div className="al-stat">
                <div className="al-stat-val al-stat-amber">{pending.length}</div>
                <div className="al-stat-key">Pending</div>
              </div>
              <div className="al-stat">
                <div className="al-stat-val al-stat-red">{denied.length}</div>
                <div className="al-stat-key">Denied</div>
              </div>
              <div className="al-stat">
                <div className="al-stat-val">${spent.toFixed(2)}</div>
                <div className="al-stat-key">Spent</div>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          {history.length > 0 && (
            <div className="al-panel-section al-txs">
              <div className="al-panel-label">Transactions</div>
              {[...history].reverse().slice(0, 8).map(tx => (
                <div key={tx.id} className={`al-tx al-tx-${tx.status}`}>
                  <div className="al-tx-top">
                    <span className={`al-tx-badge al-tx-badge-${tx.policy}`}>{tx.policy}</span>
                    <span className="al-tx-amount">${parseFloat(tx.amount || '0').toFixed(2)}</span>
                  </div>
                  <div className="al-tx-url">{tx.url.replace('http://localhost:4021', '')}</div>
                  {tx.burner && (
                    <div className="al-tx-burner">{tx.burner.slice(0, 8)}…{tx.burner.slice(-6)}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className="al-panel-section al-done-section">
              <div className="al-done-msg">Agent completed</div>
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
