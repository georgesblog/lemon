import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  costPer100gProtein,
  valueScore,
  proteinCalScore,
  sugarCarbScore,
  scoreItem,
  basketSummary,
  packTotals,
  PRESETS,
} from '../src/lib/scoring.js'
import { parseGrams, looksDairy } from '../src/lib/openfoodfacts.js'

test('costPer100gProtein: £2 for a 450g tub at 10g protein/100g', () => {
  // 450g × 10/100 = 45g protein. £2 / (45/100) = £4.44 per 100g protein.
  const c = costPer100gProtein({ price: 2, packGrams: 450, proteinPer100g: 10 })
  assert.ok(Math.abs(c - 4.444) < 0.01)
})

test('costPer100gProtein: returns null when no protein or price', () => {
  assert.equal(costPer100gProtein({ price: 2, packGrams: 450, proteinPer100g: 0 }), null)
  assert.equal(costPer100gProtein({ price: 0, packGrams: 450, proteinPer100g: 10 }), null)
})

test('valueScore: smooth curve, £4/100g protein anchors at 5/10', () => {
  assert.ok(Math.abs(valueScore(4) - 5) < 0.01) // the "fair deal" anchor
  assert.equal(valueScore(null), 0) // no price/protein → not a deal
  assert.equal(valueScore(0), 0)
})

test('valueScore: never zero for any real (positive) cost', () => {
  // The whole point of the comparison app: even a terrible deal stays > 0 and
  // ordered, so two pricey items are still distinguishable.
  assert.ok(valueScore(20) > 0)
  assert.ok(valueScore(50) > 0)
  // Cheaper protein always scores strictly higher than dearer protein.
  assert.ok(valueScore(2) > valueScore(4))
  assert.ok(valueScore(4) > valueScore(7.37))
  assert.ok(valueScore(7.37) > valueScore(20)) // the two real yoghurts, now separable
})

test('proteinCalScore: leaner is better, capped at 10', () => {
  assert.equal(proteinCalScore(0, 100), 0)
  // 25g protein / 100 kcal → 25 per 100kcal → above the 20 cap → 10
  assert.equal(proteinCalScore(25, 100), 10)
  // 10g / 100 kcal → 10 per 100kcal → 5.0
  assert.equal(proteinCalScore(10, 100), 5)
  assert.equal(proteinCalScore(10, 0), 0) // guard against zero kcal
})

test('sugarCarbScore: all-sugar bad, no-sugar good, zero-carb neutral-good', () => {
  assert.equal(sugarCarbScore(0, 50), 10) // starchy, no sugar
  assert.equal(sugarCarbScore(50, 50), 0) // all sugar
  assert.equal(sugarCarbScore(25, 50), 5) // half
  assert.equal(sugarCarbScore(0, 0), 10) // e.g. meat, no carbs at all
})

test('scoreItem: composite is a weighted blend within 0–10', () => {
  const item = {
    price: 2,
    packGrams: 450,
    nutriments: { proteins: 10, energyKcal: 60, carbs: 4, sugars: 4, fat: 0 },
  }
  const s = scoreItem(item, PRESETS.balanced.weights)
  assert.ok(s.composite >= 0 && s.composite <= 10)
  assert.ok(s.subScores.value >= 0 && s.subScores.value <= 10)
  assert.equal(typeof s.costPer100gProtein, 'number')
})

test('scoreItem: cutting preset rewards lean protein over cheap calories', () => {
  // A lean, slightly pricey item vs a cheap, sugary one.
  const lean = { price: 3, packGrams: 200, nutriments: { proteins: 20, energyKcal: 100, carbs: 2, sugars: 0, fat: 1 } }
  const sugary = { price: 1, packGrams: 500, nutriments: { proteins: 5, energyKcal: 200, carbs: 40, sugars: 38, fat: 2 } }
  const cut = PRESETS.cutting.weights
  assert.ok(scoreItem(lean, cut).composite > scoreItem(sugary, cut).composite)
})

test('basketSummary: totals and protein-day cost', () => {
  const items = [
    { id: 'a', price: 2, packGrams: 500, nutriments: { proteins: 10, energyKcal: 60, carbs: 4, sugars: 4, fat: 0 } },
    { id: 'b', price: 4, packGrams: 1000, nutriments: { proteins: 12, energyKcal: 70, carbs: 5, sugars: 3, fat: 1 } },
  ]
  const sum = basketSummary(items, PRESETS.balanced.weights, 150)
  assert.equal(sum.count, 2)
  assert.equal(sum.totals.price, 6) // £2 + £4
  // protein: 500×10/100 + 1000×12/100 = 50 + 120 = 170g
  assert.equal(sum.totals.protein, 170)
  // basket £/100g protein = 6×100/170 = 3.529; ×1.5 = 5.29
  assert.ok(Math.abs(sum.costPerProteinDay - 5.294) < 0.02)
})

test('packTotals scales per-100g nutrition by pack size', () => {
  const t = packTotals({ price: 2, packGrams: 200, nutriments: { proteins: 10, energyKcal: 60, carbs: 4, sugars: 2, fat: 1 } })
  assert.equal(t.protein, 20)
  assert.equal(t.kcal, 120)
  assert.equal(t.carbs, 8)
})

test('dairy items get their lactose forgiven in the sugar-to-carb score', () => {
  // Plain Greek yogurt: all 4g of carbs are lactose (sugar). Non-dairy → 0;
  // dairy → forgiven up to the lactose baseline, so it scores well.
  const base = { price: 2.5, packGrams: 450, nutriments: { proteins: 10, energyKcal: 57, carbs: 4, sugars: 4, fat: 0 } }
  const nonDairy = scoreItem({ ...base, isDairy: false }, PRESETS.balanced.weights)
  const dairy = scoreItem({ ...base, isDairy: true }, PRESETS.balanced.weights)
  assert.equal(nonDairy.subScores.sugarCarb, 0)
  assert.equal(dairy.subScores.sugarCarb, 10)
  assert.ok(dairy.composite > nonDairy.composite)
})

test('dairy lactose forgiveness still penalises added sugar', () => {
  // Sweetened/fruit yogurt: 12g sugar of 14g carbs. Even forgiving 5g lactose,
  // 7g of 14g carbs is still sugar → roughly half marks, not full.
  const sweet = scoreItem(
    { price: 2, packGrams: 450, isDairy: true, nutriments: { proteins: 5, energyKcal: 90, carbs: 14, sugars: 12, fat: 2 } },
    PRESETS.balanced.weights
  )
  assert.ok(sweet.subScores.sugarCarb > 3 && sweet.subScores.sugarCarb < 7)
})

test('looksDairy detects dairy category tags', () => {
  assert.equal(looksDairy(['en:dairies', 'en:greek-yogurts']), true)
  assert.equal(looksDairy(['en:milks']), true)
  assert.equal(looksDairy(['en:cheeses']), true)
  assert.equal(looksDairy(['en:snacks', 'en:biscuits']), false)
  assert.equal(looksDairy(undefined), false)
})

test('parseGrams handles common quantity strings', () => {
  assert.equal(parseGrams('450 g'), 450)
  assert.equal(parseGrams('1 kg'), 1000)
  assert.equal(parseGrams('1L'), 1000)
  assert.equal(parseGrams('500ml'), 500)
  assert.equal(parseGrams('4 x 125g'), 500)
  assert.equal(parseGrams('foo'), null)
})
