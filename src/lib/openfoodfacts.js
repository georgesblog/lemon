// Open Food Facts client. Free, keyless. We ask only for the fields we score on
// to keep responses small at the shop.

const FIELDS = [
  'product_name',
  'brands',
  'nutriments',
  'quantity',
  'product_quantity', // numeric pack size, more reliable than parsing `quantity`
  'product_quantity_unit',
  'serving_size',
  'serving_quantity', // numeric serving size (g), used to derive per-100g if needed
  'nutrition_data_per', // "100g" or "serving" — guards our per-100g assumption
  'image_front_small_url',
  'image_nutrition_small_url', // photo of the label, to verify/correct macros
  'categories_tags',
  'nova_group', // 1–4 processing level
  'nutriscore_grade', // a–e health grade (current default = 2023 algorithm)
  'nutriscore', // per-version object; we pin to the 2023 grade when present
  'nutrient_levels', // low/moderate/high for fat, sat-fat, sugars, salt
  'ingredients_analysis_tags', // vegan / vegetarian / palm-oil flags
  'additives_tags',
  'additives_n', // count of additives — an "ultra-processed" signal
  'allergens_tags',
  'traces_tags', // "may contain" allergens
].join(',')

// Open Food Facts encodes diet status as taxonomy tags. Collapse each axis to a
// simple status the UI can badge.
export function parseDietary(tags) {
  const has = (t) => Array.isArray(tags) && tags.includes(t)
  const axis = (yes, no, maybe) =>
    has(yes) ? 'yes' : has(no) ? 'no' : has(maybe) ? 'maybe' : null
  return {
    vegan: axis('en:vegan', 'en:non-vegan', 'en:maybe-vegan'),
    vegetarian: axis('en:vegetarian', 'en:non-vegetarian', 'en:maybe-vegetarian'),
    palmOil: has('en:palm-oil')
      ? 'yes'
      : has('en:palm-oil-free')
        ? 'free'
        : has('en:may-contain-palm-oil')
          ? 'maybe'
          : null,
  }
}

// "en:milk" → "milk", "en:tree-nuts" → "tree nuts". Drops the language prefix
// and hyphens for human-readable allergen / trace lists.
export function tagLabels(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map((t) => String(t).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim())
    .filter(Boolean)
}

// The current Nutri-Score letter, pinned to the 2023 algorithm when the
// per-version object is present (so the grade doesn't silently change when OFF
// flips its default), falling back to the top-level grade.
function nutriscoreGrade(p) {
  const g = p?.nutriscore?.['2023']?.grade || p?.nutriscore_grade
  return g && /^[a-e]$/i.test(g) ? String(g).toUpperCase() : null
}

// Most specific category tag (OFF lists them broad → narrow), used to find the
// best protein options in the same category.
function leafCategory(tags) {
  return Array.isArray(tags) && tags.length ? tags[tags.length - 1] : null
}

// Open Food Facts category tags look like "en:greek-yogurts". If a product
// reads as dairy we forgive its natural lactose in the sugar-to-carb score.
const DAIRY_HINTS = [
  'dairy', 'dairies', 'yogurt', 'yoghurt', 'milk', 'kefir', 'skyr', 'quark',
  'fromage', 'cheese', 'cream',
]

export function looksDairy(categoriesTags) {
  if (!Array.isArray(categoriesTags)) return false
  return categoriesTags.some((t) => DAIRY_HINTS.some((h) => String(t).includes(h)))
}

// Parse Open Food Facts' free-text quantity ("450 g", "1 L", "4 x 125g") into
// grams. Returns null if we can't tell, so the UI can ask the user.
export function parseGrams(quantity) {
  if (!quantity) return null
  const q = String(quantity).toLowerCase().replace(/,/g, '.')

  // Handle multipacks like "4 x 125 g" → 500 g.
  const multi = q.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)/)
  if (multi) {
    const count = parseFloat(multi[1])
    const each = toGrams(parseFloat(multi[2]), multi[3])
    if (each != null) return Math.round(count * each)
  }

  const single = q.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)\b/)
  if (single) return toGrams(parseFloat(single[1]), single[2])

  return null
}

