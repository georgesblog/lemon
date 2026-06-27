import { scoreColor, one } from '../lib/format.js'

// Official Nutri-Score letter grade (A best … E worst), in its standard colours.
const NUTRI_COLORS = { A: '#038141', B: '#85bb2f', C: '#fecb02', D: '#ee8100', E: '#e63e11' }
export function NutriScore({ grade }) {
  const g = grade ? String(grade).toUpperCase() : null
  if (!g || !NUTRI_COLORS[g]) return null
  const dark = g === 'C' // amber needs dark text for contrast
  return (
    <span className="tag-badge" style={{ background: NUTRI_COLORS[g], color: dark ? '#0f1115' : '#fff' }}
      title="Nutri-Score (A best, E worst)">
      Nutri {g}
    </span>
  )
}

// NOVA food-processing group (1 unprocessed … 4 ultra-processed).
const NOVA_COLORS = { 1: '#3a7d44', 2: '#b88a00', 3: '#d2691e', 4: '#c0392b' }
export function NovaBadge({ group }) {
  if (!group || !NOVA_COLORS[group]) return null
  return (
    <span className="tag-badge" style={{ background: NOVA_COLORS[group], color: '#fff' }}
      title="NOVA processing group (1 = unprocessed, 4 = ultra-processed)">
      NOVA {group}
    </span>
  )
}

// A square score badge, coloured by value, reading "X.X / 10".
export function ScoreBadge({ score, size = 'md' }) {
  const color = scoreColor(score)
  return (
    <div
      className={`score-badge${size === 'lg' ? ' lg' : ''}`}
      style={{ background: color }}
      aria-label={`Score ${one(score)} out of 10`}
    >
      <div>
        {one(score)}
        <small> /10</small>
      </div>
    </div>
  )
}

// A labelled 0–10 progress bar for a single sub-metric.
export function MetricBar({ label, score, hint }) {
  const color = scoreColor(score)
  const pct = Math.max(0, Math.min(100, (score / 10) * 100))
  return (
    <div className="metric">
      <div className="spread">
        <span>{label}</span>
        <span style={{ color, fontWeight: 700 }}>
          {one(score)}
          {hint ? <span className="muted" style={{ fontWeight: 400 }}> · {hint}</span> : null}
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
