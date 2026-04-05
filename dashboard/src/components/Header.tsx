interface Props {
  balance: string | null
  onBack: () => void
}

export default function Header({ balance, onBack }: Props) {
  const fmt = balance !== null
    ? `$${parseFloat(balance).toFixed(2)} USDC`
    : null

  return (
    <header className="header">
      <button className="header-back" onClick={onBack}>← Back</button>
      <div className="logo">
        <img src="/secret_pay.png" alt="SecretPay" className="header-logo-img" />
      </div>

      <div className="header-sep" />
      <div className="header-spacer" />

      <div className="header-right">
        <div className="live-pill">
          <div className="live-dot" />
          LIVE
        </div>

        <div className="balance-block">
          <div className="balance-label">Pool Balance</div>
          <div className={`balance-value${fmt ? '' : ' dim'}`}>
            {fmt ?? '—'}
          </div>
        </div>

        <div className="net-badge">
          <div className="net-dot" />
          Base Sepolia
        </div>
      </div>
    </header>
  )
}
