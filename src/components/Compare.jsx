import { useState } from 'react'
import { scoreItem, verdict } from '../lib/scoring.js'
import { gbp, one } from '../lib/format.js'
import { ScoreBadge } from './Bits.jsx'

// Side-by-side comparison — the "two tubs of Greek yogurt" use case. Pick any
// two basket items and see which wins on each metric.
export default function Compare({ items, weights, onClose }) {
  const [aId, setAId] = useState(items[0]?.id || '')
  const [bId, setBId] = useState(items[1]?.id || '')

  const a = items.find((i) => i.id === aId)
  const b = items.find((i) => i.id === bId)

  if (items.length < 2) {
    return (
      <div className="empty">
        <div className="big">⚖️</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Add two items to compare
        </div>
        <div>Scan both products into your basket, then compare them head-to-head.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <Picker label="Item A" value={aId} onChange={setAId} items={items} />
        <Picker label="Item B" value={bId} onChange={setBId} items={items} />
      </div>

      {a && b ? <ComparisonTable a={a} b={b} weights={weights} /> : (
        <div className="muted small">Pick two different items.</div>
      )}
    </div>
  )
}

function Picker({ label, value, onChange, items }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.name || 'Unnamed'}</option>
        ))}
      </select>
    </div>
  )
}

function ComparisonTable({ a, b, weights }) {
  const sa = scoreItem(a, weights)
  const sb = scoreItem(b, weights)

  // For each row, mark the better side. `lowerWins` flips the comparison for
  // cost-style metrics where smaller is better.
  const rows = [
    { label: '£ / 100g protein', av: sa.costPer100gProtein, bv: sb.costPer100gProtein, fmt: gbp, lowerWins: true },
    { label: 'Protein value', av: sa.subScores.value, bv: sb.subScores.value, fmt: one },
    { label: 'Protein-to-cal', av: sa.subScores.proteinCal, bv: sb.subScores.proteinCal, fmt: one },
    { label: 'Sugar-to-carb', av: sa.subScores.sugarCarb, bv: sb.subScores.sugarCarb, fmt: one },
    { label: 'Price', av: a.price, bv: b.price, fmt: gbp, lowerWins: true },
  ]

  return (
    <div className="compare-grid">
      <Column item={a} score={sa} rows={rows} side="a" other={sb} />
      <Column item={b} score={sb} rows={rows} side="b" other={sa} />
    </div>
  )
}

function Column({ item, score, rows, side }) {
  return (
    <div className="compare-col">
      <div className="name">{item.name || 'Unnamed'}</div>
      <div className="muted small" style={{ marginBottom: 10 }}>{item.brand || ' '}</div>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 8 }}>
        <ScoreBadge score={score.composite} size="lg" />
      </div>
      <div className="small" style={{ textAlign: 'center', minHeight: 34, marginBottom: 4 }}>
        {verdict(score)}
      </div>
      {rows.map((r) => {
        const mine = side === 'a' ? r.av : r.bv
        const theirs = side === 'a' ? r.bv : r.av
        const win = isWinner(mine, theirs, r.lowerWins)
        return (
          <div className="compare-metric" key={r.label}>
            <div className="label">{r.label}</div>
            <div className={`val${win ? ' winner' : ''}`}>
              {mine == null ? '—' : r.fmt(mine)} {win ? '✓' : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function isWinner(mine, theirs, lowerWins) {
  if (mine == null) return false
  if (theirs == null) return true
  if (mine === theirs) return false
  return lowerWins ? mine < theirs : mine > theirs
}
