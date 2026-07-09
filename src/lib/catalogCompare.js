// Pure helpers behind the catalog comparison table
// (src/components/CatalogCompare.jsx — "Best picks", currently sandwiches).
//
// Kept separate from the component so the filtering/ranking/column logic is
// testable under plain Node (`node --test`) without a JSX/bundler step.

import { costPer100gProtein } from './scoring.js'

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v)

// Grams of protein in the whole pack, or null if either input is missing.
export function proteinPerPack(item) {
  const packGrams = num(item?.pack_grams)
  const proteinPer100g = num(item?.nutriments?.proteins)
  if (packGrams == null || proteinPer100g == null) return null
  return (packGrams * proteinPer100g) / 100
}

// £ per 100g of protein for a catalog row — the value metric, lower is better.
export function gbpPer100gProtein(item) {
  return costPer100gProtein({
    price: item?.price,
    packGrams: item?.pack_grams,
    proteinPer100g: item?.nutriments?.proteins,
  })
}

// 'sandwiches' -> 'Sandwiches', 'meal-deals' -> 'Meal Deals'
export function titleCase(s) {
  if (!s) return ''
  return String(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Distinct, sorted, non-empty values of a field across the catalog — used to
// build the filter <select> options ("All" is added separately by the UI).
export function distinctValues(items, field) {
  const set = new Set()
  for (const it of items || []) {
    const v = it?.[field]
    if (v != null && v !== '') set.add(v)
  }
  return Array.from(set).sort()
}

// Filters the raw catalog rows by store/category ('all' = no filter on that
// axis), then maps each into the plain row shape the table renders and sorts.
export function buildRows(items, { store = 'all', category = 'all' } = {}) {
  return (items || [])
    .filter((it) => (store === 'all' || it.store === store) && (category === 'all' || it.category === category))
    .map((it) => ({
      store: it.store ?? null,
      name: it.name ?? null,
      category: it.category ?? null,
      url: it.url ?? null,
      price: num(it.price),
      proteinPerPack: proteinPerPack(it),
      gbpPer100gProtein: gbpPer100gProtein(it),
    }))
}

// Sorts rows by a numeric field. Nulls always sink to the bottom, in either
// direction — a missing price/value should never read as "the best deal".
// Ties keep their original relative order (stable).
export function sortRows(rows, key, direction = 'asc') {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = a.r[key]
      const bv = b.r[key]
      if (av == null && bv == null) return a.i - b.i
      if (av == null) return 1
      if (bv == null) return -1
      if (av === bv) return a.i - b.i
      return direction === 'asc' ? av - bv : bv - av
    })
    .map((x) => x.r)
}

// Which columns to show, and in what order, for the current filter state.
// Both filters "All" -> every extra column; a specific filter hides its own
// column (there's nothing left to disambiguate).
export function visibleColumns(filters = {}) {
  const { store = 'all', category = 'all' } = filters
  const cols = []
  if (store === 'all') cols.push('store')
  cols.push('name')
  if (category === 'all') cols.push('category')
  cols.push('price', 'proteinPerPack', 'value')
  return cols
}

// The base columns whose header can be clicked to toggle sort.
export const SORTABLE_COLUMNS = new Set(['price', 'proteinPerPack', 'value'])
