// Open Food Facts search (search-a-licious) — find the highest-protein products
// in a category, so the app can say "here are the best protein options on this
// shelf" rather than only scoring what you happened to scan.
//
// Keyless GET. NOTE: the exact sort field (`nutriments.proteins_100g`) and this
// host's browser CORS could not be verified against the live index from our
// build environment, so every failure returns [] and the feature simply hides.
// There's also a documented ~10 req/min limit, so this is on-demand only — never
// search-as-you-type.

const BASE = 'https://search.openfoodfacts.org/search'

const num = (v) => (Number.isFinite(+v) ? +v : 0)

export function buildSearchUrl(categoryTag, { country = 'en:united-kingdom', limit = 8 } = {}) {
  const q = [
    `categories_tags:"${categoryTag}"`,
    country ? `countries_tags:"${country}"` : '',
    'nutriments.proteins_100g:[1 TO *]', // ignore products with no/zero protein
  ]
    .filter(Boolean)
    .join(' ')
  const params = new URLSearchParams({
    q,
    sort_by: '-nutriments.proteins_100g', // highest protein first
    fields: 'code,product_name,brands,nutriments,nutriscore_grade',
    page_size: String(limit),
  })
  return `${BASE}?${params.toString()}`
}

// Returns [{ code, name, brand, protein, nutriscore }] sorted high→low, or [].
export async function topProteinInCategory(categoryTag, opts = {}) {
  if (!categoryTag) return []
  try {
    const res = await fetch(buildSearchUrl(categoryTag, opts), {
      signal: opts.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const d = await res.json()
    const hits = d.hits || d.products || []
    return hits
      .map((h) => ({
        code: h.code || null,
        name: (h.product_name || '').trim() || 'Unnamed product',
        brand: (h.brands || '').split(',')[0]?.trim() || '',
        protein: num(h?.nutriments?.proteins_100g),
        nutriscore: h.nutriscore_grade && /^[a-e]$/i.test(h.nutriscore_grade)
          ? String(h.nutriscore_grade).toUpperCase()
          : null,
      }))
      .filter((x) => x.protein > 0)
  } catch {
    return []
  }
}
