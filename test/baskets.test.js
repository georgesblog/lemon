import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemToRow, rowToItem } from '../src/lib/baskets.js'

// A representative scanned+priced item, exercising every field the mappers touch.
const item = {
  id: 'local-1',
  barcode: '5012345678900',
  name: 'Greek Yogurt',
  brand: 'Fage',
  image: 'https://img/y.jpg',
  nutritionImage: null,
  price: 2.5,
  packGrams: 500,
  servingQuantity: 150,
  nutritionDataPer: '100g',
  isDairy: true,
  novaGroup: 1,
  nutriscoreGrade: 'a',
  nutrientLevels: { fat: 'low' },
  categoryTag: 'en:yogurts',
  dietary: { vegan: 'no', vegetarian: 'yes', palmOil: null },
  additivesCount: 0,
  allergens: ['milk'],
  traces: [],
  nutriments: { proteins: 10, energyKcal: 97, carbs: 4, sugars: 4, fiber: 0, fat: 5, saturatedFat: 3 },
}

test('itemToRow promotes scoring columns and stows the rest in extra', () => {
  const row = itemToRow(item, 3)
  assert.equal(row.pack_grams, 500)
  assert.equal(row.is_dairy, true)
  assert.equal(row.nutriscore_grade, 'a')
  assert.equal(row.nova_group, 1)
  assert.equal(row.category_tag, 'en:yogurts')
  assert.equal(row.position, 3)
  assert.deepEqual(row.nutriments, item.nutriments)
  assert.deepEqual(row.extra, {
    image: item.image, nutritionImage: null, servingQuantity: 150,
    nutritionDataPer: '100g', nutrientLevels: { fat: 'low' },
    dietary: item.dietary, additivesCount: 0, allergens: ['milk'], traces: [],
  })
  // Column-backed fields must not be duplicated into extra.
  assert.ok(!('barcode' in row.extra) && !('price' in row.extra))
})

test('rowToItem restores an item, coercing PostgREST numeric strings', () => {
  // numeric columns arrive as strings over the wire.
  const row = { ...itemToRow(item, 0), price: '2.50', pack_grams: '500' }
  const back = rowToItem(row)
  assert.equal(back.price, 2.5)
  assert.equal(back.packGrams, 500)
  assert.equal(back.isDairy, true)
  assert.equal(back.novaGroup, 1)
  assert.deepEqual(back.dietary, item.dietary)
  assert.deepEqual(back.allergens, ['milk'])
  assert.equal(back.image, item.image)
  assert.ok(typeof back.id === 'string' && back.id.length > 0)
})

test('an item survives a full round-trip (ignoring the regenerated id)', () => {
  const { id: _drop, ...back } = rowToItem(itemToRow(item, 0))
  const { id: _orig, ...want } = item
  assert.deepEqual(back, want)
})

test('rowToItem tolerates a sparse row (null numerics, missing extra)', () => {
  const back = rowToItem({ barcode: '111', name: 'Loose apples', price: null, pack_grams: null })
  assert.equal(back.price, null)
  assert.equal(back.packGrams, null)
  assert.equal(back.brand, '')
  assert.deepEqual(back.nutriments, {})
})
