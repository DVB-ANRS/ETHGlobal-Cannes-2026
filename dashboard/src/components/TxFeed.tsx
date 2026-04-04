import type { PaymentRecord } from '../types'

interface Props {
  history: PaymentRecord[]
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtAmount(raw: string) {
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  return '$' + n.toFixed(n < 0.01 ? 6 : 2).replace(/\.?0+$/, '')
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr ?? '—'
  return addr.slice(0, 6) + '…' + addr.slice(-4)
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
  if (policy === 'ledger') {
    if (status === 'pending')  return <span className="badge badge-pending">⏳ Pending…</span>
    if (status === 'rejected') return <span className="badge badge-denied">✕ Rejected</span>
    return <span className="badge badge-ledger">✓ Ledger OK</span>
  }
  if (policy === 'denied') return <span className="badge badge-denied">✕ Denied</span>
  return <span className="badge badge-auto">✓ Auto</span>
}

export default function TxFeed({ history }: Props) {
  const rows = [...history].reverse()

  return (
    <div className="feed">
      <div className="panel-header">
        <span className="panel-title">Transaction Feed</span>
        <span className="pill">{history.length}</span>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">◎</div>
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
                <th>Amount</th>
                <th>Endpoint</th>
                <th>Burner Wallet</th>
                <th>Status</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => (
                <tr key={tx.id} className={`tx-row${tx.status === 'pending' ? ' tx-pending' : ''}`}>
                  <td className="td-time">{fmtTime(tx.timestamp)}</td>
                  <td className="td-amount">{fmtAmount(tx.amount)}</td>
                  <td className="td-endpoint" title={tx.url}>
                    <a
                      href={tx.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="endpoint-link"
                    >
                      {endpoint(tx.url)}
                    </a>
                  </td>
                  <td className="td-burner">{tx.burner ? shortAddr(tx.burner) : '—'}</td>
                  <td>
                    <StatusBadge policy={tx.policy} status={tx.status} />
                  </td>
                  <td className="td-hash">
                    {tx.txHash ? (
                      <a
                        href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={tx.txHash}
                      >
                        {tx.txHash.slice(0, 10)}…
                      </a>
                    ) : (
                      <span className="td-dash">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
