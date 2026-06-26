// Open Food Facts client. Free, keyless. We ask only for the fields we score on
// to keep responses small at the shop.

const FIELDS = [
  'product_name',
  'brands',
  'nutriments',
  'quantity',
  'serving_size',
  'image_front_small_url',
  'categories_tags',
].join(',')

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

// Normalise the noisy nutriments object into the handful of per-100g numbers we
// score on. Missing values come back as null so the UI can flag/ask.
function normaliseNutriments(n = {}) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (n[k] != null && Number.isFinite(+n[k])) return +n[k]
    }
    return null
  }
  return {
    proteins: pick('proteins_100g'),
    energyKcal: pick('energy-kcal_100g', 'energy_100g'),
    carbs: pick('carbohydrates_100g'),
    sugars: pick('sugars_100g'),
    fat: pick('fat_100g'),
    salt: pick('salt_100g'),
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
  return {
    barcode,
    name: p.product_name?.trim() || '',
    brand: p.brands?.split(',')[0]?.trim() || '',
    image: p.image_front_small_url || null,
    quantityText: p.quantity || p.serving_size || '',
    packGrams: parseGrams(p.quantity) ?? parseGrams(p.serving_size),
    isDairy: looksDairy(p.categories_tags),
    nutriments: normaliseNutriments(p.nutriments),
  }
}
