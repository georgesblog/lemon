import { scoreColor, one } from '../lib/format.js'

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
