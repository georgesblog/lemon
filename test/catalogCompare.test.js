import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  proteinPerPack,
  gbpPer100gProtein,
  titleCase,
  distinctValues,
  buildRows,
  sortRows,
  visibleColumns,
  SORTABLE_COLUMNS,
} from '../src/lib/catalogCompare.js'

const waitroseChicken = {
  store: 'Waitrose', category: 'sandwiches', name: 'Chicken & Bacon',
  price: 3.5, pack_grams: 200, nutriments: { proteins: 15 }, url: 'https://example.com/a',
}
const tescoEgg = {
  store: 'Tesco', category: 'sandwiches', name: 'Egg Mayo',
  price: 1.8, pack_grams: 180, nutriments: { proteins: 8 }, url: null,
}
const waitroseNoPrice = {
  store: 'Waitrose', category: 'sandwiches', name: 'Ham & Cheese',
  price: null, pack_grams: 200, nutriments: { proteins: 12 }, url: null,
}
const tescoNoPack = {
  store: 'Tesco', category: 'wraps', name: 'Falafel Wrap',
  price: 2.5, pack_grams: null, nutriments: { proteins: 9 }, url: null,
}

test('proteinPerPack: grams in the whole pack, null if either input missing', () => {
  assert.equal(proteinPerPack(waitroseChicken), 30) // 200 * 15 / 100
  assert.equal(proteinPerPack(tescoNoPack), null)
  assert.equal(proteinPerPack({ pack_grams: 200, nutriments: {} }), null)
})

test('gbpPer100gProtein: reuses costPer100gProtein, null when price or protein missing', () => {
  // 200g * 15/100 = 30g protein; £3.50 / (30/100) = £11.666.. per 100g protein
  assert.ok(Math.abs(gbpPer100gProtein(waitroseChicken) - 11.6667) < 0.01)
  assert.equal(gbpPer100gProtein(waitroseNoPrice), null)
})

test('titleCase: nicely cases category slugs', () => {
  assert.equal(titleCase('sandwiches'), 'Sandwiches')
  assert.equal(titleCase('meal-deals'), 'Meal Deals')
  assert.equal(titleCase('hot_food'), 'Hot Food')
  assert.equal(titleCase(''), '')
  assert.equal(titleCase(null), '')
})

test('distinctValues: sorted, unique, drops nulls/empties', () => {
  const items = [{ store: 'Tesco' }, { store: 'Waitrose' }, { store: 'Tesco' }, { store: null }, { store: '' }]
  assert.deepEqual(distinctValues(items, 'store'), ['Tesco', 'Waitrose'])
})

test('buildRows: filters by store and category, maps derived fields', () => {
  const items = [waitroseChicken, tescoEgg, waitroseNoPrice, tescoNoPack]

  const all = buildRows(items, { store: 'all', category: 'all' })
  assert.equal(all.length, 4)

  const waitroseOnly = buildRows(items, { store: 'Waitrose', category: 'all' })
  assert.equal(waitroseOnly.length, 2)
  assert.ok(waitroseOnly.every((r) => r.store === 'Waitrose'))

  const sandwichesOnly = buildRows(items, { store: 'all', category: 'sandwiches' })
  assert.equal(sandwichesOnly.length, 3)

  const row = buildRows([waitroseChicken], {})[0]
  assert.equal(row.proteinPerPack, 30)
  assert.ok(Math.abs(row.gbpPer100gProtein - 11.6667) < 0.01)
  assert.equal(row.price, 3.5)
  assert.equal(row.url, 'https://example.com/a')
})

test('sortRows: ascending value order, nulls always sink to the bottom', () => {
  const rows = buildRows([waitroseChicken, tescoEgg, waitroseNoPrice, tescoNoPack], {})
  // tescoEgg: £1.8 / (180*8/100/100) = £1.8 / 0.144*100 -> compute below via gbpPer100gProtein
  const asc = sortRows(rows, 'gbpPer100gProtein', 'asc')
  // Null-value rows (waitroseNoPrice has no price, tescoNoPack has no pack) sort last regardless.
  const nullTailNames = asc.slice(-2).map((r) => r.name).sort()
  assert.deepEqual(nullTailNames, ['Falafel Wrap', 'Ham & Cheese'])
  // Among the priced rows, ascending £/100g protein order.
  const priced = asc.filter((r) => r.gbpPer100gProtein != null)
  for (let i = 1; i < priced.length; i++) {
    assert.ok(priced[i - 1].gbpPer100gProtein <= priced[i].gbpPer100gProtein)
  }

  // Nulls still sink to the bottom in descending order.
  const desc = sortRows(rows, 'gbpPer100gProtein', 'desc')
  const descNullTailNames = desc.slice(-2).map((r) => r.name).sort()
  assert.deepEqual(descNullTailNames, ['Falafel Wrap', 'Ham & Cheese'])
  const pricedDesc = desc.filter((r) => r.gbpPer100gProtein != null)
  for (let i = 1; i < pricedDesc.length; i++) {
    assert.ok(pricedDesc[i - 1].gbpPer100gProtein >= pricedDesc[i].gbpPer100gProtein)
  }
})

test('sortRows: stable — equal values keep their original order', () => {
  const rows = [
    { name: 'a', price: 1 },
    { name: 'b', price: 1 },
    { name: 'c', price: 1 },
  ]
  const sorted = sortRows(rows, 'price', 'asc')
  assert.deepEqual(sorted.map((r) => r.name), ['a', 'b', 'c'])
})

test('visibleColumns: All/All shows Supermarket + Item Type; a specific filter drops its own column', () => {
  assert.deepEqual(visibleColumns({ store: 'all', category: 'all' }),
    ['store', 'name', 'category', 'price', 'proteinPerPack', 'value'])
  assert.deepEqual(visibleColumns({ store: 'Waitrose', category: 'all' }),
    ['name', 'category', 'price', 'proteinPerPack', 'value'])
  assert.deepEqual(visibleColumns({ store: 'all', category: 'sandwiches' }),
    ['store', 'name', 'price', 'proteinPerPack', 'value'])
  assert.deepEqual(visibleColumns({ store: 'Waitrose', category: 'sandwiches' }),
    ['name', 'price', 'proteinPerPack', 'value'])
})

test('SORTABLE_COLUMNS: exactly the numeric base columns', () => {
  assert.deepEqual([...SORTABLE_COLUMNS].sort(), ['price', 'proteinPerPack', 'value'])
})
