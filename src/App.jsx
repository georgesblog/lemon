import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import ItemForm from './components/ItemForm.jsx'
import Basket from './components/Basket.jsx'
import Compare from './components/Compare.jsx'
import Settings from './components/Settings.jsx'
import { fetchProduct } from './lib/openfoodfacts.js'
import { fetchPriceInfo } from './lib/openprices.js'
import { isRestrictedCirculation } from './lib/barcode.js'
import { PRESETS, DEFAULT_PRESET, DEFAULT_PROTEIN_TARGET } from './lib/scoring.js'
import { loadBasket, saveBasket, loadSettings, saveSettings, makeId } from './lib/storage.js'

// ZXing is ~300 kB — only pull it in when the user actually opens the scanner.
const Scanner = lazy(() => import('./components/Scanner.jsx'))

export default function App() {
  const [items, setItems] = useState(loadBasket)
  const [settings, setSettings] = useState(() => ({
    preset: DEFAULT_PRESET,
    proteinTarget: DEFAULT_PROTEIN_TARGET,
    ...loadSettings(),
  }))

  const [view, setView] = useState('basket') // basket | compare | settings
  const [scanning, setScanning] = useState(false)
  const [scanMode, setScanMode] = useState('single') // single | multi (rapid)
  const [editing, setEditing] = useState(null) // draft item being confirmed
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const weights = (PRESETS[settings.preset] || PRESETS[DEFAULT_PRESET]).weights

  // Persist on change.
  useEffect(() => saveBasket(items), [items])
  useEffect(() => saveSettings(settings), [settings])

  const flash = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800)
  }, [])

  const startScan = useCallback((m) => {
    setScanMode(m)
    setScanning(true)
  }, [])

  // ── Single scan → fetch → confirm (price prefilled) ──────────────────────
  const onDetected = useCallback(
    async (barcode) => {
      setScanning(false)
      setBusy(true)
      // Look up the community price in parallel with the product so the price
      // suggestion is already there when the confirm screen opens.
      const pricePromise = fetchPriceInfo(barcode).catch(() => null)
      try {
        const product = await fetchProduct(barcode)
        const priceInfo = await pricePromise
        if (product) {
          setEditing({ ...product, id: null, price: null, priceInfo })
        } else if (isRestrictedCirculation(barcode)) {
          // Store-internal / variable-weight barcode — never in Open Food Facts.
          flash('Looks like a store-internal barcode — add it by hand')
          setEditing({ ...blankDraft(barcode), priceInfo })
        } else {
          flash('Not in Open Food Facts — add it by hand')
          setEditing({ ...blankDraft(barcode), priceInfo })
        }
      } catch {
        const priceInfo = await pricePromise
        flash('Lookup failed — add it by hand')
        setEditing({ ...blankDraft(barcode), priceInfo })
      } finally {
        setBusy(false)
      }
    },
    [flash]
  )

  // ── Rapid multi-scan → add straight to the basket, price later ───────────
  const onDetectedMulti = useCallback(
    async (barcode) => {
      try {
        const product = await fetchProduct(barcode)
        const base = product || blankDraft(barcode)
        let added = false
        setItems((prev) => {
          if (prev.some((it) => it.barcode === barcode)) return prev
          added = true
          return [...prev, { ...base, id: makeId(), price: null }]
        })
        if (!added) flash('Already in basket')
        else flash(product ? `Added ${product.name || 'item'}` : 'Added — needs details')
      } catch {
        setItems((prev) =>
          prev.some((it) => it.barcode === barcode)
            ? prev
            : [...prev, { ...blankDraft(barcode), id: makeId() }]
        )
        flash('Added — lookup failed, add details later')
      }
    },
    [flash]
  )

  const setItemPrice = useCallback((id, price) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, price } : it)))
  }, [])

  const openManual = useCallback(() => {
    setScanning(false)
    setEditing(blankDraft(null))
  }, [])

  const saveItem = useCallback(
    (candidate) => {
      setItems((prev) => {
        if (candidate.id) {
          return prev.map((it) => (it.id === candidate.id ? { ...candidate } : it))
        }
        return [...prev, { ...candidate, id: makeId() }]
      })
      setEditing(null)
      flash(candidate.id ? 'Updated' : 'Added to basket')
    },
    [flash]
  )

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  if (scanning) {
    return (
      <Suspense fallback={<div className="toast">Starting camera…</div>}>
        <Scanner
          mode={scanMode}
          onDetected={scanMode === 'multi' ? onDetectedMulti : onDetected}
          onClose={() => setScanning(false)}
          onManual={openManual}
        />
      </Suspense>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo-dot" /> Basket Score</h1>
        <div className="row">
          {view !== 'settings' && (
            <button className="iconbtn" onClick={() => setView('settings')} aria-label="Settings">⚙</button>
          )}
        </div>
      </header>

      {!editing && view === 'basket' && (
        <nav className="subnav row" style={{ gap: 8 }}>
          <span className="pill">{describePreset(settings.preset)}</span>
        </nav>
      )}

      <main className="content">
        {editing ? (
          <ItemForm
            draft={editing}
            weights={weights}
            loading={busy}
            onSave={saveItem}
            onCancel={() => setEditing(null)}
          />
        ) : view === 'basket' ? (
          <Basket
            items={items}
            weights={weights}
            proteinTarget={settings.proteinTarget}
            onOpen={(item) => setEditing(item)}
            onRemove={removeItem}
            onSetPrice={setItemPrice}
          />
        ) : view === 'compare' ? (
          <Compare items={items} weights={weights} onClose={() => setView('basket')} />
        ) : (
          <Settings
            preset={settings.preset}
            proteinTarget={settings.proteinTarget}
            onChangePreset={(preset) => setSettings((s) => ({ ...s, preset }))}
            onChangeTarget={(proteinTarget) => setSettings((s) => ({ ...s, proteinTarget }))}
            onClose={() => setView('basket')}
          />
        )}
      </main>

      {/* Bottom action bar (hidden while editing or in settings, which carry their own) */}
      {!editing && (view === 'basket' || view === 'compare') && (
        <div className="actionbar">
          {view === 'basket' ? (
            <>
              <button
                className="btn ghost"
                onClick={() => setView('compare')}
                disabled={items.length < 2}
              >
                ⚖ Compare
              </button>
              <button className="btn ghost" onClick={() => startScan('multi')}>⚡ Rapid</button>
              <button className="btn primary" onClick={() => startScan('single')}>
                📷 Scan
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={() => setView('basket')}>← Basket</button>
              <button className="btn primary" onClick={() => startScan('single')}>📷 Scan item</button>
            </>
          )}
        </div>
      )}

      {busy && !editing && <div className="toast">Looking up product…</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function blankDraft(barcode) {
  return {
    id: null,
    barcode,
    name: '',
    brand: '',
    image: null,
    nutritionImage: null,
    price: null,
    packGrams: null,
    servingQuantity: null,
    nutritionDataPer: null,
    isDairy: false,
    novaGroup: null,
    nutriscoreGrade: null,
    nutrientLevels: null,
    categoryTag: null,
    dietary: { vegan: null, vegetarian: null, palmOil: null },
    additivesCount: null,
    allergens: [],
    traces: [],
    nutriments: {
      proteins: null, energyKcal: null, carbs: null, sugars: null,
      fiber: null, fat: null, saturatedFat: null,
    },
  }
}

function describePreset(preset) {
  return `${(PRESETS[preset] || PRESETS[DEFAULT_PRESET]).label} weighting`
}
