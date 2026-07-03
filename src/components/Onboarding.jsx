import { useState } from 'react'
import { PRESETS, DEFAULT_PRESET, DEFAULT_PROTEIN_TARGET } from '../lib/scoring.js'

// A ≤30-second first run: pick a goal, set a protein target, optionally name
// your usual store — then straight to scanning. No sign-up, everything stays on
// the device, and it's skippable. These same choices live in Settings after.
export default function Onboarding({ onDone }) {
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [proteinTarget, setProteinTarget] = useState(DEFAULT_PROTEIN_TARGET)
  const [store, setStore] = useState('')

  const finish = () => onDone({ preset, proteinTarget, store: store.trim() || null, onboarded: true })

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo-dot" /> Basket Score</h1>
      </header>

      <main className="content">
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
            Score any grocery for fitness value
          </div>
          <div className="muted small">
            Scan a barcode, add the price, and see which items give you the best
            protein for your money. No account — everything stays on your phone.
          </div>
        </div>

        <div className="field">
          <label>What are you training for?</label>
          <div className="chips">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button
                key={key}
                className={`chip${key === preset ? ' active' : ''}`}
                onClick={() => setPreset(key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>{describe(preset)}</div>
        </div>

        <div className="field">
          <label>Daily protein target — {proteinTarget}g</label>
          <input
            type="range" min="60" max="250" step="10"
            value={proteinTarget}
            onChange={(e) => setProteinTarget(parseInt(e.target.value, 10))}
          />
          <div className="muted small">Drives your basket's “cost per day” figure. Change it anytime.</div>
        </div>

        <div className="field">
          <label>Usual store (optional)</label>
          <input
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder="e.g. Aldi"
          />
        </div>
      </main>

      <div className="actionbar">
        <button className="btn ghost" onClick={() => onDone({ onboarded: true })}>Skip</button>
        <button className="btn primary" onClick={finish}>Start scanning</button>
      </div>
    </div>
  )
}

function describe(preset) {
  switch (preset) {
    case 'cutting':
      return 'Cutting: leans on protein-to-calorie so lean, filling items win.'
    case 'bulking':
      return 'Bulking: leans on value so cheap protein and calories win.'
    default:
      return 'Balanced: an even blend of value and protein quality.'
  }
}
