// Formatting + colour helpers shared across the UI.

export const gbp = (n) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

export const grams = (n) =>
  n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)}g`

export const kcal = (n) =>
  n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)} kcal`

export const one = (n) =>
  n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toString()

// Green → amber → red scale for a 0–10 score, used for badges and bars.
export function scoreColor(score) {
  if (score == null || !Number.isFinite(score)) return '#8c97a8'
  if (score >= 7) return '#5dd9a3'
  if (score >= 5) return '#9bd45d'
  if (score >= 3.5) return '#f0b25d'
  return '#f06d6d'
}
