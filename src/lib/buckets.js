// ── Buckets: where a product lives when you get home ─────────────────────────
//
// A 51-item basket is impossible to compare as one flat list. Grouping items
// into where they actually go — grab-and-go, fridge, pantry — turns it into a
// handful of shelf-by-shelf comparisons you can reason about.
//
// Every item is auto-classified from its Open Food Facts category tag + name
// (no network), and the guess is stored on the item so it round-trips through
// saved baskets and can be corrected with one tap. `bucketOf` is the single
// source of truth the UI reads: an explicit `item.bucket` (a manual override or
// a stored auto-guess) always wins; otherwise we classify on the fly.

export const BUCKETS = [
  { id: 'ready', label: 'Ready to eat', emoji: '🍫' },
  { id: 'fridge', label: 'Fridge', emoji: '🧊' },
  { id: 'pantry', label: 'Pantry', emoji: '🥫' },
  { id: 'other', label: 'Other', emoji: '🛒' },
]

export const BUCKET_IDS = BUCKETS.map((b) => b.id)

// Fixed display order + safe lookup that never returns undefined.
const BY_ID = Object.fromEntries(BUCKETS.map((b) => [b.id, b]))
export function bucketMeta(id) {
  return BY_ID[id] || BY_ID.other
}

// The item's bucket: an explicit override/stored guess wins, else classify now.
export function bucketOf(item) {
  const b = item?.bucket
  return b && BY_ID[b] ? b : classifyBucket(item)
}

// Normalise "en:greek-yogurts" / "Fage Total 0%" into space-separated words we
// can token-match, so "peanut" doesn't accidentally match the substring "nut".
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ── Auto-classifier ──────────────────────────────────────────────────────────
// A keyword heuristic, deliberately simple and fully offline. It won't be right
// every time (there's a one-tap re-bucket for that), but it gets the common UK
// grocery cases right. Order matters: earlier rules win.
export function classifyBucket(item) {
  const text = norm(`${item?.categoryTag || ''} ${item?.name || ''} ${item?.brand || ''}`)
  if (!text) return 'other'
  const tok = new Set(text.split(' '))
  const has = (w) => tok.has(w)
  const any = (...ws) => ws.some(has)
  const phrase = (p) => text.includes(p)

  // 1. Yoghurt: a single pot is grab-and-go; a big tub lives in the fridge.
  if (any('yogurt', 'yoghurt', 'yogurts', 'yoghurts') || phrase('greek yog')) {
    const g = Number(item?.packGrams)
    return Number.isFinite(g) && g > 0 && g < 200 ? 'ready' : 'fridge'
  }

  // 2. Nut / seed / chocolate butters and spreads are ambient pantry items —
  //    catch them before the "butter"/"nut" rules below send them elsewhere.
  if (
    any('spread', 'spreads', 'jam', 'jams', 'marmalade', 'honey', 'conserve') ||
    phrase('nut butter') ||
    phrase('peanut butter') ||
    (has('butter') && any('peanut', 'almond', 'cashew', 'nut', 'hazelnut', 'chocolate'))
  ) {
    return 'pantry'
  }

  // 3. Ready-to-eat: bars, snacks, drinks — things you open and consume.
  if (
    any(
      'bar', 'bars', 'flapjack', 'flapjacks', 'shake', 'shakes', 'smoothie', 'smoothies',
      'crisps', 'crisp', 'chips', 'crackers', 'cracker', 'popcorn', 'chocolate',
      'sweets', 'candy', 'biscuit', 'biscuits', 'cookie', 'cookies', 'jerky', 'biltong',
      'nuts', 'peanuts', 'almonds', 'cashews', 'pistachios'
    ) ||
    phrase('protein drink') ||
    phrase('protein shake') ||
    phrase('cereal bar') ||
    phrase('snack bar') ||
    phrase('protein bar')
  ) {
    return 'ready'
  }

  // 4. Fridge: dairy, chilled proteins, eggs.
  if (
    any(
      'milk', 'milks', 'cheese', 'cheeses', 'cream', 'creams', 'butter', 'butters',
      'egg', 'eggs', 'chilled', 'poultry', 'chicken', 'beef', 'pork', 'turkey',
      'bacon', 'ham', 'sausage', 'sausages', 'fish', 'salmon', 'tuna', 'seafood',
      'tofu', 'houmous', 'hummus', 'dip', 'dips', 'kefir', 'skyr', 'quark'
    )
  ) {
    return 'fridge'
  }

  // 5. Pantry: breads, cereals, grains, tins, ambient staples.
  if (
    any(
      'bread', 'breads', 'bagel', 'bagels', 'roll', 'rolls', 'wrap', 'wraps', 'tortilla',
      'pitta', 'cereal', 'cereals', 'granola', 'muesli', 'oat', 'oats', 'porridge',
      'pancake', 'pancakes', 'pasta', 'pastas', 'rice', 'noodle', 'noodles', 'couscous',
      'quinoa', 'lentil', 'lentils', 'bean', 'beans', 'tin', 'tinned', 'can', 'canned',
      'soup', 'soups', 'sauce', 'sauces', 'ketchup', 'flour', 'sugar'
    )
  ) {
    return 'pantry'
  }

  return 'other'
}

// ── Per-bucket sorting ───────────────────────────────────────────────────────
// The comparison axes the plan calls for. Each takes and returns entries of
// { item, score } (score from scoreItem) so sorting is a pure, testable
// reordering with no re-scoring.
export const SORTS = [
  { id: 'value', label: 'Best value' },
  { id: 'ppp', label: 'Cheapest protein' }, // £ per 100g protein
  { id: 'protein', label: 'Most protein' }, // g protein per 100g
  { id: 'price', label: 'Lowest price' },
]

const proteinDensity = (e) => {
  const p = Number(e?.item?.nutriments?.proteins)
  return Number.isFinite(p) ? p : -Infinity
}
const priceOf = (e) => {
  const p = Number(e?.item?.price)
  return Number.isFinite(p) ? p : Infinity
}
const pppOf = (e) => {
  const c = e?.score?.costPer100gProtein
  return c == null || !Number.isFinite(c) ? Infinity : c // nulls sort last
}

export function sortEntries(entries, sortId) {
  const list = [...(entries || [])]
  switch (sortId) {
    case 'ppp':
      return list.sort((a, b) => pppOf(a) - pppOf(b))
    case 'protein':
      return list.sort((a, b) => proteinDensity(b) - proteinDensity(a))
    case 'price':
      return list.sort((a, b) => priceOf(a) - priceOf(b))
    case 'value':
    default:
      return list.sort((a, b) => (b.score?.composite ?? 0) - (a.score?.composite ?? 0))
  }
}

// Group items into bucket → items[], preserving input order within a bucket and
// only including buckets that actually have something in them, in BUCKETS order.
export function groupByBucket(items) {
  const map = new Map(BUCKET_IDS.map((id) => [id, []]))
  for (const item of items || []) {
    const id = bucketOf(item)
    ;(map.get(id) || map.get('other')).push(item)
  }
  return BUCKETS.map((b) => ({ ...b, items: map.get(b.id) })).filter((g) => g.items.length > 0)
}
