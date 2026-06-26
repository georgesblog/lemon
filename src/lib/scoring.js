// ── Basket Score: the scoring engine ─────────────────────────────────────────
//
// Every item is reduced to three fitness-value metrics and one composite score
// out of 10. The composite is a weighted blend so a single number tells you
// whether an item earns its place in the basket.
//
// All nutrition figures are "per 100 g" as supplied by Open Food Facts (or
// entered by hand). Price + pack size let us turn those into value metrics.

// Weighting presets. Each preset's weights sum to 1. Tune these to your goal:
//  - cutting  → protein quality matters most (lean calories)
//  - bulking  → cheap calories/protein matter most (value)
//  - balanced → a sensible all-rounder default
export const PRESETS = {
  balanced: { label: 'Balanced', weights: { value: 0.4, proteinCal: 0.35, sugarCarb: 0.25 } },
  cutting: { label: 'Cutting', weights: { value: 0.3, proteinCal: 0.5, sugarCarb: 0.2 } },
  bulking: { label: 'Bulking', weights: { value: 0.6, proteinCal: 0.3, sugarCarb: 0.1 } },
}

export const DEFAULT_PRESET = 'balanced'
export const DEFAULT_PROTEIN_TARGET = 150 // grams/day

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const num = (v) => (Number.isFinite(+v) ? +v : 0)

// ── Core value metric: £ per 100 g of protein ────────────────────────────────
// Total protein in the pack = packGrams × protein_per_100g / 100.
// £/100g protein = price ÷ (total protein / 100). Lower is better.
export function costPer100gProtein({ price, packGrams, proteinPer100g }) {
  const totalProtein = (num(packGrams) * num(proteinPer100g)) / 100
  if (totalProtein <= 0 || num(price) <= 0) return null
  return (num(price) * 100) / totalProtein
}

// ── Sub-scores (each 0–10) ───────────────────────────────────────────────────

// Value: cheap protein scores high. £0.50/100g protein or less → 10,
// £6.00/100g protein or more → 0, linear in between.
export function valueScore(cost) {
  if (cost == null) return 0
  const LOW = 0.5
  const HIGH = 6.0
  return clamp(10 - ((cost - LOW) / (HIGH - LOW)) * 10, 0, 10)
}

// Protein-to-calorie quality: grams of protein per 100 kcal. Higher is leaner.
// 20 g+ per 100 kcal (near-pure protein) → 10, 0 → 0.
export function proteinCalScore(proteinPer100g, kcalPer100g) {
  const kcal = num(kcalPer100g)
  if (kcal <= 0) return 0
  const perHundredKcal = (num(proteinPer100g) / kcal) * 100
  return clamp((perHundredKcal / 20) * 10, 0, 10)
}

// Sugar-to-carb quality: what fraction of carbs are sugar. Lower is better.
// All-starch (0% sugar) → 10, all-sugar → 0. No carbs at all → 10 (a non-issue).
export function sugarCarbScore(sugarPer100g, carbsPer100g) {
  const carbs = num(carbsPer100g)
  if (carbs <= 0) return 10
  const fraction = clamp(num(sugarPer100g) / carbs, 0, 1)
  return (1 - fraction) * 10
}

// ── Composite "Fitness Value Score" out of 10 ────────────────────────────────
// A weighted blend of the three sub-scores. Returns the composite plus the
// individual pieces so the UI can show the breakdown.
export function scoreItem(item, weights = PRESETS[DEFAULT_PRESET].weights) {
  const n = item.nutriments || {}
  const cost = costPer100gProtein({
    price: item.price,
    packGrams: item.packGrams,
    proteinPer100g: n.proteins,
  })

  const value = valueScore(cost)
  const proteinCal = proteinCalScore(n.proteins, n.energyKcal)
  const sugarCarb = sugarCarbScore(n.sugars, n.carbs)

  const composite =
    value * weights.value +
    proteinCal * weights.proteinCal +
    sugarCarb * weights.sugarCarb

  return {
    composite: round1(composite),
    costPer100gProtein: cost,
    subScores: {
      value: round1(value),
      proteinCal: round1(proteinCal),
      sugarCarb: round1(sugarCarb),
    },
  }
}

// ── Per-pack macro totals (price-aware) ──────────────────────────────────────
// Turns "per 100 g" nutriments + pack size into the actual totals you're
// buying, so the basket can sum them up.
export function packTotals(item) {
  const n = item.nutriments || {}
  const g = num(item.packGrams)
  const factor = g / 100
  return {
    price: num(item.price),
    protein: num(n.proteins) * factor,
    kcal: num(n.energyKcal) * factor,
    carbs: num(n.carbs) * factor,
    sugars: num(n.sugars) * factor,
    fat: num(n.fat) * factor,
  }
}

// ── Basket-level aggregates ──────────────────────────────────────────────────
export function basketSummary(items, weights, proteinTarget = DEFAULT_PROTEIN_TARGET) {
  const totals = { price: 0, protein: 0, kcal: 0, carbs: 0, sugars: 0, fat: 0 }
  let scoreSpendWeighted = 0

  for (const item of items) {
    const t = packTotals(item)
    totals.price += t.price
    totals.protein += t.protein
    totals.kcal += t.kcal
    totals.carbs += t.carbs
    totals.sugars += t.sugars
    totals.fat += t.fat
    scoreSpendWeighted += scoreItem(item, weights).composite * t.price
  }

  // Spend-weighted basket composite: an expensive item drags the basket score
  // more than a cheap one, which matches how you actually feel a bad buy.
  const composite = totals.price > 0 ? round1(scoreSpendWeighted / totals.price) : 0

  // Cost to hit your daily protein target from this basket's protein mix.
  // basket £/100g protein × (target / 100).
  const basketCostPer100gProtein =
    totals.protein > 0 ? (totals.price * 100) / totals.protein : null
  const costPerProteinDay =
    basketCostPer100gProtein != null ? basketCostPer100gProtein * (proteinTarget / 100) : null

  return {
    count: items.length,
    totals: roundTotals(totals),
    composite,
    basketCostPer100gProtein,
    costPerProteinDay,
    proteinTarget,
  }
}

// Plain-English one-liner per item, no API needed. (An optional Claude-powered
// verdict can layer on top of this later.)
export function verdict(score) {
  const c = score.composite
  if (c >= 8.5) return 'Top-tier fitness value — buy it.'
  if (c >= 7) return 'Solid pick, earns its place.'
  if (c >= 5.5) return 'Fine if the price is right.'
  if (c >= 4) return 'Mediocre value — there are better buys.'
  return 'Poor fitness value — skip unless you want it.'
}

const round1 = (n) => Math.round(n * 10) / 10
function roundTotals(t) {
  const out = {}
  for (const k of Object.keys(t)) out[k] = Math.round(t[k] * 10) / 10
  return out
}