// Treats 1 ml ≈ 1 g, which is close enough for yogurt/milk/drinks.
function toGrams(value, unit) {
  switch (unit) {
    case 'kg':
      return Math.round(value * 1000)
    case 'g':
      return Math.round(value)
    case 'l':
      return Math.round(value * 1000)
    case 'cl':
      return Math.round(value * 10)
    case 'ml':
      return Math.round(value)
    default:
      return null
  }
}

// Normalise the noisy nutriments object into the per-100g numbers we use.
// Prefers the per-100g value Open Food Facts computes; if that's missing but a
// per-serving value and a known serving size exist, derives per-100g ourselves
// (so products entered "per serving" still score correctly). Missing values
// come back as null so the UI can flag/ask.
export function normaliseNutriments(n = {}, servingQuantity = null) {
  const num = (v) => (v != null && Number.isFinite(+v) ? +v : null)
  const sq = num(servingQuantity) && +servingQuantity > 0 ? +servingQuantity : null
  const per100 = (...bases) => {
    for (const b of bases) {
      const direct = num(n[`${b}_100g`])
      if (direct != null) return direct
    }
    if (sq) {
      for (const b of bases) {
        const sv = num(n[`${b}_serving`])
        if (sv != null) return Math.round((sv * 100 / sq) * 100) / 100
      }
    }
    return null
  }
  return {
    proteins: per100('proteins'),
    energyKcal: per100('energy-kcal', 'energy'),
    carbs: per100('carbohydrates'),
    sugars: per100('sugars'),
    fiber: per100('fiber', 'fibre'),
    fat: per100('fat'),
    saturatedFat: per100('saturated-fat'),
    salt: per100('salt'),
  }
}

// Free-text product search — the fallback for when a barcode won't scan or a
// product simply isn't keyed by its barcode. Returns a short list of matches
// (UK-biased) as { code, name, brand, image }; the caller then loads the full
// product by code through fetchProduct. Keyless GET; best-effort, [] on any
// failure so the UI degrades to plain manual entry.
export async function searchByName(query, { signal, limit = 12 } = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(limit),
    fields: 'code,product_name,brands,image_front_small_url',
    // Surface UK-available products first without hard-excluding the rest.
    sort_by: 'popularity_key',
  })
  const url = `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const data = await res.json()
    const products = Array.isArray(data.products) ? data.products : []
    return products
      .map((p) => ({
        code: p.code || null,
        name: (p.product_name || '').trim(),
        brand: (p.brands || '').split(',')[0]?.trim() || '',
        image: p.image_front_small_url || null,
      }))
      .filter((p) => p.code && p.name)
  } catch {
    return []
  }
}

// Look up a scanned barcode. Returns a draft item, or null if not found.
export async function fetchProduct(barcode, { signal } = {}) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode
  )}.json?fields=${FIELDS}`

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`)
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null

  const p = data.product
  // Prefer the numeric product_quantity (g/ml) over regex-parsing the free-text
  // quantity string; fall back to parsing when it's absent.
  const numericQty =
    Number.isFinite(+p.product_quantity) && +p.product_quantity > 0
      ? Math.round(+p.product_quantity)
      : null

  return {
    barcode,
    name: p.product_name?.trim() || '',
    brand: p.brands?.split(',')[0]?.trim() || '',
    image: p.image_front_small_url || null,
    nutritionImage: p.image_nutrition_small_url || null,
    quantityText: p.quantity || p.serving_size || '',
    packGrams: numericQty ?? parseGrams(p.quantity) ?? parseGrams(p.serving_size),
    servingQuantity: Number.isFinite(+p.serving_quantity) ? +p.serving_quantity : null,
    nutritionDataPer: p.nutrition_data_per || null, // "100g" | "serving"
    isDairy: looksDairy(p.categories_tags),
    novaGroup: Number.isFinite(+p.nova_group) ? +p.nova_group : null,
    nutriscoreGrade: nutriscoreGrade(p),
    nutrientLevels: p.nutrient_levels || null,
    categoryTag: leafCategory(p.categories_tags),
    dietary: parseDietary(p.ingredients_analysis_tags),
    additivesCount: Number.isFinite(+p.additives_n) ? +p.additives_n : null,
    allergens: tagLabels(p.allergens_tags),
    traces: tagLabels(p.traces_tags),
    nutriments: normaliseNutriments(p.nutriments, p.serving_quantity),
  }
}
