interface Props {
  balance: string | null
}

export default function Header({ balance }: Props) {
  const fmt = balance !== null
    ? `$${parseFloat(balance).toFixed(2)} USDC`
    : null

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-mark">SP</div>
        <div>
          <div className="logo-name">SecretPay</div>
          <div className="logo-sub">Privacy-first payments for AI agents</div>
        </div>
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
