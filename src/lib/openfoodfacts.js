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
  'nutriscore_grade', // a–e health grade
  'nutrient_levels', // low/moderate/high for fat, sat-fat, sugars, salt
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
    nutriscoreGrade: p.nutriscore_grade ? String(p.nutriscore_grade).toUpperCase() : null,
    nutrientLevels: p.nutrient_levels || null,
    nutriments: normaliseNutriments(p.nutriments, p.serving_quantity),
  }
}
