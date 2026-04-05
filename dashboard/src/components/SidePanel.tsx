import { useState } from 'react'
import type { PolicyConfig } from '../types'

interface Props {
  policy: PolicyConfig
  spentToday: number
  lastTxAmount: number
  hasPendingLedger: boolean
  walletAddress?: string | null
}

const LEDGER = 1.00


function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy address">
      {copied ? '✓' : '⧉'}
    </button>
  )
}

export default function SidePanel({ policy, spentToday, lastTxAmount, hasPendingLedger, walletAddress }: Props) {
  const maxTx   = policy.maxPerTransaction
  const txPct   = Math.min(100, (lastTxAmount / maxTx) * 100)
  const txClass = txPct > 90 ? 'danger' : txPct > 65 ? 'warn' : ''
  const spentPct = Math.min(100, (spentToday / (maxTx * 10)) * 100)

  return (
    <div className="side">

      {/* ── Ledger pending alert ── */}
      {hasPendingLedger && (
        <div className="ledger-alert">
          <div className="alert-title">
            <span className="alert-icon">⚡</span>
            Ledger Approval Needed
          </div>
          <p className="alert-body">
            A transaction is waiting for hardware confirmation.<br />
            Check your Ledger device to approve or reject.
          </p>
        </div>
      )}

      {/* ── Wallet info ── */}
      {walletAddress && (
        <div className="section">
          <div className="section-title">Connected Wallet</div>
          <div className="wallet-info-row">
            <span className="wallet-info-dot" />
            <span className="wallet-info-addr">{shortAddr(walletAddress)}</span>
            <CopyButton text={walletAddress} />
            <a
              href={`https://sepolia.basescan.org/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="wallet-info-link"
            >↗</a>
          </div>
          <div className="wallet-info-sub">Base Sepolia · Privy embedded</div>
        </div>
      )}

      {/* ── Policy engine ── */}
      <div className="section">
        <div className="section-title">Policy Engine</div>

        <div className="policy-item">
          <div className="policy-row">
            <span className="policy-name">Last tx vs cap</span>
            <span className="policy-nums">
              <b>${lastTxAmount.toFixed(2)}</b>
              <span className="policy-sep">/</span>
              <b>${maxTx.toFixed(2)}</b>
            </span>
          </div>
          <div className="progress">
            <div
              className={`progress-bar${txClass ? ` ${txClass}` : ''}`}
              style={{ width: `${txPct}%` }}
            />
          </div>
          <div className="progress-labels">
            <span>$0</span>
            <span className="progress-ledger-mark" style={{ left: `${(LEDGER / maxTx) * 100}%` }}>
              Ledger
            </span>
            <span>${maxTx.toFixed(2)}</span>
          </div>
        </div>

        <div className="policy-item">
          <div className="policy-row">
            <span className="policy-name">Spent today</span>
            <span className="policy-nums">
              <b>${spentToday.toFixed(2)}</b>
              <span className="policy-usdc">USDC</span>
            </span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${spentPct}%` }} />
          </div>
        </div>
      </div>


      {/* ── Network ── */}
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
            0x036C…dCF7e ↗
          </a>
        </div>
        <div className="net-row">
          <span className="net-key">Unlink Pool</span>
          <a
            className="addr-link"
            href="https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482"
            target="_blank"
            rel="noopener noreferrer"
          >
            0x647f…f482 ↗
          </a>
        </div>
      </div>

      {/* ── Blocked recipients ── */}
      <div className="section">
        <div className="section-title">Blocked Recipients</div>
        {policy.blockedRecipients.length === 0 ? (
          <p className="blocked-empty">None configured</p>
        ) : (
          <div className="blocked-list">
            {policy.blockedRecipients.map(addr => (
              <div key={addr} className="blocked-addr">{addr}</div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
