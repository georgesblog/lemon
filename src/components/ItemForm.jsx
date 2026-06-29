import { useEffect, useMemo, useState } from 'react'
import { scoreItem, verdict, servingMacros } from '../lib/scoring.js'
import { fetchPriceInfo, priceVerdict } from '../lib/openprices.js'
import { topProteinInCategory } from '../lib/offsearch.js'
import { gbp, grams, kcal } from '../lib/format.js'
import { ScoreBadge, MetricBar, NutriScore, NovaBadge, DietaryBadges, PriceVerdictBadge } from './Bits.jsx'

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

  // ── Open Prices: community price for this barcode (best-effort) ────────────
  const [priceInfo, setPriceInfo] = useState(null)
  useEffect(() => {
    if (!draft?.barcode) return
    const ctrl = new AbortController()
    fetchPriceInfo(draft.barcode, { signal: ctrl.signal })
      .then((info) => setPriceInfo(info))
      .catch(() => {})
    return () => ctrl.abort()
  }, [draft?.barcode])

  const candidate = useMemo(
    // ...draft carries through OFF-derived extras (novaGroup, nutriscoreGrade,
    // nutrientLevels, nutritionDataPer, images, dietary, allergens) we don't
    // edit but want to keep.
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
  const pVerdict = priceVerdict(price, priceInfo)
  const perServing = useMemo(
    () => servingMacros(candidate.nutriments, draft?.servingQuantity),
    [candidate.nutriments, draft?.servingQuantity]
  )

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

      {/* Open Food Facts context badges: health grade, processing, diet flags */}
      {(draft?.nutriscoreGrade || draft?.novaGroup || hasDietary(draft)) && (
        <div className="row wrap" style={{ gap: 8, margin: '0 2px 12px' }}>
          <NutriScore grade={draft.nutriscoreGrade} />
          <NovaBadge group={draft.novaGroup} />
          <DietaryBadges dietary={draft.dietary} additivesCount={draft.additivesCount} />
        </div>
      )}

      {(draft?.allergens?.length > 0 || draft?.traces?.length > 0) && (
        <div className="muted small" style={{ margin: '-6px 2px 12px' }}>
          {draft.allergens?.length > 0 && <>Contains: {draft.allergens.join(', ')}. </>}
          {draft.traces?.length > 0 && <>May contain: {draft.traces.join(', ')}.</>}
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

      {/* Open Prices suggestion + "good price?" verdict */}
      {priceInfo && priceInfo.count > 0 && (
        <div className="row wrap small" style={{ gap: 8, margin: '-4px 2px 10px', alignItems: 'center' }}>
          <span className="muted">
            Open Prices: avg {gbp(priceInfo.avg)} ({gbp(priceInfo.min)}–{gbp(priceInfo.max)}, {priceInfo.count} seen)
          </span>
          <button type="button" className="chip-btn" onClick={() => setPrice((priceInfo.avg).toFixed(2))}>
            Use avg
          </button>
          <PriceVerdictBadge verdict={pVerdict} />
        </div>
      )}

      <div className="sep" />
      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted small">Nutrition per 100g</span>
        {perServing && (
          <span className="muted small">
            Per serving ({grams(perServing.grams)}): {grams(perServing.protein)} protein · {kcal(perServing.kcal)}
          </span>
        )}
      </div>
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

      {draft?.categoryTag && <CategoryLeaders categoryTag={draft.categoryTag} currentBarcode={draft.barcode} />}

      <div className="actionbar">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!canSave || loading} onClick={() => onSave(candidate)}>
          {loading ? 'Adding…' : 'Add to basket'}
        </button>
      </div>
    </div>
  )
}

// "Best protein in this category" — pulls the top-protein products in the same
// Open Food Facts category (UK), on demand. Best-effort: hides itself if the
// search returns nothing.
function CategoryLeaders({ categoryTag, currentBarcode }) {
  const [state, setState] = useState('idle') // idle | loading | done
  const [rows, setRows] = useState([])
  const label = categoryTag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')

  const load = () => {
    setState('loading')
    topProteinInCategory(categoryTag)
      .then((r) => { setRows(r); setState('done') })
      .catch(() => { setRows([]); setState('done') })
  }

  if (state === 'idle') {
    return (
      <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={load}>
        🏆 Best protein in “{label}”
      </button>
    )
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Highest protein in “{label}” (UK)
      </div>
      {state === 'loading' && <div className="muted small">Searching…</div>}
      {state === 'done' && rows.length === 0 && (
        <div className="muted small">No category data available right now.</div>
      )}
      {rows.map((r, i) => (
        <div key={r.code || i} className="spread leader-row">
          <span className="small" style={{ fontWeight: r.code === currentBarcode ? 700 : 400 }}>
            {i + 1}. {r.name}{r.brand ? <span className="muted"> · {r.brand}</span> : null}
            {r.code === currentBarcode ? <span className="muted"> · this item</span> : null}
          </span>
          <span className="row" style={{ gap: 6 }}>
            <NutriScore grade={r.nutriscore} />
            <span className="small" style={{ fontWeight: 700 }}>{grams(r.protein)}/100g</span>
          </span>
        </div>
      ))}
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
// True only when DietaryBadges will actually render at least one chip, so the
// wrapping row never shows up empty.
const hasDietary = (d) =>
  d?.dietary?.vegan === 'yes' || d?.dietary?.vegetarian === 'yes' ||
  d?.dietary?.palmOil === 'free' || d?.dietary?.palmOil === 'yes' ||
  d?.additivesCount != null
