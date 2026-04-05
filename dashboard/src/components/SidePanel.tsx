import type { PolicyConfig } from '../types'

interface Props {
  policy: PolicyConfig
  spentToday: number
  lastTxAmount: number
  hasPendingLedger: boolean
}

// Must match policy engine in src/core/gateway.ts
const FLOOR   = 0.10   // below → denied
const LEDGER  = 1.00   // at or above → ledger
const CAP     = 2.00   // above → denied

const FLOW_STEPS = [
  { label: 'Proxy',   desc: 'request → target API' },
  { label: '402',     desc: 'Payment Required received' },
  { label: 'Policy',  desc: 'evaluates amount & recipient' },
  { label: 'Ledger',  desc: 'hardware approval if needed' },
  { label: 'Privacy', desc: 'Unlink pool → burner wallet' },
  { label: 'x402',    desc: 'burner signs & retries request' },
  { label: '200',     desc: 'data returned to agent' },
]

export default function SidePanel({ policy, spentToday, lastTxAmount, hasPendingLedger }: Props) {
  const maxTx = policy.maxPerTransaction

  const txPct   = Math.min(100, (lastTxAmount / maxTx) * 100)
  const txClass = txPct > 90 ? 'danger' : txPct > 65 ? 'warn' : ''

  return (
    <div className="side">

      {/* Ledger pending alert */}
      {hasPendingLedger && (
        <div className="ledger-alert">
          <div className="alert-title">
            <span>⚡</span> Ledger Approval Needed
          </div>
          <p className="alert-body">
            A transaction is waiting for hardware confirmation.<br />
            Check your Ledger device to approve or reject.
          </p>
        </div>
      )}

      {/* Policy engine */}
      <div className="section">
        <div className="section-title">Policy Engine</div>

        <div className="policy-item">
          <div className="policy-row">
            <span className="policy-name">Last tx vs cap</span>
            <span className="policy-nums">
              <b>${lastTxAmount.toFixed(2)}</b> / <b>${maxTx.toFixed(2)}</b>
            </span>
          </div>
          <div className="progress">
            <div
              className={`progress-bar${txClass ? ` ${txClass}` : ''}`}
              style={{ width: `${txPct}%` }}
            />
          </div>
        </div>

        <div className="policy-item">
          <div className="policy-row">
            <span className="policy-name">Spent today</span>
            <span className="policy-nums">
              <b>${spentToday.toFixed(2)}</b> USDC
            </span>
          </div>
        </div>
      </div>

      {/* Decision rules */}
      <div className="section">
        <div className="section-title">Decision Rules</div>

        <div className="rule-row">
          <div className="rule-icon green">✓</div>
          <div className="rule-text"><b>AUTO</b> — ${FLOOR.toFixed(2)} ≤ amount &lt; ${LEDGER.toFixed(2)}</div>
        </div>
        <div className="rule-row">
          <div className="rule-icon amber">⏳</div>
          <div className="rule-text"><b>LEDGER</b> — amount ≥ ${LEDGER.toFixed(2)}</div>
        </div>
        <div className="rule-row">
          <div className="rule-icon red">✕</div>
          <div className="rule-text"><b>DENIED</b> — amount &lt; ${FLOOR.toFixed(2)} or &gt; ${CAP.toFixed(2)} or blacklisted</div>
        </div>
      </div>

      {/* Payment flow */}
      <div className="section">
        <div className="section-title">Payment Flow</div>
        {FLOW_STEPS.map((step, i) => (
          <div key={i} className="flow-step">
            <div className="step-num">{i + 1}</div>
            <div className="step-text">
              <b>{step.label}</b> — {step.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Network */}
      <div className="section">
        <div className="section-title">Network</div>

        <div className="net-row">
          <span className="net-key">Chain</span>
          <span className="addr-chip">Base Sepolia (84532)</span>
        </div>
        <div className="net-row">
          <span className="net-key">USDC</span>
          <a
            className="addr-link"
            href="https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            target="_blank"
            rel="noopener noreferrer"
          >
            0x036C…dCF7e
          </a>
        </div>
        <div className="net-row">
          <span className="net-key">Pool</span>
          <a
            className="addr-link"
            href="https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482"
            target="_blank"
            rel="noopener noreferrer"
          >
            0x647f…f482
          </a>
        </div>
      </div>

      {/* Blocked recipients */}
      <div className="section">
        <div className="section-title">Blocked Recipients</div>
        {policy.blockedRecipients.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}>None configured</p>
        ) : (
          policy.blockedRecipients.map(addr => (
            <div key={addr} style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', color: 'var(--red-light)', marginBottom: '4px' }}>
              {addr}
            </div>
          ))
        )}
      </div>

    </div>
  )
}
