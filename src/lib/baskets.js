// Saved baskets — named snapshots and reusable templates of a shop.
//
// Offline-first, like the rest of the app: when Supabase is configured *and* an
// (anonymous) session is available, saved baskets live in the cloud and sync
// across devices; otherwise they fall back to a localStorage collection on this
// device. The two never mix — every call re-checks the session and picks a lane —
// so the feature behaves identically whether or not the backend is wired up. If
// cloud is configured but sign-in fails, we degrade to local rather than error.

import { supabase, ensureSession } from './supabase.js'
import { makeId } from './storage.js'

const SAVED_KEY = 'basket-score:saved:v1'

// Resolves to an authenticated session (cloud lane) or null (local lane).
async function cloudSession() {
  if (!supabase) return null
  try {
    return await ensureSession()
  } catch {
    return null
  }
}

// ── app item  ⇄  basket_items row ────────────────────────────────────────────
// The DB promotes the columns the scorer and price-sharing rely on; everything
// else the app tracks (images, dietary flags, allergens…) rides along in the
// `extra` JSONB so a saved item round-trips losslessly. `nutriments` keeps the
// client's shape verbatim in its own JSONB column.
const EXTRA_FIELDS = [
  'image', 'nutritionImage', 'servingQuantity', 'nutritionDataPer',
  'nutrientLevels', 'dietary', 'additivesCount', 'allergens', 'traces',
  'bucket', // the (possibly hand-corrected) shelf a saved item belongs to
]

export function itemToRow(item, position) {
  const extra = {}
  for (const k of EXTRA_FIELDS) if (item[k] !== undefined) extra[k] = item[k]
  return {
    barcode: item.barcode ?? null,
    name: item.name ?? null,
    brand: item.brand ?? null,
    price: item.price ?? null,
    pack_grams: item.packGrams ?? null,
    is_dairy: !!item.isDairy,
    nutriscore_grade: item.nutriscoreGrade ?? null,
    nova_group: item.novaGroup ?? null,
    category_tag: item.categoryTag ?? null,
    nutriments: item.nutriments ?? {},
    extra,
    position,
  }
}

export function rowToItem(row) {
  // Postgres `numeric` comes back over PostgREST as a string — coerce to number.
  const num = (v) => (v == null ? null : Number(v))
  return {
    id: makeId(), // a fresh working-basket id; the saved snapshot is never mutated
    barcode: row.barcode ?? null,
    name: row.name ?? '',
    brand: row.brand ?? '',
    price: num(row.price),
    packGrams: num(row.pack_grams),
    isDairy: !!row.is_dairy,
    nutriscoreGrade: row.nutriscore_grade ?? null,
    novaGroup: row.nova_group ?? null,
    categoryTag: row.category_tag ?? null,
    nutriments: row.nutriments ?? {},
    ...(row.extra ?? {}),
  }
}

// ── localStorage lane ────────────────────────────────────────────────────────
function localAll() {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function localWrite(arr) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr))
  } catch {
    /* quota / private mode — the save just won't persist */
  }
}

const nowIso = () => new Date().toISOString()

// ── Public API ───────────────────────────────────────────────────────────────
// Every saved basket is summarised as { id, name, isTemplate, store, updatedAt,
// itemCount, cloud } — the shape the list UI renders.

export async function listSaved() {
  const session = await cloudSession()
  if (session) {
    const { data, error } = await supabase
      .from('baskets')
      .select('id, name, is_template, store, updated_at, basket_items(count)')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      isTemplate: b.is_template,
      store: b.store,
      updatedAt: b.updated_at,
      itemCount: b.basket_items?.[0]?.count ?? 0,
      cloud: true,
    }))
  }
  return localAll()
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((b) => ({
      id: b.id,
      name: b.name,
      isTemplate: !!b.isTemplate,
      store: b.store ?? null,
      updatedAt: b.updatedAt,
      itemCount: b.items?.length ?? 0,
      cloud: false,
    }))
}

export async function createSaved({ name, isTemplate = false, store = null, items = [] }) {
  const session = await cloudSession()
  if (session) {
    const uid = session.user.id
    const { data: basket, error } = await supabase
      .from('baskets')
      .insert({ user_id: uid, name, is_template: isTemplate, store })
      .select('id')
      .single()
    if (error) throw error
    if (items.length) {
      const rows = items.map((it, i) => ({ ...itemToRow(it, i), basket_id: basket.id, user_id: uid }))
      const { error: itemsError } = await supabase.from('basket_items').insert(rows)
      if (itemsError) {
        // Best-effort rollback so a failed item insert never leaves an empty basket.
        await supabase.from('baskets').delete().eq('id', basket.id)
        throw itemsError
      }
    }
    return { id: basket.id, cloud: true }
  }
  const all = localAll()
  const entry = {
    id: makeId(),
    name,
    isTemplate: !!isTemplate,
    store: store ?? null,
    items,
    updatedAt: nowIso(),
  }
  all.push(entry)
  localWrite(all)
  return { id: entry.id, cloud: false }
}

export async function renameSaved(id, name) {
  const session = await cloudSession()
  if (session) {
    // The baskets_set_updated_at trigger bumps updated_at for us.
    const { error } = await supabase.from('baskets').update({ name }).eq('id', id)
    if (error) throw error
    return
  }
  const all = localAll()
  const entry = all.find((b) => b.id === id)
  if (entry) {
    entry.name = name
    entry.updatedAt = nowIso()
    localWrite(all)
  }
}

export async function deleteSaved(id) {
  const session = await cloudSession()
  if (session) {
    // basket_items cascade on the FK, so the rows go with it.
    const { error } = await supabase.from('baskets').delete().eq('id', id)
    if (error) throw error
    return
  }
  localWrite(localAll().filter((b) => b.id !== id))
}

// Returns the saved basket's items as fresh working-basket items (new ids).
export async function loadSavedItems(id) {
  const session = await cloudSession()
  if (session) {
    const { data, error } = await supabase
      .from('basket_items')
      .select('*')
      .eq('basket_id', id)
      .order('position', { ascending: true })
    if (error) throw error
    return (data ?? []).map(rowToItem)
  }
  const entry = localAll().find((b) => b.id === id)
  return (entry?.items ?? []).map((it) => ({ ...it, id: makeId() }))
}
