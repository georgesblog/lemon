import { useEffect, useRef, useState } from 'react'
import { searchByName } from '../lib/openfoodfacts.js'

// Search Open Food Facts by name — the fallback for a barcode that won't scan
// or a product that isn't keyed by its barcode. Pick a result and it flows into
// the same confirm screen as a scan (the caller loads it by code). Best-effort:
// an empty result set just shows "nothing found — add it by hand".
export default function ProductSearch({ initialQuery = '', onPick, onManual, onClose }) {
  const [query, setQuery] = useState(initialQuery)
  const [state, setState] = useState('idle') // idle | loading | done
  const [rows, setRows] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = (q) => {
    const term = (q ?? query).trim()
    if (term.length < 2) return
    setState('loading')
    searchByName(term)
      .then((r) => { setRows(r); setState('done') })
      .catch(() => { setRows([]); setState('done') })
  }

  return (
    <div>
      <div className="field">
        <label>Search Open Food Facts</label>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder="e.g. skyr, protein bar, chicken breast"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
        />
        <div className="muted small" style={{ marginTop: 6 }}>
          Type a product or brand and search — then tap a result to price it.
        </div>
      </div>

      <button className="btn primary block" onClick={() => run()} disabled={query.trim().length < 2}>
        {state === 'loading' ? 'Searching…' : 'Search'}
      </button>

      {state === 'done' && rows.length === 0 && (
        <div className="card small muted" style={{ marginTop: 12 }}>
          Nothing found for “{query.trim()}”. Try fewer or different words, or add it by hand.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <div key={r.code} className="card item-card" onClick={() => onPick(r.code)} style={{ cursor: 'pointer' }}>
              {r.image ? (
                <img className="item-thumb" src={r.image} alt="" />
              ) : (
                <div className="item-thumb placeholder">🛒</div>
              )}
              <div className="item-main">
                <div className="name">{r.name}</div>
                {r.brand && <div className="muted small">{r.brand}</div>}
              </div>
              <span className="chip-btn">Pick</span>
            </div>
          ))}
        </div>
      )}

      <div className="actionbar">
        <button className="btn ghost" onClick={onClose}>← Back</button>
        <button className="btn ghost" onClick={onManual}>Add by hand</button>
      </div>
    </div>
  )
}
