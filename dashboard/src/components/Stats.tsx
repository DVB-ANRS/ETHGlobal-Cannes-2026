interface Props {
  total: number
  auto: number
  ledger: number
  denied: number
  spent: number
}

export default function Stats({ total, auto, ledger, denied, spent }: Props) {
  return (
    <div className="stats">
      <div className="stat-card">
        <div className="stat-label">Txs Today</div>
        <div className="stat-value">{total}</div>
        <div className="stat-sub">All outcomes</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Auto-Approved</div>
        <div className="stat-value c-green">{auto}</div>
        <div className="stat-sub">≤ $1.00 · no cap</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Ledger Required</div>
        <div className="stat-value c-amber">{ledger}</div>
        <div className="stat-sub">≥ $1.00 hardware confirm</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Denied / Rejected</div>
        <div className="stat-value c-red">{denied}</div>
        <div className="stat-sub">Below $0.10 · above $2.00</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Spent Today</div>
        <div className="stat-value">${spent.toFixed(2)}</div>
        <div className="stat-sub">USDC approved</div>
      </div>
    </div>
  )
}
