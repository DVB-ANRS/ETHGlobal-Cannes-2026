import { useState } from 'react'

export interface AgentConfig {
  id: string
  name: string
  llmApiKey: string
  task: string
}

interface Props {
  walletAddress: string | null
  onSubmit: (cfg: AgentConfig) => void
  onBack: () => void
}

const TASK_PRESETS = [
  {
    label: 'Auto-approve flow',
    tag: 'AUTO',
    tagClass: 'preset-tag-green',
    value: 'Fetch real-time ETH/USD price and market sentiment via paid API — auto-approve small payments',
    desc: 'Triggers $0.10 payment — fully automatic, no human input needed.',
  },
  {
    label: 'Ledger approval',
    tag: 'LEDGER',
    tagClass: 'preset-tag-amber',
    value: 'Pull historical 100-hour price dataset (bulk-data) — triggers Ledger approval for large payments',
    desc: 'Triggers $1.50 payment — requires physical hardware confirmation.',
  },
  {
    label: 'Full demo',
    tag: 'ALL',
    tagClass: 'preset-tag-blue',
    value: 'Run all use cases: fetch price data, bulk analytics, and attempt premium report — auto-approve, ledger, and deny blacklisted',
    desc: 'Runs all 3 scenarios: auto, ledger approval, and blacklist denial.',
  },
]

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export default function AgentForm({ walletAddress, onSubmit, onBack }: Props) {
  const [name, setName]             = useState('')
  const [llmApiKey, setLlmApiKey]   = useState('')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [customTask, setCustomTask] = useState(false)
  const [task, setTask]             = useState(TASK_PRESETS[0].value)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showKey, setShowKey]       = useState(false)

  function selectPreset(i: number) {
    setSelectedPreset(i)
    setTask(TASK_PRESETS[i].value)
    setCustomTask(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim())        { setError('Agent name is required.'); return }
    if (!llmApiKey.trim())   { setError('Groq API key is required.'); return }
    if (!task.trim())        { setError('Task is required.'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/agents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(walletAddress ? { 'X-Wallet-Address': walletAddress } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          llmApiKey: llmApiKey.trim(),
          task: task.trim(),
          autoStart: true,
        }),
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const text = await res.text()
          if (text) {
            const d = JSON.parse(text) as { error?: string }
            msg = d.error ?? text.slice(0, 120)
          }
        } catch { /* keep default msg */ }
        throw new Error(msg)
      }
      const text = await res.text()
      if (!text) throw new Error('Empty response from server')
      const d = JSON.parse(text) as { id: string; name: string; status: string }
      onSubmit({ id: d.id, name: d.name, llmApiKey: llmApiKey.trim(), task: task.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent')
      setLoading(false)
    }
  }

  return (
    <div className="af-overlay">
      <div className="af-card">

        {/* Header */}
        <div className="af-header">
          <button className="af-back" onClick={onBack}>← Back</button>
          <img src="/secret_pay.png" alt="SecretPay" className="af-logo" />
        </div>

        <div className="af-body">
          <div className="af-intro">
            <p className="af-label">New agent</p>
            <h2 className="af-title">Launch a private AI agent</h2>
            <p className="af-sub">
              All paid API calls route through SecretPay — privacy-preserving ZK pool, human-controlled approvals.
            </p>
          </div>

          {walletAddress && (
            <div className="af-wallet-row">
              <span className="af-wallet-dot" />
              <span className="af-wallet-addr">{shortAddr(walletAddress)}</span>
              <span className="af-wallet-label">Base Sepolia</span>
            </div>
          )}

          <form className="af-form" onSubmit={handleSubmit}>

            {/* Agent name */}
            <div className="af-field">
              <label className="af-field-label">Agent name</label>
              <input
                className="af-input"
                type="text"
                placeholder="e.g. alpha-scout"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                maxLength={32}
                disabled={loading}
              />
            </div>

            {/* API Key */}
            <div className="af-field">
              <label className="af-field-label">
                Groq API Key
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="af-field-link"
                >
                  Get one ↗
                </a>
              </label>
              <div className="af-input-wrap">
                <input
                  className="af-input af-input-mono"
                  type={showKey ? 'text' : 'password'}
                  placeholder="gsk_…"
                  value={llmApiKey}
                  onChange={e => setLlmApiKey(e.target.value)}
                  autoComplete="off"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="af-toggle-key"
                  onClick={() => setShowKey(s => !s)}
                  tabIndex={-1}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="af-field-hint">Never stored — only used for this session in-memory</p>
            </div>

            {/* Task */}
            <div className="af-field">
              <label className="af-field-label">Task</label>

              {!customTask ? (
                <>
                  <div className="af-presets">
                    {TASK_PRESETS.map((p, i) => (
                      <button
                        key={p.label}
                        type="button"
                        className={`af-preset${selectedPreset === i ? ' af-preset--active' : ''}`}
                        onClick={() => selectPreset(i)}
                        disabled={loading}
                      >
                        <div className="af-preset-top">
                          <span className="af-preset-label">{p.label}</span>
                          <span className={`af-preset-tag ${p.tagClass}`}>{p.tag}</span>
                        </div>
                        <span className="af-preset-desc">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="af-custom-link"
                    onClick={() => setCustomTask(true)}
                    disabled={loading}
                  >
                    Write a custom task →
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    className="af-textarea"
                    rows={3}
                    placeholder="Describe what your agent should do…"
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    maxLength={300}
                    disabled={loading}
                  />
                  <div className="af-textarea-footer">
                    <button
                      type="button"
                      className="af-custom-link"
                      onClick={() => { setCustomTask(false); selectPreset(0) }}
                      disabled={loading}
                    >
                      ← Use a preset
                    </button>
                    <span className="af-char-count">{task.length}/300</span>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="af-error">
                <span className="af-error-icon">!</span>
                {error}
              </div>
            )}

            <button className="af-submit" type="submit" disabled={loading}>
              {loading ? (
                <><span className="af-spinner" /> Starting agent…</>
              ) : (
                <>Launch Agent →</>
              )}
            </button>

          </form>
        </div>

        <div className="af-footer">
          <span className="af-footer-item">Base Sepolia</span>
          <span className="af-footer-sep">·</span>
          <span className="af-footer-item">USDC via x402</span>
          <span className="af-footer-sep">·</span>
          <span className="af-footer-item">Unlink ZK pool</span>
          <span className="af-footer-sep">·</span>
          <span className="af-footer-item">Ledger DMK</span>
        </div>

      </div>
    </div>
  )
}
