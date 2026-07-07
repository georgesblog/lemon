import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyBucket,
  bucketOf,
  bucketMeta,
  groupByBucket,
  sortEntries,
  BUCKET_IDS,
} from '../src/lib/buckets.js'

// ── Auto-classifier ──────────────────────────────────────────────────────────
test('classifyBucket sorts common UK grocery items onto the right shelf', () => {
  assert.equal(classifyBucket({ name: 'Grenade Protein Bar' }), 'ready')
  assert.equal(classifyBucket({ name: 'Ready salted crisps' }), 'ready')
  assert.equal(classifyBucket({ name: 'Whole milk', categoryTag: 'en:milks' }), 'fridge')
  assert.equal(classifyBucket({ name: 'Mature cheddar cheese' }), 'fridge')
  assert.equal(classifyBucket({ name: 'Free range eggs' }), 'fridge')
  assert.equal(classifyBucket({ name: 'Wholemeal bread' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Porridge oats' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Chopped tomatoes tin' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Fresh basil plant' }), 'other')
  assert.equal(classifyBucket({}), 'other')
})

test('classifyBucket splits yoghurt by pack size', () => {
  // A single pot is grab-and-go; a big tub lives in the fridge.
  assert.equal(classifyBucket({ name: 'Greek yogurt', packGrams: 150 }), 'ready')
  assert.equal(classifyBucket({ name: 'Greek yogurt', packGrams: 500 }), 'fridge')
  // Exactly 200g and unknown weight both default to the fridge.
  assert.equal(classifyBucket({ name: 'Greek yogurt', packGrams: 200 }), 'fridge')
  assert.equal(classifyBucket({ name: 'Greek yogurt' }), 'fridge')
})

test('classifyBucket keeps nut butters and spreads in the pantry', () => {
  // These must be caught before the "butter"/"nut" fridge/ready rules.
  assert.equal(classifyBucket({ name: 'Peanut butter' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Almond butter' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Strawberry jam' }), 'pantry')
  assert.equal(classifyBucket({ name: 'Clear honey' }), 'pantry')
  // But a bag of nuts to snack on is still ready-to-eat.
  assert.equal(classifyBucket({ name: 'Roasted salted peanuts' }), 'ready')
})

test('word-boundary matching avoids substring false positives', () => {
  // "peanut" must not classify as fridge via the "nut"/butter path, and a
  // token match shouldn't fire on a substring like "canned" containing "can".
  assert.equal(classifyBucket({ name: 'Peanuts' }), 'ready')
})

// ── bucketOf: explicit override wins ─────────────────────────────────────────
test('bucketOf prefers an explicit stored bucket over classification', () => {
  // A milk hand-moved to the pantry stays in the pantry.
  assert.equal(bucketOf({ name: 'Whole milk', bucket: 'pantry' }), 'pantry')
  // An unknown bucket id falls back to classifying on the fly.
  assert.equal(bucketOf({ name: 'Whole milk', bucket: 'nonsense' }), 'fridge')
  assert.equal(bucketOf({ name: 'Protein bar' }), 'ready')
})

test('bucketMeta never returns undefined', () => {
  assert.equal(bucketMeta('ready').label, 'Ready to eat')
  assert.equal(bucketMeta('nonsense').id, 'other')
})

// ── Grouping ─────────────────────────────────────────────────────────────────
test('groupByBucket only emits non-empty buckets in fixed order', () => {
  const items = [
    { id: 1, name: 'Protein bar' }, // ready
    { id: 2, name: 'Whole milk' }, // fridge
    { id: 3, name: 'Sourdough bread' }, // pantry
    { id: 4, name: 'Another protein bar' }, // ready
  ]
  const groups = groupByBucket(items)
  assert.deepEqual(groups.map((g) => g.id), ['ready', 'fridge', 'pantry'])
  assert.equal(groups[0].items.length, 2) // both bars land together
  // Every emitted bucket id is a known one.
  for (const g of groups) assert.ok(BUCKET_IDS.includes(g.id))
})

// ── Per-bucket sorting ───────────────────────────────────────────────────────
test('sortEntries orders by each axis, nulls last', () => {
  const entries = [
    { item: { price: 3, nutriments: { proteins: 10 } }, score: { composite: 5, costPer100gProtein: 2 } },
    { item: { price: 1, nutriments: { proteins: 20 } }, score: { composite: 8, costPer100gProtein: 5 } },
    { item: { price: 2, nutriments: { proteins: 5 } }, score: { composite: 3, costPer100gProtein: null } },
  ]
  const ids = (list) => list.map((e) => e.item.price)

  // Best value → highest composite first.
  assert.deepEqual(ids(sortEntries(entries, 'value')), [1, 3, 2])
  // Cheapest protein → lowest £/100g protein, null sorts last.
  assert.deepEqual(ids(sortEntries(entries, 'ppp')), [3, 1, 2])
  // Most protein → highest protein density first.
  assert.deepEqual(ids(sortEntries(entries, 'protein')), [1, 3, 2])
  // Lowest price first.
  assert.deepEqual(ids(sortEntries(entries, 'price')), [1, 2, 3])
})

test('sortEntries does not mutate its input', () => {
  const entries = [
    { item: { price: 2 }, score: { composite: 1 } },
    { item: { price: 1 }, score: { composite: 9 } },
  ]
  const before = entries.map((e) => e.item.price)
  sortEntries(entries, 'value')
  assert.deepEqual(entries.map((e) => e.item.price), before)
})
