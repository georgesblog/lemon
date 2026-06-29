// Barcode normalisation, mirroring Open Food Facts' smooth-app
// (`_fixBarcodeIfNecessary` in continuous_scan_model.dart): strip separators,
// pad a 12-digit UPC-A up to a 13-digit EAN-13, and reject obvious junk. Doing
// this before we hit the Open Food Facts API turns several "not found" misses
// into hits, because OFF stores most UK groceries under the EAN-13 form.

export function normaliseBarcode(raw) {
  if (raw == null) return null
  let code = String(raw).replace(/[\s-]/g, '')
  if (code.length < 4) return null // too short to be a real product code
  // UPC-A (12 digits) is an EAN-13 with a leading zero. OFF keys on EAN-13.
  if (/^\d{12}$/.test(code)) code = `0${code}`
  return code
}

// EAN-13 check digit. Native BarcodeDetector and ZXing both validate this
// internally before returning, so this is a cheap belt-and-braces guard against
// a corrupted read slipping through (e.g. from a manually typed code). Returns
// true for anything that isn't a 13-digit numeric string, so it never blocks
// EAN-8 / Code-128 / etc.
export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return true
  const digits = code.split('').map(Number)
  const sum = digits
    .slice(0, 12)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  const check = (10 - (sum % 10)) % 10
  return check === digits[12]
}
