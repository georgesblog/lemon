import { useEffect, useState } from 'react'
import { ScoreBadge } from './Bits.jsx'
import { gbp } from '../lib/format.js'
import { bucketMeta } from '../lib/buckets.js'
import {
  canShare, hasShareableItems, buildSnapshot, createShare, revokeShare,
  fetchShare, shareUrl,
} from '../lib/share.js'

// ── Create + share a link ─────────────────────────────────────────────────────
// Sits under the basket summary. Hidden entirely unless cloud sync is configured
// and there's at least one priced item to show. Builds the snapshot on demand,
// publishes it, then offers copy / native share / revoke.
export function ShareBar({ items, weights, title = null }) {
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!canShare() || !hasShareableItems(items)) return null

  const url = token ? shareUrl(token) : null

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const snapshot = buildSnapshot(items, weights, { title })
      setToken(await createShare(snapshot, { title }))
    } catch (e) {
      setError(e?.message || 'Could not create the link.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Copy failed — long-press the link to copy it.')
    }
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'My Basket Score', text: 'Here’s my basket:', url })
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  const revoke = async () => {
    setBusy(true)
    try {
      await revokeShare(token)
      setToken(null)
      setCopied(false)
    } catch (e) {
      setError(e?.message || 'Could not revoke the link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-bar">
      {!token ? (
        <button type="button" className="btn ghost block" onClick={create} disabled={busy}>
          {busy ? 'Creating link…' : '🔗 Share this basket'}
        </button>
      ) : (
        <div className="share-live">
          <div className="share-url-row">
            <input className="share-url" value={url} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" className="btn ghost sm" onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="row share-actions">
            {typeof navigator !== 'undefined' && navigator.share && (
              <button type="button" className="btn primary sm" onClick={nativeShare}>Share…</button>
            )}
            <button type="button" className="btn ghost sm" onClick={revoke} disabled={busy}>
              Revoke link
            </button>
          </div>
          <div className="muted small">
            Anyone with this link can view a read-only copy — product, score and price only. Revoke to
            kill it.
          </div>
        </div>
      )}
      {error && <div className="small" style={{ color: 'var(--danger, #c0392b)' }}>{error}</div>}
    </div>
  )
}

// ── Read-only viewer for …/#/s/<token> ────────────────────────────────────────
// A standalone route: renders using only the anon key (no sign-in), so a link
// works for anyone. Never touches the local basket.
export function SharedBoardView({ token, onExit }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    fetchShare(token)
      .then((board) => {
        if (!live) return
        setState(board ? { status: 'ok', board } : { status: 'missing' })
      })
      .catch(() => live && setState({ status: 'error' }))
    return () => { live = false }
  }, [token])

  const buckets = state.board?.snapshot?.buckets ?? []

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo-dot" /> Basket Score</h1>
        <span className="pill">Shared</span>
      </header>

      <main className="content">
        {state.status === 'loading' && <div className="muted" style={{ padding: 24 }}>Loading shared basket…</div>}

        {state.status === 'missing' && (
          <div className="empty">
            <p>🔗 This link is no longer available.</p>
            <p className="muted small">It may have been revoked or expired.</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="empty">
            <p>⚠️ Couldn’t load this shared basket.</p>
            <p className="muted small">Check your connection and try again.</p>
          </div>
        )}

        {state.status === 'ok' && (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{state.board.snapshot?.title || 'Shared basket'}</div>
              <div className="muted small">A read-only leaderboard — best value first, per shelf.</div>
            </div>

            {buckets.length === 0 && (
              <div className="empty"><p className="muted">This shared basket is empty.</p></div>
            )}

            {buckets.map((b) => (
              <div className="bucket" key={b.id}>
                <div className="bucket-head">
                  <div className="bucket-toggle" style={{ cursor: 'default' }}>
                    <span className="bucket-emoji">{b.emoji || bucketMeta(b.id).emoji}</span>
                    <span className="bucket-title">{b.label || bucketMeta(b.id).label}</span>
                    <span className="pill">{b.items?.length ?? 0}</span>
                  </div>
                </div>
                {(b.items ?? []).map((it, i) => (
                  <SharedRow key={i} item={it} bucketId={b.id} />
                ))}
              </div>
            ))}
          </>
        )}
      </main>

      <div className="actionbar">
        <button className="btn primary block" onClick={onExit}>Open Basket Score</button>
      </div>
    </div>
  )
}

// One row in the read-only viewer: thumbnail, name/brand, price + £/100g protein,
// and the score badge — the same visual language as the live basket, minus any
// controls.
function SharedRow({ item, bucketId }) {
  const [broken, setBroken] = useState(false)
  const meta = bucketMeta(bucketId)
  return (
    <div className="card item-card">
      {item.image && !broken ? (
        <img className="item-thumb" src={item.image} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="item-thumb placeholder" aria-hidden="true">{meta.emoji}</div>
      )}
      <div className="item-main">
        <div className="name">{item.name || 'Unnamed item'}</div>
        <div className="muted small">
          {item.brand ? `${item.brand} · ` : ''}
          {item.price != null ? gbp(item.price) : 'no price'}
          {item.pppProtein != null && ` · ${gbp(item.pppProtein)}/100g protein`}
        </div>
      </div>
      <div className="item-aside">
        <ScoreBadge score={item.score ?? 0} />
      </div>
    </div>
  )
}
