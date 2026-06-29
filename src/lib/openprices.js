// Open Prices client (prices.openfoodfacts.org) — crowd-sourced grocery prices.
// Free, keyless for reads. We use it to suggest a price on scan and to judge
// whether the price you're paying is good against what others have seen.
//
// Everything here degrades to null/[]: Open Prices is community data (UK
// coverage is still thin) and its browser CORS, while expected to work, isn't
// guaranteed — so a failed/empty lookup must never block adding an item.

const BASE = 'https://prices.openfoodfacts.org/api/v1'

const num = (v) => (Number.isFinite(+v) ? +v : 0)

// Min/avg/max price for a barcode, scoped to one currency (GBP for the UK).
// Tries the dedicated stats endpoint first, then falls back to pulling the
// price list and aggregating ourselves. Returns { count, min, max, avg,
// currency } or null.
export async function fetchPriceInfo(barcode, { currency = 'GBP', signal } = {}) {
  if (!barcode) return null

  // 1. Direct stats endpoint — one call returns the aggregates.
  try {
    const url = `${BASE}/prices/stats?product_code=${encodeURIComponent(barcode)}&currency=${currency}`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (res.ok) {
      const d = await res.json()
      const count = num(d.price__count)
      if (count > 0) {
        return { count, min: num(d.price__min), max: num(d.price__max), avg: num(d.price__avg), currency }
      }
    }
  } catch {
    /* fall through to the list aggregation */
  }

  // 2. Fallback: fetch the price list and aggregate client-side. (Covers the
  // case where the stats endpoint isn't available or returns nothing.)
  try {
    const url = `${BASE}/prices?product_code=${encodeURIComponent(barcode)}&currency=${currency}&size=100`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    const prices = (d.items || []).map((p) => +p.price).filter((x) => Number.isFinite(x) && x > 0)
    return aggregate(prices, currency)
  } catch {
    return null
  }
}

export function aggregate(prices, currency = 'GBP') {
  if (!Array.isArray(prices) || prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const sum = sorted.reduce((s, n) => s + n, 0)
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    currency,
  }
}

// How good is `price` against the community range? Returns { label, tone } or
// null when there's nothing to compare against.
export function priceVerdict(price, info) {
  const p = +price
  if (!info || !info.count || !Number.isFinite(p) || p <= 0) return null
  if (p <= info.min * 1.02) return { label: 'Cheapest seen', tone: 'good' }
  if (p < info.avg * 0.98) return { label: 'Below average', tone: 'good' }
  if (p <= info.avg * 1.05) return { label: 'Typical price', tone: 'ok' }
  if (p <= info.max) return { label: 'Above average', tone: 'warn' }
  return { label: 'Pricey', tone: 'bad' }
}
