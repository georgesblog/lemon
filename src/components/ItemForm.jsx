import { useMemo, useState } from 'react'
import { scoreItem, verdict } from '../lib/scoring.js'
import { gbp } from '../lib/format.js'
import { ScoreBadge, MetricBar, NutriScore, NovaBadge } from './Bits.jsx'

// Confirm & price a scanned item — or fill one in by hand. Nutrition arrives
// pre-filled from Open Food Facts but every field is editable in case the API
// data is wrong or missing. Shows a live score as you type.
export default function ItemForm({ draft, weights, onSave, onCancel, loading }) {
  const [name, setName] = useState(draft?.name || '')
  const [brand, setBrand] = useState(draft?.brand || '')
  const [price, setPrice] = useState(draft?.price != null ? String(draft.price) : '')
  const [packGrams, setPackGrams] = useState(
    draft?.packGrams != null ? String(draft.packGrams) : ''
  )
  const n = draft?.nutriments || {}
  const [proteins, setProteins] = useState(numStr(n.proteins))
  const [energyKcal, setEnergyKcal] = useState(numStr(n.energyKcal))
  const [carbs, setCarbs] = useState(numStr(n.carbs))
  const [sugars, setSugars] = useState(numStr(n.sugars))
  const [fiber, setFiber] = useState(numStr(n.fiber))
  const [fat, setFat] = useState(numStr(n.fat))
  const [saturatedFat, setSaturatedFat] = useState(numStr(n.saturatedFat))
  const [isDairy, setIsDairy] = useState(!!draft?.isDairy)

  const candidate = useMemo(
    // ...draft carries through OFF-derived extras (novaGroup, nutriscoreGrade,
    // nutrientLevels, nutritionDataPer, images) we don't edit but want to keep.
    () => ({
      ...draft,
      name,
      brand,
      price: parseFloat(price),
      packGrams: parseFloat(packGrams),
      isDairy,
      nutriments: {
        proteins: parseFloat(proteins),
        energyKcal: parseFloat(energyKcal),
        carbs: parseFloat(carbs),
        sugars: parseFloat(sugars),
        fiber: parseFloat(fiber),
        fat: parseFloat(fat),
        saturatedFat: parseFloat(saturatedFat),
      },
    }),
    [draft, name, brand, price, packGrams, isDairy, proteins, energyKcal, carbs, sugars, fiber, fat, saturatedFat]
  )

  const score = useMemo(() => scoreItem(candidate, weights), [candidate, weights])

  const canSave =
    name.trim() &&
    parseFloat(price) > 0 &&
    parseFloat(packGrams) > 0 &&
    parseFloat(proteins) >= 0

  return (
    <div>
      {draft?.image ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <img className="item-thumb" src={draft.image} alt="" />
          <div className="muted small">From Open Food Facts — correct anything that looks off.</div>
        </div>
      ) : null}

      {/* Live score preview */}
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="muted small">Live score</div>
          <div style={{ fontWeight: 700 }}>{verdict(score)}</div>
          <div className="muted small">
            {score.costPer100gProtein != null
              ? `${gbp(score.costPer100gProtein)} / 100g protein`
              : 'Add price + protein to value it'}
          </div>
        </div>
        <ScoreBadge score={score.composite} size="lg" />
      </div>

      {/* Open Food Facts context badges (health grade + processing level) */}
      {(draft?.nutriscoreGrade || draft?.novaGroup) && (
        <div className="row" style={{ gap: 8, margin: '0 2px 12px' }}>
          <NutriScore grade={draft.nutriscoreGrade} />
          <NovaBadge group={draft.novaGroup} />
          <span className="muted small">health context (from Open Food Facts)</span>
        </div>
      )}

      {draft?.nutritionDataPer === 'serving' && (
        <div className="card small" style={{ borderColor: 'var(--warn)', marginTop: 0 }}>
          ⚠️ Label data was given per serving — we've converted it to per 100g.
          Double-check the numbers below.
        </div>
      )}

      <div className="field">
        <label>Item name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greek Yogurt 0%" />
      </div>
      <div className="field">
        <label>Brand (optional)</label>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Fage" />
      </div>

      <div className="grid2">
        <div className="field">
          <label>Price</label>
          <div className="with-prefix">
            <span className="prefix">£</span>
            <input
              type="number" inputMode="decimal" step="0.01" min="0"
              value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
            />
          </div>
        </div>
        <div className="field">
          <label>Pack size (g/ml)</label>
          <input
            type="number" inputMode="numeric" min="0"
            value={packGrams} onChange={(e) => setPackGrams(e.target.value)} placeholder="500"
          />
        </div>
      </div>

      <div className="sep" />
      <div className="muted small" style={{ marginBottom: 8 }}>Nutrition per 100g</div>
      <div className="grid2">
        <NumField label="Protein (g)" value={proteins} onChange={setProteins} />
        <NumField label="Energy (kcal)" value={energyKcal} onChange={setEnergyKcal} />
        <NumField label="Carbs (g)" value={carbs} onChange={setCarbs} />
        <NumField label="Sugars (g)" value={sugars} onChange={setSugars} />
        <NumField label="Fibre (g)" value={fiber} onChange={setFiber} />
        <NumField label="Fat (g)" value={fat} onChange={setFat} />
        <NumField label="Saturates (g)" value={saturatedFat} onChange={setSaturatedFat} />
      </div>

      <label className="row" style={{ gap: 10, margin: '6px 2px 2px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={isDairy}
          onChange={(e) => setIsDairy(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <span className="small">
          Dairy — forgive natural lactose in the sugar score
          {draft?.isDairy ? <span className="muted"> · auto-detected</span> : null}
        </span>
      </label>

      <div className="card" style={{ marginTop: 12 }}>
        <MetricBar label="Protein value (£/100g protein)" score={score.subScores.value}
          hint={score.costPer100gProtein != null ? gbp(score.costPer100gProtein) : null} />
        <MetricBar label="Protein-to-calorie" score={score.subScores.proteinCal} />
        <MetricBar label="Sugar-to-carb quality" score={score.subScores.sugarCarb} />
      </div>

      <div className="actionbar">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!canSave || loading} onClick={() => onSave(candidate)}>
          {loading ? 'Adding…' : 'Add to basket'}
        </button>
      </div>
    </div>
  )
}

function NumField({ label, value, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number" inputMode="decimal" step="0.1" min="0"
        value={value} onChange={(e) => onChange(e.target.value)} placeholder="0"
      />
    </div>
  )
}

const numStr = (v) => (v == null || !Number.isFinite(+v) ? '' : String(v))
