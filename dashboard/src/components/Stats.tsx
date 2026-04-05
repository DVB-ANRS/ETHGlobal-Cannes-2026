interface Props {
  total: number
  auto: number
  ledger: number
  denied: number
  spent: number
}

interface CardProps {
  label: string
  value: string | number
  sub: string
  inverted?: boolean
  large?: boolean
}

function StatCard({ label, value, sub, inverted, large }: CardProps) {
  return (
    <div className={`stat-card${inverted ? ' stat-card-inv' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${large ? ' stat-value-lg' : ''}`}>
        {value}
      </div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

export default function Stats({ total, auto, ledger, denied, spent }: Props) {
  const successRate = total > 0 ? Math.round((auto + ledger) / total * 100) : 0

  return (
    <div className="stats">
      <StatCard
        label="Txs Today"
        value={total}
        sub="All outcomes"
      />
      <StatCard
        label="Auto-Approved"
        value={auto}
        sub="≤ $1.00 · no cap"
      />
      <StatCard
        label="Ledger Required"
        value={ledger}
        sub="≥ $1.00 hardware confirm"
      />
      <StatCard
        label="Denied / Rejected"
        value={denied}
        sub="Below $0.10 · above $2.00"
      />
      <div className="stat-card stat-card-split">
        <div className="stat-split-top">
          <div>
            <div className="stat-label">Spent Today</div>
            <div className="stat-value stat-value-lg">${spent.toFixed(2)}</div>
            <div className="stat-sub">USDC approved</div>
          </div>
          <div className="stat-rate-block">
            <div className="stat-rate-val">{successRate}%</div>
            <div className="stat-rate-label">success</div>
          </div>
        </div>
        <div className="stat-bar-wrap">
          <div className="stat-bar-track">
            <div className="stat-bar-seg stat-bar-fill" style={{ width: `${total > 0 ? ((auto + ledger) / total) * 100 : 0}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
