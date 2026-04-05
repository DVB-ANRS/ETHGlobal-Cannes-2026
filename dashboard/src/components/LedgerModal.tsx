import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../api'
import type { LedgerProof } from '../types'

interface PendingTx {
  id: string
  details: { amount: string; recipient: string; service: string }
  timestamp: number
}

export default function LedgerModal() {
  const [pending, setPending] = useState<PendingTx | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null)
  const [proof, setProof] = useState<LedgerProof | null>(null)

  // Poll /ledger/pending every 2s
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/ledger/pending`)
        if (!res.ok) return
        const data = await res.json() as { pending: PendingTx | null }
        if (!active) return
        if (data.pending) {
          setPending(data.pending)
          setResult(null)
          setProof(null)
        } else if (!result) {
          setPending(null)
        }
      } catch { /* backend down */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { active = false; clearInterval(id) }
  }, [result])

  const handleApprove = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ledger/approve`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json() as { status: string; proof: LedgerProof | null }
        setResult('approved')
        setProof(data.proof)
        setPending(null)
        setTimeout(() => { setResult(null); setProof(null) }, 6000)
      }
    } catch { /* */ }
    setLoading(false)
  }, [])

  const handleReject = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ledger/reject`, { method: 'POST' })
      if (res.ok) {
        setResult('rejected')
        setPending(null)
        setTimeout(() => setResult(null), 3000)
      }
    } catch { /* */ }
    setLoading(false)
  }, [])

  // Nothing to show
  if (!pending && !result) return null

  const elapsed = pending ? Math.floor((Date.now() - pending.timestamp) / 1000) : 0
  const remaining = Math.max(0, 120 - elapsed)

  return (
    <div className="ledger-overlay">
      <div className="ledger-device">
        {/* Notch / branding */}
        <div className="ledger-notch">LEDGER</div>

        {/* Screen */}
        <div className="ledger-screen">
          {result ? (
            <div className={`ledger-result ${result}`}>
              <div className="ledger-result-icon">
                {result === 'approved' ? '\u2713' : '\u2717'}
              </div>
              <div className="ledger-result-text">
                {result === 'approved' ? 'APPROVED' : 'REJECTED'}
              </div>

              {/* Cryptographic proof */}
              {proof && (
                <div className="ledger-proof">
                  <div className="ledger-proof-title">CRYPTOGRAPHIC PROOF</div>
                  <div className="ledger-proof-row">
                    <span className="ledger-proof-key">Signer</span>
                    <span className="ledger-proof-val">{proof.signerAddress.slice(0, 6)}...{proof.signerAddress.slice(-4)}</span>
                  </div>
                  <div className="ledger-proof-row">
                    <span className="ledger-proof-key">v</span>
                    <span className="ledger-proof-val">{proof.signature.v}</span>
                  </div>
                  <div className="ledger-proof-row">
                    <span className="ledger-proof-key">r</span>
                    <span className="ledger-proof-val">{proof.signature.r.slice(0, 16)}...</span>
                  </div>
                  <div className="ledger-proof-row">
                    <span className="ledger-proof-key">s</span>
                    <span className="ledger-proof-val">{proof.signature.s.slice(0, 16)}...</span>
                  </div>
                </div>
              )}
            </div>
          ) : pending ? (
            <>
              <div className="ledger-header">
                <span className="ledger-header-dot" />
                CONFIRM TRANSACTION
              </div>

              <div className="ledger-fields">
                <div className="ledger-field">
                  <div className="ledger-label">Amount</div>
                  <div className="ledger-value">${pending.details.amount} USDC</div>
                </div>
                <div className="ledger-field">
                  <div className="ledger-label">Recipient</div>
                  <div className="ledger-value mono">
                    {pending.details.recipient.slice(0, 6)}...{pending.details.recipient.slice(-4)}
                  </div>
                </div>
                <div className="ledger-field">
                  <div className="ledger-label">Service</div>
                  <div className="ledger-value mono">{pending.details.service}</div>
                </div>
              </div>

              <div className="ledger-timer">
                Auto-reject in {remaining}s
              </div>

              <div className="ledger-actions">
                <button
                  className="ledger-btn ledger-btn-reject"
                  onClick={handleReject}
                  disabled={loading}
                >
                  {loading ? '...' : 'Reject'}
                </button>
                <button
                  className="ledger-btn ledger-btn-approve"
                  onClick={handleApprove}
                  disabled={loading}
                >
                  {loading ? 'Signing...' : 'Approve'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
