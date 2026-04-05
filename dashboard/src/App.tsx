import { useState, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { API_BASE } from './api'
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

type View = 'landing' | 'live' | 'dashboard'

function resolveWalletAddress(user: { linkedAccounts?: Array<{ type?: string; address?: string }> }): string | null {
  const linked = user.linkedAccounts ?? []

  // Privy account payloads can differ by provider/type, so we accept any linked account carrying an address.
  const walletLike = linked.find(a => a.type === 'wallet' && typeof a.address === 'string' && a.address.length > 0)
    ?? linked.find(a => typeof a.address === 'string' && a.address.length > 0)

  return walletLike?.address ?? null
}

export default function App() {
  const { login, authenticated, user }  = usePrivy()

  const [view, setView]                 = useState<View>('landing')
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [vaultReady, setVaultReady]     = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [agentConfig, setAgentConfig]   = useState<AgentConfig | null>(null)
  const [history, setHistory]           = useState<PaymentRecord[]>([])
  const [balance, setBalance]           = useState<string | null>(null)
  const [policy, setPolicy]             = useState<PolicyConfig>(DEFAULT_POLICY)

  // Load policy once on mount
  useEffect(() => {
    fetch(`${API_BASE}/agent/policy`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: PolicyConfig | null) => { if (data) setPolicy(data) })
      .catch(() => {})
  }, [])

  // Poll history + balance every 2s
  useEffect(() => {
    const poll = async () => {
      const [histRes, balRes] = await Promise.allSettled([
        fetch(`${API_BASE}/agent/history`),
        fetch(`${API_BASE}/agent/balance`),
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

  // After Privy login: extract wallet address + setup vault via /onboard/setup
  useEffect(() => {
    if (!authenticated || !user || vaultReady) return

    const addr = resolveWalletAddress(user as { linkedAccounts?: Array<{ type?: string; address?: string }> })
    if (!addr) return

    setWalletAddress(addr)

    const doSetup = async () => {
      try {
        // Setup vault on backend — signature verification bypassed for hackathon demo
        const setupRes = await fetch(`${API_BASE}/onboard/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: addr, signature: '0x' }),
        })
        if (!setupRes.ok) throw new Error('Vault setup failed')

        const data = await setupRes.json() as { balance: string }
        setBalance(data.balance)
        setVaultReady(true)
        setView('dashboard')
        setShowAgentModal(true)
      } catch {
        // If onboarding fails (e.g. backend offline), still go to dashboard
        setVaultReady(true)
        setView('dashboard')
        setShowAgentModal(true)
      }
    }

    doSetup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user])

  async function handleLaunch() {
    if (authenticated && user) {
      if (vaultReady) {
        setView('dashboard')
        setShowAgentModal(true)
      } else {
        // Prevent dead-end if onboarding is delayed or wallet detection misses the expected shape.
        setView('dashboard')
      }
      // else onboarding useEffect will handle it
      return
    }

    if (isConnecting) return

    setIsConnecting(true)
    try {
      await login()
    } finally {
      setIsConnecting(false)
    }
  }

  const today            = new Date().toDateString()
  const todayTxs         = history.filter(tx => new Date(tx.timestamp).toDateString() === today)
  const autoCount        = todayTxs.filter(t => t.policy === 'auto').length
  const ledgerCount      = todayTxs.filter(t => t.policy === 'ledger' && t.status !== 'pending').length
  const deniedCount      = todayTxs.filter(t => t.policy === 'denied' || t.status === 'rejected').length
  const spentToday       = todayTxs.filter(t => t.status === 'approved').reduce((s, t) => s + parseFloat(t.amount || '0'), 0)
  const lastTxAmount     = history.length > 0 ? parseFloat(history[history.length - 1].amount || '0') : 0
  const hasPendingLedger = history.some(t => t.status === 'pending')

  if (view === 'landing') {
    return <><LedgerModal /><Landing onLaunch={handleLaunch} /></>
  }

  if (view === 'live' && agentConfig) {
    return (
      <><LedgerModal /><AgentLive
        config={agentConfig}
        walletAddress={walletAddress}
        onOpenDashboard={() => setView('dashboard')}
        onBack={() => setShowAgentModal(true)}
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
          walletAddress={walletAddress}
        />
      </div>

      {showAgentModal && (
        <AgentForm
          walletAddress={walletAddress}
          onSubmit={(cfg) => { setAgentConfig(cfg); setShowAgentModal(false); setView('live') }}
          onBack={() => setShowAgentModal(false)}
        />
      )}
    </div>
  )
}
