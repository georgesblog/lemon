import { useEffect, useMemo, useState } from 'react'
import { supabase, ensureSession, isCloudEnabled } from '../lib/supabase.js'
import { gbp } from '../lib/format.js'
import {
  buildRows,
  sortRows,
  visibleColumns,
  distinctValues,
  titleCase,
  SORTABLE_COLUMNS,
} from '../lib/catalogCompare.js'

const COLUMN_LABELS = {
  store: 'Supermarket',
  name: 'Item',
  category: 'Item Type',
  price: 'Price',
  proteinPerPack: 'Protein/pack',
  value: '£ per 100g',
}

// "Best picks" — every priced item in the shared catalog (sandwiches today,
// more categories later), side by side, cheapest £/100g-protein first.
// Two filters up top narrow by supermarket and item type; leaving either on
// "All" brings its column back so the table still says what you're looking at.
export default function CatalogCompare({ onClose }) {
  const cloud = isCloudEnabled()
  const [state, setState] = useState(cloud ? 'loading' : 'disabled') // loading | error | ready | disabled
  const [items, setItems] = useState([])
  const [store, setStore] = useState('all')
  const [category, setCategory] = useState('all')
  const [sortKey, setSortKey] = useState('value')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    if (!cloud) return
    let cancelled = false
    ;(async () => {
      setState('loading')
      try {
        await ensureSession()
        const { data, error } = await supabase
          .from('catalog_items')
          .select('store,category,name,price,pack_grams,nutriments,url')
          .order('store')
        if (error) throw error
        if (!cancelled) {
          setItems(data ?? [])
          setState('ready')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud])

  const stores = useMemo(() => distinctValues(items, 'store'), [items])
  const categories = useMemo(() => distinctValues(items, 'category'), [items])
  const rows = useMemo(() => buildRows(items, { store, category }), [items, store, category])
  const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir])
  const columns = useMemo(() => visibleColumns({ store, category }), [store, category])

  const toggleSort = (key) => {
    if (!SORTABLE_COLUMNS.has(key)) return
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Supermarket</label>
          <select value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="all">All</option>
            {stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Item Type</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>{titleCase(c)}</option>
            ))}
          </select>
        </div>
      </div>

      {state === 'disabled' ? (
        <div className="empty">
          <div className="big">🥪</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Cloud sync isn’t set up</div>
          <div>Best picks compares the shared catalog, which needs cloud sync configured for this build.</div>
        </div>
      ) : state === 'loading' ? (
        <div className="muted small" style={{ padding: 8 }}>Loading…</div>
      ) : state === 'error' ? (
        <div className="empty">
          <div className="big">⚠️</div>
          <div>Couldn’t load the catalog.</div>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="empty">
          <div className="big">🥪</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No items yet</div>
          <div>Nothing in the catalog matches these filters.</div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((key) => {
                  const sortable = SORTABLE_COLUMNS.has(key)
                  const active = sortKey === key
                  return (
                    <th
                      key={key}
                      className={sortable ? 'sortable' : undefined}
                      onClick={sortable ? () => toggleSort(key) : undefined}
                    >
                      {COLUMN_LABELS[key]}
                      {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <tr key={`${r.store}-${r.name}-${i}`}>
                  {columns.map((key) => (
                    <td key={key}>{renderCell(key, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actionbar">
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function renderCell(key, r) {
  switch (key) {
    case 'store':
      return r.store || '—'
    case 'name':
      return r.url ? (
        <a href={r.url} target="_blank" rel="noreferrer">{r.name || 'Unnamed'}</a>
      ) : (
        r.name || 'Unnamed'
      )
    case 'category':
      return titleCase(r.category)
    case 'price':
      return gbp(r.price)
    case 'proteinPerPack':
      return formatGrams1(r.proteinPerPack)
    case 'value':
      return gbp(r.gbpPer100gProtein)
    default:
      return null
  }
}

// Protein/pack: ~1 dp with a "g" suffix (format.js's `grams` rounds to whole
// numbers, which loses precision that matters at this scale).
function formatGrams1(n) {
  return n == null || !Number.isFinite(n) ? '—' : `${Math.round(n * 10) / 10}g`
}
