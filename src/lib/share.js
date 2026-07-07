// Public share links — publish a read-only leaderboard of your basket.
//
// A share is a *snapshot* you choose to make public: the priced items, grouped
// by shelf, ranked best-value first, trimmed to the top few per shelf, carrying
// only product/score/price fields (name, brand, score, £/100g protein, price,
// image URL). No identity, no auth id, no barcodes — nothing that ties back to
// you beyond the products you picked to show.
//
// The link is …/#/s/<token>, where <token> is an unguessable UUID. Anyone with
// it can view via the anon key alone (no sign-in); nobody can enumerate shares —
// the table has no public read, only a token RPC (see the migration). Creating
// and revoking a share needs your (anonymous) session, so a share is owned by,
// and revocable by, only the device/account that made it.

import { supabase, ensureSession, isCloudEnabled } from './supabase.js'
import { scoreItem } from './scoring.js'
import { needsPrice } from './scoring.js'
import { groupByBucket, bucketOf, sortEntries } from './buckets.js'

export const SNAPSHOT_VERSION = 1

// Sharing only lights up when cloud sync is configured; otherwise the button is
// hidden and the app stays fully offline.
export function canShare() {
  return isCloudEnabled()
}

// ── Build the snapshot ────────────────────────────────────────────────────────
// Pure and testable: priced items → { v, title, buckets: [{ id,label,emoji,
// items:[…] }] }, each shelf best-value-first and capped to topN. Only the
// display fields the viewer needs are copied; nothing else leaves the device.
export function buildSnapshot(items, weights, { topN = 5, title = null } = {}) {
  const priced = (items || []).filter((it) => !needsPrice(it))
  const entries = priced.map((item) => ({ item, score: scoreItem(item, weights) }))

  const buckets = groupByBucket(priced).map((g) => {
    const inBucket = entries.filter((e) => bucketOf(e.item) === g.id)
    const top = sortEntries(inBucket, 'value').slice(0, topN)
    return {
      id: g.id,
      label: g.label,
      emoji: g.emoji,
      items: top.map(({ item, score }) => ({
        name: item.name || 'Unnamed',
        brand: item.brand || null,
        score: score.composite,
        pppProtein: Number.isFinite(score.costPer100gProtein) ? score.costPer100gProtein : null,
        price: Number.isFinite(Number(item.price)) ? Number(item.price) : null,
        image: item.image || null,
      })),
    }
  })

  return { v: SNAPSHOT_VERSION, title: title || null, buckets }
}

// True when there's actually something worth sharing (at least one priced item).
export function hasShareableItems(items) {
  return (items || []).some((it) => !needsPrice(it))
}

// ── Cloud operations ──────────────────────────────────────────────────────────

// Publish a snapshot and return its unguessable token. Needs a session so the
// row is owned (and later revocable) by this account.
export async function createShare(snapshot, { title = null } = {}) {
  if (!supabase) throw new Error('Sharing needs cloud sync enabled.')
  const session = await ensureSession()
  if (!session) throw new Error('Could not sign in to create a share link.')
  const { data, error } = await supabase
    .from('shared_boards')
    .insert({ user_id: session.user.id, title: title ?? snapshot?.title ?? null, snapshot })
    .select('token')
    .single()
  if (error) throw error
  return data.token
}

// Read a shared board by token. Goes through the SECURITY DEFINER RPC, so a
// viewer needs no session — the anon key alone works. Returns null if the token
// doesn't exist or the board has expired.
export async function fetchShare(token) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_shared_board', { board_token: token })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    token: row.token,
    title: row.title ?? null,
    snapshot: row.snapshot ?? { v: SNAPSHOT_VERSION, buckets: [] },
    createdAt: row.created_at ?? null,
  }
}

// Revoke a share — deletes the row, so the link dies. RLS scopes the delete to
// the owner, so this only ever removes your own board.
export async function revokeShare(token) {
  if (!supabase) return
  const session = await ensureSession()
  if (!session) return
  const { error } = await supabase.from('shared_boards').delete().eq('token', token)
  if (error) throw error
}

// The public URL for a token. Uses the current origin + path so it works whether
// the app is served from a domain root or a project subpath (e.g. /lemon/).
export function shareUrl(token, loc = typeof window !== 'undefined' ? window.location : null) {
  const base = loc ? `${loc.origin}${loc.pathname}${loc.search}` : ''
  return `${base}#/s/${token}`
}

// Parse a share token out of a location hash, or null if it isn't a share route.
// Matches exactly one canonical UUID so a stray hash never triggers the viewer.
const TOKEN_RE = /^#\/s\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
export function parseShareHash(hash) {
  const m = String(hash || '').match(TOKEN_RE)
  return m ? m[1] : null
}
