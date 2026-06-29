import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDietary, tagLabels } from '../src/lib/openfoodfacts.js'
import { aggregate, priceVerdict } from '../src/lib/openprices.js'
import { buildSearchUrl } from '../src/lib/offsearch.js'
import { servingMacros } from '../src/lib/scoring.js'

// ── Dietary flags (#3) ───────────────────────────────────────────────────────
test('parseDietary collapses OFF analysis tags to simple statuses', () => {
  const d = parseDietary(['en:vegan', 'en:vegetarian', 'en:palm-oil-free'])
  assert.deepEqual(d, { vegan: 'yes', vegetarian: 'yes', palmOil: 'free' })
  const d2 = parseDietary(['en:non-vegan', 'en:maybe-vegetarian', 'en:palm-oil'])
  assert.deepEqual(d2, { vegan: 'no', vegetarian: 'maybe', palmOil: 'yes' })
  assert.deepEqual(parseDietary(undefined), { vegan: null, vegetarian: null, palmOil: null })
})

test('tagLabels strips language prefixes and hyphens', () => {
  assert.deepEqual(tagLabels(['en:milk', 'en:tree-nuts']), ['milk', 'tree nuts'])
  assert.deepEqual(tagLabels(null), [])
})

// ── Open Prices (#1) ─────────────────────────────────────────────────────────
test('aggregate returns count/min/max/avg', () => {
  const a = aggregate([2, 4, 3])
  assert.equal(a.count, 3)
  assert.equal(a.min, 2)
  assert.equal(a.max, 4)
  assert.equal(a.avg, 3)
  assert.equal(aggregate([]), null)
})

test('priceVerdict grades a price against the community range', () => {
  const info = { count: 5, min: 2, avg: 3, max: 5, currency: 'GBP' }
  assert.equal(priceVerdict(2, info).tone, 'good') // at the floor → cheapest
  assert.equal(priceVerdict(2.5, info).tone, 'good') // below average
  assert.equal(priceVerdict(3, info).tone, 'ok') // ~ average
  assert.equal(priceVerdict(4, info).tone, 'warn') // above average
  assert.equal(priceVerdict(6, info).tone, 'bad') // beyond the max seen
  assert.equal(priceVerdict(3, null), null) // nothing to compare
  assert.equal(priceVerdict(0, info), null) // no price entered
})

// ── Category protein search (#2) ─────────────────────────────────────────────
test('buildSearchUrl sorts by protein, scopes to category + country', () => {
  const url = buildSearchUrl('en:yogurts', { country: 'en:united-kingdom', limit: 5 })
  assert.match(url, /^https:\/\/search\.openfoodfacts\.org\/search\?/)
  const qs = new URL(url).searchParams
  assert.equal(qs.get('sort_by'), '-nutriments.proteins_100g')
  assert.equal(qs.get('page_size'), '5')
  assert.match(qs.get('q'), /categories_tags:"en:yogurts"/)
  assert.match(qs.get('q'), /countries_tags:"en:united-kingdom"/)
  assert.match(qs.get('q'), /proteins_100g:\[1 TO \*\]/)
})

// ── Per-serving framing (#5) ─────────────────────────────────────────────────
test('servingMacros scales per-100g nutrition to one serving', () => {
  const m = servingMacros({ proteins: 10, energyKcal: 60, sugars: 4 }, 150)
  assert.equal(m.grams, 150)
  assert.equal(m.protein, 15)
  assert.equal(m.kcal, 90)
  assert.equal(m.sugars, 6)
  assert.equal(servingMacros({ proteins: 10 }, 0), null) // no serving size
  assert.equal(servingMacros({ proteins: 10 }, null), null)
})
