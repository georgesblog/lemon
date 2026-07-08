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

// Dietary flags + additive count from Open Food Facts' ingredient analysis.
// Only renders the notable, positive-or-cautionary chips to avoid clutter.
const NEUTRAL = '#3a4252'
export function DietaryBadges({ dietary, additivesCount }) {
  const chips = []
  if (dietary?.vegan === 'yes') chips.push(['Vegan', '#3a7d44'])
  else if (dietary?.vegetarian === 'yes') chips.push(['Vegetarian', '#3a7d44'])
  if (dietary?.palmOil === 'free') chips.push(['Palm-oil-free', '#3a7d44'])
  else if (dietary?.palmOil === 'yes') chips.push(['Palm oil', '#c0392b'])
  if (additivesCount != null) {
    const color = additivesCount === 0 ? '#3a7d44' : additivesCount <= 2 ? '#b88a00' : '#c0392b'
    chips.push([additivesCount === 0 ? 'No additives' : `${additivesCount} additive${additivesCount === 1 ? '' : 's'}`, color])
  }
  if (chips.length === 0) return null
  return (
    <>
      {chips.map(([label, color]) => (
        <span key={label} className="tag-badge" style={{ background: color, color: '#fff' }}>
          {label}
        </span>
      ))}
    </>
  )
}

// Absolute protein-per-portion chip — the "quantity" signal (how much protein
// you actually get in a sitting), distinct from the value/leanness score. Green
// when it's a genuinely high hit. Hidden when there's no usable portion figure.
export function ProteinBadge({ portion }) {
  if (!portion) return null
  const strong = portion.tier === 'high'
  return (
    <span
      className="tag-badge"
      style={{ background: strong ? '#2f8f5b' : '#3a4a63', color: '#fff' }}
      title={`≈ ${portion.grams}g protein per ${portion.basis}`}
    >
      💪 {portion.grams}g protein
    </span>
  )
}

// Coloured chip for an Open Prices "is this a good price?" verdict.
const PRICE_TONES = { good: '#2f8f5b', ok: '#5a6675', warn: '#b8761f', bad: '#c0392b' }
export function PriceVerdictBadge({ verdict }) {
  if (!verdict) return null
  return (
    <span className="tag-badge" style={{ background: PRICE_TONES[verdict.tone] || NEUTRAL, color: '#fff' }}>
      {verdict.label}
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
