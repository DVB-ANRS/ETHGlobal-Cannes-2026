import { useState, useEffect } from 'react'
import type { PaymentRecord, PolicyConfig } from './types'
import Header from './components/Header'
import Stats from './components/Stats'
import TxFeed from './components/TxFeed'
import SidePanel from './components/SidePanel'
import Landing from './components/Landing'
import AgentForm from './components/AgentForm'
import AgentLive from './components/AgentLive'
import LedgerModal from './components/LedgerModal'
import type { AgentConfig } from './components/AgentForm'

const POLL_MS = 2000

const DEFAULT_POLICY: PolicyConfig = {
  maxPerTransaction: 2,
  allowedRecipients: [],
  blockedRecipients: [],
}

type View = 'landing' | 'form' | 'live' | 'dashboard'

export default function App() {
  const [view, setView]             = useState<View>('landing')
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null)
  const [history, setHistory]       = useState<PaymentRecord[]>([])
  const [balance, setBalance]       = useState<string | null>(null)
  const [policy, setPolicy]         = useState<PolicyConfig>(DEFAULT_POLICY)

  // Load policy once on mount
  useEffect(() => {
    fetch('/agent/policy')
      .then(r => (r.ok ? r.json() : null))
      .then((data: PolicyConfig | null) => { if (data) setPolicy(data) })
      .catch(() => {})
  }, [])

  // Poll history + balance every 2s
  useEffect(() => {
    const poll = async () => {
      const [histRes, balRes] = await Promise.allSettled([
        fetch('/agent/history'),
        fetch('/agent/balance'),
      ])
      if (histRes.status === 'fulfilled' && histRes.value.ok) {
        const data = await histRes.value.json() as { payments: PaymentRecord[] }
        setHistory(data.payments ?? [])
      }
      if (balRes.status === 'fulfilled' && balRes.value.ok) {
        const data = await balRes.value.json() as { balance: string }
        setBalance(data.balance ?? null)
      }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  const today = new Date().toDateString()
  const todayTxs     = history.filter(tx => new Date(tx.timestamp).toDateString() === today)
  const autoCount    = todayTxs.filter(t => t.policy === 'auto').length
  const ledgerCount  = todayTxs.filter(t => t.policy === 'ledger' && t.status !== 'pending').length
  const deniedCount  = todayTxs.filter(t => t.policy === 'denied' || t.status === 'rejected').length
  const spentToday   = todayTxs.filter(t => t.status === 'approved').reduce((s, t) => s + parseFloat(t.amount || '0'), 0)
  const lastTxAmount = history.length > 0 ? parseFloat(history[history.length - 1].amount || '0') : 0
  const hasPendingLedger = history.some(t => t.status === 'pending')

  if (view === 'landing') {
    return <><LedgerModal /><Landing onLaunch={() => setView('form')} /></>
  }

  if (view === 'form') {
    return (
      <><LedgerModal /><AgentForm
        onSubmit={(cfg) => { setAgentConfig(cfg); setView('live') }}
        onBack={() => setView('landing')}
      /></>
    )
  }

  if (view === 'live' && agentConfig) {
    return (
      <><LedgerModal /><AgentLive
        config={agentConfig}
        onOpenDashboard={() => setView('dashboard')}
        onBack={() => setView('form')}
      /></>
    )
  }

  return (
    <div className="app">
      <LedgerModal />
      <Header balance={balance} onBack={() => setView('landing')} />
      <Stats
        total={todayTxs.length}
        auto={autoCount}
        ledger={ledgerCount}
        denied={deniedCount}
        spent={spentToday}
      />
      <div className="content">
        <TxFeed history={history} />
        <SidePanel
          policy={policy}
          spentToday={spentToday}
          lastTxAmount={lastTxAmount}
          hasPendingLedger={hasPendingLedger}
        />
      </div>
    </div>
  )
}
