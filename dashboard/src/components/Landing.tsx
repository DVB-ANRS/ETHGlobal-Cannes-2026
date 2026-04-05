import { useEffect, useRef, useState } from 'react'
import PixelBlast from './PixelBlast/PixelBlast'
import DecryptedText from './DecryptedText'

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
  {
    label: 'Agent sends request',
    sub: 'POST /agent/request',
    detail: 'Your AI agent calls a paid API endpoint through the SecretPay middleware — no special SDK required.',
    tag: 'Gateway',
  },
  {
    label: '402 intercepted',
    sub: 'Payment Required detected',
    detail: 'SecretPay catches the HTTP 402 response, extracts the price and recipient from the x402 payment header.',
    tag: 'x402 · Circle',
  },
  {
    label: 'Policy check',
    sub: 'Auto / Ledger / Denied',
    detail: 'The policy engine evaluates amount, daily spend, and recipient. Decides in milliseconds: approve automatically, escalate to human, or block.',
    tag: 'Policy Engine',
  },
  {
    label: 'Unlink pool',
    sub: 'Funds burner wallet',
    detail: 'USDC is withdrawn from the ZK privacy pool into a fresh single-use burner wallet. Your agent\'s main address is never exposed.',
    tag: 'Unlink',
  },
  {
    label: 'x402 payment',
    sub: 'Burner signs & sends',
    detail: 'The burner wallet signs and broadcasts the x402 payment. Onchain, it looks like an unrelated address — zero link to your agent.',
    tag: 'Base Sepolia',
  },
  {
    label: 'Data returned',
    sub: 'Agent receives response',
    detail: 'The API confirms payment and returns the requested data. The burner wallet is discarded. The entire flow takes under 3 seconds.',
    tag: 'Response',
  },
]

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

function FlowSection() {
  const { ref, visible } = useInView(0.08)
  const [active, setActive] = useState<number | null>(null)

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="l-section l-section-dark">
      <div className="l-flow-header">
        <div>
          <p className="l-label">Payment flow</p>
          <h2 className="l-section-h2">From request to privacy.</h2>
        </div>
        <p className="l-flow-count">6 steps</p>
      </div>
      <ol className="l-flow">
        {STEPS.map((s, i) => (
          <li
            key={i}
            className={[
              'l-flow-item',
              visible ? 'l-flow-item--visible' : '',
              active === i ? 'l-flow-item--active' : '',
            ].join(' ')}
            style={{ transitionDelay: `${i * 60}ms` }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="l-flow-n">{String(i + 1).padStart(2, '0')}</span>
            <div className="l-flow-body">
              <div className="l-flow-top">
                <span className="l-flow-label">{s.label}</span>
                <span className="l-flow-badge">{s.tag}</span>
              </div>
              <div className="l-flow-expand">
                <span className="l-flow-sub">{s.sub}</span>
                <p className="l-flow-detail">{s.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function Landing({ onLaunch }: Props) {
  return (
    <div className="l-root">

      {/* ── Nav ── */}
      <nav className="l-nav">
        <img src="/secret_pay.png" alt="SecretPay" className="l-nav-logo" />
        <div className="l-nav-right">
          <button className="l-nav-btn" onClick={onLaunch}>Dashboard</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="l-hero">
        <div className="l-hero-blast" aria-hidden="true">
          <div className="l-hero-blast-canvas">
            <PixelBlast
              variant="square"
              pixelSize={4}
              color="#000000"
              patternScale={2}
              patternDensity={1}
              enableRipples
              rippleSpeed={0.3}
              rippleThickness={0.1}
              rippleIntensityScale={1}
              speed={0.5}
              transparent
              edgeFade={0.25}
            />
          </div>
        </div>
        <div className="l-hero-inner">
          <h1 className="l-h1">
            <DecryptedText
              text="Your agent pays."
              animateOn="view"
              sequential
              revealDirection="start"
              speed={40}
            /><br />
            <em>
              <DecryptedText
                text="Nobody knows"
                animateOn="view"
                sequential
                revealDirection="start"
                speed={40}
              /><br />
              <DecryptedText
                text="who sent it."
                animateOn="view"
                sequential
                revealDirection="start"
                speed={40}
              />
            </em>
          </h1>
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
              <div className="l-feature-meta">
                <span className="l-feature-n">{f.n}</span>
                <span className="l-feature-tag">{f.tag}</span>
              </div>
              <div className="l-feature-title">{f.title}</div>
              <div className="l-feature-divider" />
              <div className="l-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow ── */}
      <FlowSection />

      {/* ── Footer ── */}
      <footer className="l-footer">
        <span className="l-footer-wordmark">SECRETPAY</span>
      </footer>

    </div>
  )
}
