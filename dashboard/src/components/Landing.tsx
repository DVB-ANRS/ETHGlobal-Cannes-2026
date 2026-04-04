interface Props {
  onLaunch: () => void
}

const FEATURES = [
  {
    n: '01',
    title: 'Privacy layer',
    tag: 'Unlink',
    desc: 'Every payment routes through the Unlink ZK pool. Burner wallets are created on-the-fly and discarded after each transaction. Your agent\'s identity is never exposed onchain.',
  },
  {
    n: '02',
    title: 'Nanopayments',
    tag: 'x402 · Circle',
    desc: 'Native HTTP 402 support. Agents pay for APIs in USDC with no gas overhead — Circle batches thousands of micropayments into a single onchain transaction.',
  },
  {
    n: '03',
    title: 'Human approval',
    tag: 'Ledger DMK',
    desc: 'A policy engine classifies every payment. Small amounts auto-approve. Large ones pause the agent and require physical confirmation on a Ledger hardware wallet.',
  },
]

const STEPS = [
  { label: 'Agent sends request', sub: 'POST /agent/request' },
  { label: '402 intercepted', sub: 'Payment Required detected' },
  { label: 'Policy check', sub: 'Auto / Ledger / Denied' },
  { label: 'Unlink pool', sub: 'Funds burner wallet' },
  { label: 'x402 payment', sub: 'Burner signs & sends' },
  { label: 'Data returned', sub: 'Agent receives response' },
]

export default function Landing({ onLaunch }: Props) {
  return (
    <div className="l-root">

      {/* ── Nav ── */}
      <nav className="l-nav">
        <img src="/secret_pay.png" alt="SecretPay" className="l-nav-logo" />
        <div className="l-nav-right">
          <button className="l-nav-btn" onClick={onLaunch}>Dashboard →</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="l-hero">
        <div className="l-hero-inner">
          <p className="l-eyebrow">Privacy-first payments for AI agents</p>
          <h1 className="l-h1">
            Your agent pays.<br />
            <em>Nobody knows<br />who sent it.</em>
          </h1>
          <p className="l-lead">
            SecretPay intercepts every agent payment, routes it through a ZK privacy
            pool via burner wallets, and requires hardware approval for large spends.
          </p>
          <div className="l-hero-actions">
            <button className="l-cta" onClick={onLaunch}>Launch Dashboard</button>
            <a className="l-cta-ghost" href="https://github.com" target="_blank" rel="noopener noreferrer">
              View on GitHub ↗
            </a>
          </div>
        </div>

      </section>

      {/* ── Features ── */}
      <section className="l-section">
        <div className="l-section-header">
          <p className="l-label">How it works</p>
          <h2 className="l-section-h2">Three layers of protection.</h2>
        </div>
        <div className="l-features">
          {FEATURES.map(f => (
            <div key={f.n} className="l-feature">
              <div className="l-feature-top">
                <span className="l-feature-n">{f.n}</span>
                <span className="l-feature-tag">{f.tag}</span>
              </div>
              <div className="l-feature-title">{f.title}</div>
              <div className="l-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow ── */}
      <section className="l-section l-section-gray">
        <div className="l-section-header">
          <p className="l-label">Payment flow</p>
          <h2 className="l-section-h2">From request to privacy.</h2>
        </div>
        <ol className="l-flow">
          {STEPS.map((s, i) => (
            <li key={i} className="l-flow-item">
              <span className="l-flow-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="l-flow-body">
                <span className="l-flow-label">{s.label}</span>
                <span className="l-flow-sub">{s.sub}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        <span className="l-footer-wordmark">SECRETPAY</span>
      </footer>

    </div>
  )
}
