import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseBarcode, isValidEan13, isRestrictedCirculation } from '../src/lib/barcode.js'

test('normaliseBarcode strips separators and whitespace', () => {
  assert.equal(normaliseBarcode('  5012345 67890-5 '), '5012345678905')
})

test('normaliseBarcode pads a 12-digit UPC-A to a 13-digit EAN-13', () => {
  // smooth-app's _fixBarcodeIfNecessary: UPC-A is EAN-13 with a leading zero.
  assert.equal(normaliseBarcode('012345678905'), '0012345678905')
  assert.equal(normaliseBarcode('123456789012'), '0123456789012')
})

test('normaliseBarcode leaves a real EAN-13 untouched', () => {
  assert.equal(normaliseBarcode('5000159484695'), '5000159484695')
})

test('normaliseBarcode rejects junk that is too short', () => {
  assert.equal(normaliseBarcode(''), null)
  assert.equal(normaliseBarcode('12'), null)
  assert.equal(normaliseBarcode(null), null)
  assert.equal(normaliseBarcode(undefined), null)
})

test('isValidEan13 accepts a valid check digit and rejects a bad one', () => {
  assert.equal(isValidEan13('5000159484695'), true) // genuine check digit
  assert.equal(isValidEan13('5000159484690'), false) // last digit corrupted
})

test('isValidEan13 passes through non-EAN-13 codes (EAN-8, Code-128, etc.)', () => {
  assert.equal(isValidEan13('20886616'), true) // 8-digit, not validated here
  assert.equal(isValidEan13('ABC128CODE'), true) // alphanumeric Code-128
})

test('isRestrictedCirculation flags store-internal / variable-weight barcodes', () => {
  // GS1 prefix 2 (200–299) and 020–029 / 040–049 are in-store, never in OFF.
  assert.equal(isRestrictedCirculation('2012345678905'), true)
  assert.equal(isRestrictedCirculation('0212345678901'), true)
  assert.equal(isRestrictedCirculation('0412345678907'), true)
  assert.equal(isRestrictedCirculation('20123456'), true) // EAN-8 internal
  // Real global retail codes are not restricted.
  assert.equal(isRestrictedCirculation('5000159484695'), false) // UK product
  assert.equal(isRestrictedCirculation('0036000291455'), false) // padded UPC-A
  assert.equal(isRestrictedCirculation(null), false)
})
