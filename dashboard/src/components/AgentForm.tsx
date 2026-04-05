import { useState } from 'react'

export interface AgentConfig {
  name: string
  provider: 'groq' | 'openai'
  apiKey: string
  task: string
}

interface Props {
  onSubmit: (cfg: AgentConfig) => void
  onBack: () => void
}

const TASK_PRESETS = [
  { label: 'Auto-approve flow', value: 'Fetch market data via paid API — auto-approve small payments' },
  { label: 'Ledger approval', value: 'Pull bulk analytics data — trigger Ledger approval for large payments' },
  { label: 'Full demo (all use cases)', value: 'Run all use cases: auto-approve, ledger, deny blacklisted' },
]

export default function AgentForm({ onSubmit, onBack }: Props) {
  const [name, setName]         = useState('')
  const [provider, setProvider] = useState<'groq' | 'openai'>('groq')
  const [apiKey, setApiKey]     = useState('')
  const [task, setTask]         = useState(TASK_PRESETS[0].value)
  const [customTask, setCustomTask] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !apiKey.trim() || !task.trim()) {
      setError('All fields are required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), provider, apiKey: apiKey.trim(), task: task.trim() }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      onSubmit({ name: name.trim(), provider, apiKey: apiKey.trim(), task: task.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent')
      setLoading(false)
    }
  }

  return (
    <div className="af-overlay">
      <div className="af-card">

        <div className="af-header">
          <button className="af-back" onClick={onBack}>← Back</button>
          <div className="af-logo-row">
            <img src="/Logo SecretPay.png" alt="SecretPay" className="af-logo" />
          </div>
        </div>

        <div className="af-body">
          <div className="af-intro">
            <p className="af-label">Configure your agent</p>
            <h2 className="af-title">Launch a private AI agent</h2>
            <p className="af-sub">Your agent will route all paid API calls through the SecretPay middleware — privacy-preserving, human-controlled.</p>
          </div>

          <form className="af-form" onSubmit={handleSubmit}>

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
              />
            </div>

            <div className="af-field">
              <label className="af-field-label">AI Provider</label>
              <div className="af-provider-group">
                {(['groq', 'openai'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`af-provider-btn${provider === p ? ' af-provider-btn--active' : ''}`}
                    onClick={() => setProvider(p)}
                  >
                    {p === 'groq' ? 'Groq' : 'OpenAI'}
                    {p === 'groq' && <span className="af-badge">Fast</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="af-field">
              <label className="af-field-label">API Key</label>
              <input
                className="af-input af-input-mono"
                type="password"
                placeholder={provider === 'groq' ? 'gsk_...' : 'sk-...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <p className="af-field-hint">Never stored — only used for this session</p>
            </div>

            <div className="af-field">
              <label className="af-field-label">Task</label>
              {!customTask ? (
                <>
                  <div className="af-presets">
                    {TASK_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        className={`af-preset${task === p.value ? ' af-preset--active' : ''}`}
                        onClick={() => setTask(p.value)}
                      >
                        <span className="af-preset-label">{p.label}</span>
                        <span className="af-preset-val">{p.value}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="af-custom-link" onClick={() => setCustomTask(true)}>
                    Write a custom task →
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    className="af-textarea"
                    rows={3}
                    placeholder="Describe what your agent should do..."
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    maxLength={200}
                  />
                  <button type="button" className="af-custom-link" onClick={() => { setCustomTask(false); setTask(TASK_PRESETS[0].value) }}>
                    ← Use a preset
                  </button>
                </>
              )}
            </div>

            {error && <div className="af-error">{error}</div>}

            <button className="af-submit" type="submit" disabled={loading}>
              {loading ? (
                <><span className="af-spinner" />Starting agent…</>
              ) : (
                <>Launch Agent</>
              )}
            </button>

          </form>
        </div>

        <div className="af-footer">
          <span className="af-footer-item">Base Sepolia</span>
          <span className="af-footer-sep">·</span>
          <span className="af-footer-item">USDC payments</span>
          <span className="af-footer-sep">·</span>
          <span className="af-footer-item">Unlink privacy pool</span>
        </div>

      </div>
    </div>
  )
}
