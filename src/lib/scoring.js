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
  balanced: { label: 'Balanced', weights: { value: 0.3, proteinCal: 0.4, sugarCarb: 0.3 } },
  cutting: { label: 'Cutting', weights: { value: 0.15, proteinCal: 0.55, sugarCarb: 0.3 } },
  bulking: { label: 'Bulking', weights: { value: 0.5, proteinCal: 0.35, sugarCarb: 0.15 } },
}

export const DEFAULT_PRESET = 'balanced'
export const DEFAULT_PROTEIN_TARGET = 150 // grams/day

// A typical lactose baseline (g per 100g) we forgive for dairy, so naturally
// occurring milk sugars aren't penalised like added sugar.
export const LACTOSE_ALLOWANCE = 5

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

// Value: cheap protein scores high. A smooth curve that sinks toward — but
// never reaches — 0, so any two real items always get an ordered, comparable
// score (the whole point of comparing protein deals in the aisle). Anchored so
// £4 / 100g protein scores exactly 5/10 ("a fair deal"); bargains climb toward
// 10, rip-offs sink toward ~1 but never flatline.
export const FAIR_COST_PER_100G_PROTEIN = 4.0 // £/100g protein that scores 5/10
const VALUE_STEEPNESS = 1.6 // how sharply the score falls away from the fair price

export function valueScore(cost) {
  // null/0 means no price or no protein yet — there's no deal to score.
  if (cost == null || cost <= 0) return 0
  return clamp(10 / (1 + Math.pow(cost / FAIR_COST_PER_100G_PROTEIN, VALUE_STEEPNESS)), 0, 10)
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
// Dairy's natural lactose is forgiven upstream in scoreItem before this runs.
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

  // For dairy, forgive a typical lactose baseline so naturally occurring milk
  // sugars don't tank the sugar-to-carb score the way added sugar should.
  const effectiveSugars = item.isDairy
    ? Math.max(0, num(n.sugars) - LACTOSE_ALLOWANCE)
    : num(n.sugars)
  const sugarCarb = sugarCarbScore(effectiveSugars, n.carbs)

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
    fiber: num(n.fiber) * factor,
    fat: num(n.fat) * factor,
    satFat: num(n.saturatedFat) * factor,
  }
}

// An item is "unpriced" until it has a positive price. Rapid multi-scan adds
// items without a price, and the basket gathers these into a "needs price" tray.
export function needsPrice(item) {
  return !Number.isFinite(+item?.price) || +item.price <= 0
}

// Per-serving macros from per-100g nutrition + a serving size in grams. Lets
// the UI frame protein bars / shakes "per scoop" the way the label does.
// Returns null when there's no serving size to scale by.
export function servingMacros(nutriments = {}, servingGrams) {
  const g = num(servingGrams)
  if (g <= 0) return null
  const factor = g / 100
  return {
    grams: g,
    protein: num(nutriments.proteins) * factor,
    kcal: num(nutriments.energyKcal) * factor,
    sugars: num(nutriments.sugars) * factor,
  }
}

// ── Protein quantity ("did I actually get a decent hit?") ────────────────────
// The composite score rates protein *efficiency* (per £, per calorie) and
// deliberately ignores how much protein an item actually delivers. This is the
// complementary quantity lens: the absolute protein in one portion. A 33g-protein
// sandwich can score poorly on value yet still be a genuinely useful protein hit.
export const PROTEIN_PORTION_MIN = 10 // g/portion below which it isn't worth flagging
export const PROTEIN_PORTION_HIGH = 20 // g/portion that counts as a genuinely high hit
const PACK_AS_PORTION_MAX = 400 // g: only treat a whole pack as one portion below this

// Prefers the labelled serving size so a multi-serving pack (a litre of milk)
// isn't overstated; falls back to the pack only when it's small enough to
// plausibly be eaten in one go. Returns { grams, basis: 'serving'|'pack',
// tier: 'high'|'good' } or null (no protein / no usable portion size / below
// `min`). Pass { min: 0 } to get the raw figure for a direct comparison.
export function proteinPortion(item, { min = PROTEIN_PORTION_MIN } = {}) {
  const p100 = num((item?.nutriments || {}).proteins)
  if (p100 <= 0) return null
  const sq = num(item?.servingQuantity)
  const pack = num(item?.packGrams)
  let portionGrams
  let basis
  if (sq > 0) {
    portionGrams = sq
    basis = 'serving'
  } else if (pack > 0 && pack <= PACK_AS_PORTION_MAX) {
    portionGrams = pack
    basis = 'pack'
  } else {
    return null
  }
  const grams = (p100 * portionGrams) / 100
  if (grams < min) return null
  return { grams: Math.round(grams), basis, tier: grams >= PROTEIN_PORTION_HIGH ? 'high' : 'good' }
}

// ── Basket-level aggregates ──────────────────────────────────────────────────
export function basketSummary(items, weights, proteinTarget = DEFAULT_PROTEIN_TARGET) {
  const totals = { price: 0, protein: 0, kcal: 0, carbs: 0, sugars: 0, fiber: 0, fat: 0, satFat: 0 }
  let scoreSpendWeighted = 0

  for (const item of items) {
    const t = packTotals(item)
    totals.price += t.price
    totals.protein += t.protein
    totals.kcal += t.kcal
    totals.carbs += t.carbs
    totals.sugars += t.sugars
    totals.fiber += t.fiber
    totals.fat += t.fat
    totals.satFat += t.satFat
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

  // How many days of your protein target this basket covers — a personal
  // progress figure (no competition), e.g. "2.3 days at 150g/day".
  const proteinDays = proteinTarget > 0 ? totals.protein / proteinTarget : null

  return {
    count: items.length,
    totals: roundTotals(totals),
    composite,
    basketCostPer100gProtein,
    costPerProteinDay,
    proteinDays,
    proteinTarget,
  }
}

// ── Trust signal: how much of the score rests on solid data ──────────────────
// The score only means something if the numbers behind it are real. Flags when
// the key inputs (protein, energy, price, pack size) are missing, or when
// Open Food Facts gave figures per serving that we converted to per-100g.
// Returns { level: 'ok' | 'partial' | 'low', missing: [...], perServing }.
export function nutritionConfidence(item) {
  const n = item?.nutriments || {}
  const missing = []
  // Only the inputs whose absence actually distorts the score. (Missing carbs
  // just makes sugar-to-carb a non-issue, so it isn't flagged as low-trust.)
  if (!Number.isFinite(+n.proteins)) missing.push('protein')
  if (!Number.isFinite(+n.energyKcal)) missing.push('calories')
  if (!Number.isFinite(+item?.packGrams) || +item.packGrams <= 0) missing.push('pack size')
  const perServing = item?.nutritionDataPer === 'serving'
  let level = 'ok'
  if (missing.length >= 2) level = 'low'
  else if (missing.length === 1 || perServing) level = 'partial'
  return { level, missing, perServing }
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
