import { usePrivy } from '@privy-io/react-auth'
import { shortAddr, resolveWalletAddress } from '../utils'

interface Props {
  balance: string | null
  onBack: () => void
}

export default function Header({ balance, onBack }: Props) {
  const { authenticated, user, logout } = usePrivy()

  const walletAddr = authenticated && user
    ? resolveWalletAddress(user as { linkedAccounts?: Array<{ type?: string; address?: string }> })
    : null

  const fmt = balance !== null && balance !== undefined
    ? `$${parseFloat(balance).toFixed(2)}`
    : null

  return (
    <header className="header">
      <button className="header-back" onClick={onBack}>← Back</button>

      <div className="logo">
        <img src="/logo.png" alt="SecretPay" className="header-logo-img" />
      </div>

      <div className="header-sep" />

      {/* live indicator */}
      <div className="live-pill">
        <span className="live-dot" />
        LIVE
      </div>

      <div className="header-spacer" />

      {/* Pool balance */}
      <div className="balance-block">
        <div className="balance-label">Pool Balance</div>
        <div className={`balance-value${fmt ? '' : ' dim'}`}>
          {fmt ? <>{fmt} <span className="balance-unit">USDC</span></> : '—'}
        </div>
      </div>

      <div className="header-sep" />

      {/* Wallet */}
      {walletAddr && (
        <div className="wallet-chip">
          <span className="wallet-dot" />
          <span className="wallet-addr">{shortAddr(walletAddr)}</span>
          {authenticated && (
            <button className="wallet-logout" onClick={logout} title="Disconnect">
              ×
            </button>
          )}
        </div>
      )}

      {/* Network */}
      <div className="net-badge">
        <div className="net-dot" />
        Base Sepolia
      </div>
    </header>
  )
}
