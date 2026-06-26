import { PRESETS } from '../lib/scoring.js'

// Tune the scoring to your goal. Presets shift the weighting between value and
// protein quality; the protein target drives the "cost per day" basket figure.
export default function Settings({ preset, proteinTarget, onChangePreset, onChangeTarget, onClose }) {
  return (
    <div>
      <div className="field">
        <label>Goal preset</label>
        <div className="chips">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={`chip${key === preset ? ' active' : ''}`}
              onClick={() => onChangePreset(key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          {describe(preset)}
        </div>
      </div>

      <div className="card">
        <div className="muted small" style={{ marginBottom: 8 }}>Current weighting</div>
        <Weights weights={PRESETS[preset].weights} />
      </div>

      <div className="field">
        <label>Daily protein target — {proteinTarget}g</label>
        <input
          type="range" min="60" max="250" step="10"
          value={proteinTarget}
          onChange={(e) => onChangeTarget(parseInt(e.target.value, 10))}
        />
        <div className="muted small">
          Drives the basket's “cost per day to hit your protein” figure.
        </div>
      </div>

      <div className="actionbar">
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function Weights({ weights }) {
  const rows = [
    ['£/100g protein (value)', weights.value],
    ['Protein-to-calorie', weights.proteinCal],
    ['Sugar-to-carb', weights.sugarCarb],
  ]
  return (
    <div className="stack">
      {rows.map(([label, w]) => (
        <div className="metric" key={label}>
          <div className="spread small">
            <span>{label}</span>
            <span style={{ fontWeight: 700 }}>{Math.round(w * 100)}%</span>
          </div>
          <div className="bar">
            <span style={{ width: `${w * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function describe(preset) {
  switch (preset) {
    case 'cutting':
      return 'Cutting: leans on protein-to-calorie quality so lean, filling items win.'
    case 'bulking':
      return 'Bulking: leans on value so cheap protein and calories win.'
    default:
      return 'Balanced: an even blend of value and protein quality.'
  }
}
