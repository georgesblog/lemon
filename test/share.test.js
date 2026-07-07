import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, hasShareableItems, parseShareHash, shareUrl } from '../src/lib/share.js'
import { PRESETS, DEFAULT_PRESET } from '../src/lib/scoring.js'

const W = PRESETS[DEFAULT_PRESET].weights

// A minimal priced item the scorer can handle.
const item = (over = {}) => ({
  name: 'Thing', price: 2, packGrams: 100,
  nutriments: { proteins: 20, energyKcal: 200, carbs: 10, sugars: 2 },
  ...over,
})

// ── Snapshot shape & content ─────────────────────────────────────────────────
test('buildSnapshot groups priced items by bucket, drops unpriced ones', () => {
  const snap = buildSnapshot([
    item({ name: 'Protein bar', price: 1 }), // ready
    item({ name: 'Whole milk', price: 1 }), // fridge
    item({ name: 'No price bar', price: null }), // unpriced → excluded
  ], W)

  assert.equal(snap.v, 1)
  assert.deepEqual(snap.buckets.map((b) => b.id), ['ready', 'fridge'])
  // The unpriced item never makes it into any bucket.
  const names = snap.buckets.flatMap((b) => b.items.map((i) => i.name))
  assert.deepEqual(names.sort(), ['Protein bar', 'Whole milk'])
})

test('buildSnapshot copies only display fields, nothing identifying', () => {
  const snap = buildSnapshot([
    item({ name: 'Bar', brand: 'ACME', price: 2, image: 'http://x/y.jpg', barcode: '123' }),
  ], W)
  const row = snap.buckets[0].items[0]
  assert.deepEqual(Object.keys(row).sort(), ['brand', 'image', 'name', 'pppProtein', 'price', 'score'])
  assert.equal(row.brand, 'ACME')
  assert.equal(row.image, 'http://x/y.jpg')
  assert.ok(!('barcode' in row)) // no barcode leaks into the share
})

test('buildSnapshot caps each shelf to topN, best value first', () => {
  const bars = Array.from({ length: 5 }, (_, i) =>
    item({ name: `Bar ${i}`, price: i + 1 }) // cheaper = better value = higher score
  )
  const snap = buildSnapshot(bars, W, { topN: 2 })
  const ready = snap.buckets.find((b) => b.id === 'ready')
  assert.equal(ready.items.length, 2)
  // Cheapest (best value) should sort first.
  assert.equal(ready.items[0].name, 'Bar 0')
})

test('buildSnapshot carries an optional title', () => {
  assert.equal(buildSnapshot([item()], W, { title: 'Lidl run' }).title, 'Lidl run')
  assert.equal(buildSnapshot([item()], W).title, null)
})

test('hasShareableItems needs at least one priced item', () => {
  assert.equal(hasShareableItems([item({ price: null })]), false)
  assert.equal(hasShareableItems([item({ price: null }), item({ price: 2 })]), true)
  assert.equal(hasShareableItems([]), false)
})

// ── Routing helpers ──────────────────────────────────────────────────────────
test('parseShareHash extracts a UUID token, rejects anything else', () => {
  const uuid = '5f9d1c2e-1a2b-4c3d-8e4f-0a1b2c3d4e5f'
  assert.equal(parseShareHash(`#/s/${uuid}`), uuid)
  assert.equal(parseShareHash(`#/s/${uuid.toUpperCase()}`), uuid.toUpperCase())
  assert.equal(parseShareHash('#/s/not-a-uuid'), null)
  assert.equal(parseShareHash('#/settings'), null)
  assert.equal(parseShareHash(''), null)
  assert.equal(parseShareHash(`#/s/${uuid}/extra`), null) // no trailing junk
})

test('shareUrl builds an origin+path #/s/ link', () => {
  const loc = { origin: 'https://ex.com', pathname: '/lemon/', search: '' }
  assert.equal(shareUrl('abc', loc), 'https://ex.com/lemon/#/s/abc')
})
