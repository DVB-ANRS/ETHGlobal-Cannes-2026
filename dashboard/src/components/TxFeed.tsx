import { useState } from 'react'
import type { PaymentRecord } from '../types'

interface Props {
  history: PaymentRecord[]
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function fmtAmount(raw: string) {
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  return '$' + n.toFixed(n < 0.01 ? 6 : 2)
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr ?? '—'
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

function endpoint(url: string) {
  try {
    const u = new URL(url)
    return u.pathname + (u.search || '')
  } catch {
    return url
  }
}

function StatusBadge({ policy, status }: { policy: PaymentRecord['policy']; status: PaymentRecord['status'] }) {
  if (policy === 'denied') return <span className="badge badge-denied">Denied</span>
  if (status === 'pending')  return <span className="badge badge-pending">Pending…</span>
  if (status === 'rejected') return <span className="badge badge-denied">Rejected</span>
  if (policy === 'ledger')   return <span className="badge badge-ledger">Ledger OK</span>
  return <span className="badge badge-auto">Auto</span>
}

function PolicyIcon({ policy }: { policy: PaymentRecord['policy'] }) {
  if (policy === 'auto')   return <span className="policy-icon policy-icon-auto">A</span>
  if (policy === 'ledger') return <span className="policy-icon policy-icon-ledger">L</span>
  return <span className="policy-icon policy-icon-denied">D</span>
}

function TxRow({ tx }: { tx: PaymentRecord }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className={`tx-row${tx.status === 'pending' ? ' tx-pending' : ''}${expanded ? ' tx-expanded' : ''}`}
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer' }}
      >
        <td className="td-time">
          <div>{fmtTime(tx.timestamp)}</div>
          <div className="td-date">{fmtDate(tx.timestamp)}</div>
        </td>
        <td>
          <div className="td-policy-cell">
            <PolicyIcon policy={tx.policy} />
          </div>
        </td>
        <td className="td-amount">{fmtAmount(tx.amount)}</td>
        <td className="td-endpoint" title={tx.url}>
          {endpoint(tx.url)}
        </td>
        <td className="td-burner">
          {tx.burner ? (
            <a
              href={`https://sepolia.basescan.org/address/${tx.burner}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="addr-link"
              title={tx.burner}
            >
              {shortAddr(tx.burner)}
            </a>
          ) : '—'}
        </td>
        <td>
          <StatusBadge policy={tx.policy} status={tx.status} />
        </td>
        <td className="td-hash">
          {tx.txHash ? (
            <a
              href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title={tx.txHash}
              className="hash-link"
            >
              {tx.txHash.slice(0, 8)}… ↗
            </a>
          ) : (
            <span className="td-dash">—</span>
          )}
        </td>
        <td className="td-expand">
          <span className={`expand-chevron${expanded ? ' expanded' : ''}`}>›</span>
        </td>
      </tr>

      {expanded && (
        <tr className="tx-detail-row">
          <td colSpan={8}>
            <div className="tx-detail">
              <div className="tx-detail-grid">
                <div className="tx-detail-item">
                  <div className="tx-detail-label">Transaction ID</div>
                  <div className="tx-detail-val tx-detail-mono">{tx.id}</div>
                </div>
                <div className="tx-detail-item">
                  <div className="tx-detail-label">Full URL</div>
                  <div className="tx-detail-val tx-detail-mono">{tx.url}</div>
                </div>
                <div className="tx-detail-item">
                  <div className="tx-detail-label">Recipient</div>
                  {tx.recipient ? (
                    <a
                      href={`https://sepolia.basescan.org/address/${tx.recipient}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="addr-link tx-detail-val tx-detail-mono"
                    >
                      {tx.recipient} ↗
                    </a>
                  ) : <div className="tx-detail-val tx-detail-muted">—</div>}
                </div>
                <div className="tx-detail-item">
                  <div className="tx-detail-label">Burner Wallet</div>
                  {tx.burner ? (
                    <a
                      href={`https://sepolia.basescan.org/address/${tx.burner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="addr-link tx-detail-val tx-detail-mono"
                    >
                      {tx.burner} ↗
                    </a>
                  ) : <div className="tx-detail-val tx-detail-muted">—</div>}
                </div>
                {tx.txHash && (
                  <div className="tx-detail-item tx-detail-item-full">
                    <div className="tx-detail-label">Tx Hash</div>
                    <a
                      href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="addr-link tx-detail-val tx-detail-mono"
                    >
                      {tx.txHash} ↗
                    </a>
                  </div>
                )}
                {tx.agentId && (
                  <div className="tx-detail-item">
                    <div className="tx-detail-label">Agent ID</div>
                    <div className="tx-detail-val tx-detail-mono">{tx.agentId}</div>
                  </div>
                )}
              </div>

              {/* Ledger signature proof */}
              {tx.policy === 'ledger' && tx.status === 'approved' && tx.ledgerProof && (
                <div className="tx-proof">
                  <div className="tx-proof-badge">LEDGER SIGNATURE PROOF</div>
                  <div className="tx-proof-grid">
                    <div className="tx-proof-item">
                      <span className="tx-proof-key">Signer (recovered)</span>
                      <span className="tx-proof-val tx-proof-addr">{tx.ledgerProof.signerAddress}</span>
                    </div>
                    <div className="tx-proof-item">
                      <span className="tx-proof-key">v</span>
                      <span className="tx-proof-val">{tx.ledgerProof.signature.v}</span>
                    </div>
                    <div className="tx-proof-item">
                      <span className="tx-proof-key">r</span>
                      <span className="tx-proof-val">{tx.ledgerProof.signature.r}</span>
                    </div>
                    <div className="tx-proof-item">
                      <span className="tx-proof-key">s</span>
                      <span className="tx-proof-val">{tx.ledgerProof.signature.s}</span>
                    </div>
                    <div className="tx-proof-item">
                      <span className="tx-proof-key">Message</span>
                      <pre className="tx-proof-msg">{tx.ledgerProof.message}</pre>
                    </div>
                  </div>
                  <div className="tx-proof-verify">
                    ecrecover(hash(message), sig) = {shortAddr(tx.ledgerProof.signerAddress)} = Ledger address
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function TxFeed({ history }: Props) {
  const rows = [...history].reverse()

  return (
    <div className="feed">
      <div className="panel-header">
        <span className="panel-title">Transaction Feed</span>
        <div className="panel-header-right">
          {history.some(t => t.status === 'pending') && (
            <span className="pending-indicator">
              <span className="pending-dot" />
              Pending Ledger approval
            </span>
          )}
          <span className="pill">{history.length}</span>
        </div>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">&#9678;</div>
            <p className="empty-msg">
              No transactions yet.<br />
              Waiting for agent requests…
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Policy</th>
                <th>Amount</th>
                <th>Endpoint</th>
                <th>Burner Wallet</th>
                <th>Status</th>
                <th>Tx Hash</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
