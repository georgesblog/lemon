import { useEffect, useMemo, useState } from 'react'
import { scoreItem, verdict, servingMacros, nutritionConfidence } from '../lib/scoring.js'
import { fetchPriceInfo, priceVerdict } from '../lib/openprices.js'
import { topProteinInCategory, betterProteinPicks } from '../lib/offsearch.js'
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
  // The scan flow looks this up in parallel and passes it in via draft.priceInfo
  // so it's instant; we only fetch here when it wasn't pre-loaded (e.g. editing
  // an item from the basket).
  const [priceInfo, setPriceInfo] = useState(draft?.priceInfo ?? null)
  useEffect(() => {
    if (!draft?.barcode || draft?.priceInfo) return
    const ctrl = new AbortController()
    fetchPriceInfo(draft.barcode, { signal: ctrl.signal })
      .then((info) => setPriceInfo(info))
      .catch(() => {})
    return () => ctrl.abort()
  }, [draft?.barcode, draft?.priceInfo])

  // Our own number pad drives the price. iOS won't auto-raise the system
  // keyboard after a camera scan (no user gesture), so a built-in pad is the
  // only way to make pricing zero-tap. Open it immediately on a fresh scan.
  const [padOpen, setPadOpen] = useState(!draft?.id)
  const pressKey = (k) => {
    setPrice((cur) => {
      if (k === 'back') return cur.slice(0, -1)
      if (k === '.') return cur.includes('.') ? cur : `${cur || '0'}.`
      if (!/^[0-9]$/.test(k)) return cur
      // cap at two decimal places
      if (cur.includes('.') && cur.split('.')[1].length >= 2) return cur
      return cur + k
    })
  }

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
  const confidence = useMemo(() => nutritionConfidence(candidate), [candidate])
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

      {/* Trust signal: how solid the numbers behind the score are. Stays quiet
          on a blank form (nothing to trust yet). */}
      {(score.composite > 0 || confidence.perServing) && <ConfidenceHint confidence={confidence} />}

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
              type="text" inputMode="none" readOnly
              className={padOpen ? 'price-active' : undefined}
              value={price} placeholder="0.00"
              onClick={() => setPadOpen(true)}
              onKeyDown={(e) => {
                // physical keyboard support (desktop) on the read-only field
                if (e.key === 'Backspace') { pressKey('back'); e.preventDefault() }
                else if (e.key === '.' || /^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault() }
              }}
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

      {padOpen && <NumPad onKey={pressKey} />}

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

      {draft?.categoryTag && (
        <BetterPicks
          categoryTag={draft.categoryTag}
          currentBarcode={draft.barcode}
          currentProtein={parseFloat(proteins)}
        />
      )}

      <div className="actionbar">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!canSave || loading} onClick={() => onSave(candidate)}>
          {loading ? 'Adding…' : 'Add to basket'}
        </button>
      </div>
    </div>
  )
}

// "Better pick" — automatically surfaces higher-protein alternatives in the
// same Open Food Facts category (UK) the moment the confirm screen opens, so a
// better option is offered without the user going looking. Best-effort: it
// loads quietly and hides itself entirely if the search returns nothing
// (CORS/empty/offline), never blocking the confirm flow. Comparison is on
// protein density — the leaders carry no price, so this is framed as nutrition,
// not value.
function BetterPicks({ categoryTag, currentBarcode, currentProtein }) {
  const [state, setState] = useState('loading') // loading | done
  const [rows, setRows] = useState([])
  const label = categoryTag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')

  useEffect(() => {
    let live = true
    const ctrl = new AbortController()
    topProteinInCategory(categoryTag, { signal: ctrl.signal })
      .then((r) => { if (live) { setRows(r); setState('done') } })
      .catch(() => { if (live) { setRows([]); setState('done') } })
    return () => { live = false; ctrl.abort() }
  }, [categoryTag])

  // Nothing to show yet, or nothing came back — stay out of the way.
  if (state === 'loading') return null
  if (rows.length === 0) return null

  const base = Number.isFinite(+currentProtein) ? +currentProtein : 0
  const picks = betterProteinPicks(rows, { currentProtein: base, currentBarcode })

  // The scanned item is already at/near the top of its category — reassure
  // rather than nag.
  if (picks.length === 0) {
    return (
      <div className="card small" style={{ marginTop: 12, borderColor: 'var(--accent-dim)' }}>
        ✅ Strong protein pick for “{label}” — little in this category beats it.
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 12, borderColor: 'var(--accent)' }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 700 }}>Better pick in “{label}”</span>
        {base > 0 && <span className="pill">this: {grams(base)}/100g</span>}
      </div>
      {picks.map((r, i) => {
        const per100kcal = r.kcal > 0 ? (r.protein / r.kcal) * 100 : null
        return (
          <div key={r.code || i} className="spread leader-row">
            <span className="small">
              {r.name}{r.brand ? <span className="muted"> · {r.brand}</span> : null}
              {per100kcal != null && (
                <span className="muted"> · {per100kcal.toFixed(1)}g/100kcal</span>
              )}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <NutriScore grade={r.nutriscore} />
              <span className="small" style={{ fontWeight: 700, color: 'var(--good)' }}>
                {grams(r.protein)}/100g
              </span>
            </span>
          </div>
        )
      })}
      <div className="muted small" style={{ marginTop: 8 }}>
        Higher protein per 100g in the UK Open Food Facts data — check the price to compare value.
      </div>
    </div>
  )
}

// Small, honest confidence line under the live score: the score is only as good
// as the numbers behind it. Silent when everything needed is present.
function ConfidenceHint({ confidence }) {
  if (!confidence || confidence.level === 'ok') return null
  const { level, missing, perServing } = confidence
  const parts = []
  if (perServing) parts.push('converted from per-serving label data')
  if (missing.length) parts.push(`missing ${missing.join(', ')}`)
  const tone = level === 'low' ? 'var(--bad)' : 'var(--warn)'
  return (
    <div className="small" style={{ margin: '-4px 2px 12px', color: tone }}>
      {level === 'low' ? '⚠️ Low-confidence score' : 'ℹ️ Estimated score'} — {parts.join('; ')}. Edit the fields below to fix it.
    </div>
  )
}

// In-app numeric keypad for the price. Shown immediately on a fresh scan so
// you can start entering the price with zero taps — the system keyboard can't
// auto-open on iOS after a camera scan.
const PAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'back']
function NumPad({ onKey }) {
  return (
    <div className="numpad" role="group" aria-label="Price keypad">
      {PAD_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="numpad-key"
          onClick={() => onKey(k)}
          aria-label={k === 'back' ? 'Delete' : k}
        >
          {k === 'back' ? '⌫' : k}
        </button>
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
