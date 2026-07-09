import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import ItemForm from './components/ItemForm.jsx'
import Basket from './components/Basket.jsx'
import Compare from './components/Compare.jsx'
import Settings from './components/Settings.jsx'
import SavedBaskets from './components/SavedBaskets.jsx'
import CatalogCompare from './components/CatalogCompare.jsx'
import ProductSearch from './components/ProductSearch.jsx'
import Onboarding from './components/Onboarding.jsx'
import { SharedBoardView } from './components/Share.jsx'
import { parseShareHash } from './lib/share.js'
import { fetchProduct } from './lib/openfoodfacts.js'
import { fetchPriceInfo } from './lib/openprices.js'
import { isRestrictedCirculation } from './lib/barcode.js'
import { PRESETS, DEFAULT_PRESET, DEFAULT_PROTEIN_TARGET } from './lib/scoring.js'
import { classifyBucket } from './lib/buckets.js'
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

  // A shared-link route (…/#/s/<token>) short-circuits the whole app into a
  // read-only viewer. Tracked here and kept in sync with the browser hash.
  const [shareToken, setShareToken] = useState(() =>
    typeof window !== 'undefined' ? parseShareHash(window.location.hash) : null
  )

  const [view, setView] = useState('basket') // basket | compare | settings | saved | catalog
  const [scanning, setScanning] = useState(false)
  const [searching, setSearching] = useState(false) // search-by-name fallback
  const [scanMode, setScanMode] = useState('single') // single | multi (rapid)
  const [editing, setEditing] = useState(null) // draft item being confirmed
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const weights = (PRESETS[settings.preset] || PRESETS[DEFAULT_PRESET]).weights

  // A synchronous mirror of `items` so rapid multi-scan can de-dupe against the
  // current basket immediately, without waiting for a re-render.
  const itemsRef = useRef(items)

  // Persist on change.
  useEffect(() => {
    itemsRef.current = items
    saveBasket(items)
  }, [items])
  useEffect(() => saveSettings(settings), [settings])

  // Follow back/forward and in-app changes to the share route.
  useEffect(() => {
    const onHash = () => setShareToken(parseShareHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const flash = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800)
  }, [])

  const startScan = useCallback((m) => {
    setScanMode(m)
    setScanning(true)
  }, [])

  const startSearch = useCallback(() => {
    setScanning(false)
    setSearching(true)
  }, [])

  // ── Single scan → fetch → confirm (price prefilled) ──────────────────────
  const onDetected = useCallback(
    async (barcode) => {
      setScanning(false)
      setSearching(false)
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
      // Never add the same barcode twice.
      if (itemsRef.current.some((it) => it.barcode === barcode)) {
        flash('Already scanned — skipped')
        return
      }
      try {
        const product = await fetchProduct(barcode)
        // Re-check after the lookup in case it was added meanwhile.
        if (itemsRef.current.some((it) => it.barcode === barcode)) return
        const item = stampBucket({ ...(product || blankDraft(barcode)), id: makeId(), price: null })
        itemsRef.current = [...itemsRef.current, item] // keep the mirror current now
        setItems((prev) => [...prev, item])
        flash(product ? `Added ${product.name || 'item'}` : 'Added — needs details')
      } catch {
        const item = stampBucket({ ...blankDraft(barcode), id: makeId() })
        itemsRef.current = [...itemsRef.current, item]
        setItems((prev) => [...prev, item])
        flash('Added — lookup failed, add details later')
      }
    },
    [flash]
  )

  const setItemPrice = useCallback((id, price) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, price } : it)))
  }, [])

  // One-tap re-bucket from the basket; the explicit choice sticks on the item
  // and round-trips through saved baskets.
  const setItemBucket = useCallback((id, bucket) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, bucket } : it)))
  }, [])

  const openManual = useCallback(() => {
    setScanning(false)
    setSearching(false)
    setEditing(blankDraft(null))
  }, [])

  const finishOnboarding = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const saveItem = useCallback(
    (candidate) => {
      setItems((prev) => {
        if (candidate.id) {
          return prev.map((it) => (it.id === candidate.id ? { ...candidate } : it))
        }
        return [...prev, stampBucket({ ...candidate, id: makeId() })]
      })
      setEditing(null)
      flash(candidate.id ? 'Updated' : 'Added to basket')
    },
    [flash]
  )

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  // Replace the working basket with a saved/template basket, then return home.
  const loadSaved = useCallback((newItems) => {
    setItems(newItems)
    setEditing(null)
    setSearching(false)
    setView('basket')
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  // A shared link wins over everything: it's a public, read-only route that must
  // render for anyone with the token, regardless of local basket or onboarding.
  if (shareToken) {
    return (
      <SharedBoardView
        token={shareToken}
        onExit={() => { window.location.hash = ''; setShareToken(null) }}
      />
    )
  }

  // First run: a ≤30s, skippable goal setup before the empty basket. Never
  // interrupts an existing user (guarded on an empty basket).
  if (!settings.onboarded && items.length === 0 && !editing) {
    return <Onboarding onDone={finishOnboarding} />
  }

  if (scanning) {
    return (
      <Suspense fallback={<div className="toast">Starting camera…</div>}>
        <Scanner
          mode={scanMode}
          onDetected={scanMode === 'multi' ? onDetectedMulti : onDetected}
          onClose={() => setScanning(false)}
          onManual={openManual}
          onSearch={scanMode === 'multi' ? undefined : startSearch}
        />
      </Suspense>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo-dot" /> Basket Score</h1>
        <div className="row">
          {!editing && !searching && view !== 'settings' && view !== 'saved' && view !== 'catalog' && (
            <button className="iconbtn" onClick={() => setView('saved')} aria-label="Saved baskets">🗂</button>
          )}
          {!editing && !searching && view !== 'settings' && view !== 'saved' && view !== 'catalog' && (
            <button className="iconbtn" onClick={() => setView('catalog')} aria-label="Best picks">🥪</button>
          )}
          {view !== 'settings' && (
            <button className="iconbtn" onClick={() => setView('settings')} aria-label="Settings">⚙</button>
          )}
        </div>
      </header>

      {!editing && !searching && view === 'basket' && (
        <nav className="subnav row" style={{ gap: 8 }}>
          <span className="pill">{describePreset(settings.preset)}</span>
          {settings.store && <span className="pill">🏬 {settings.store}</span>}
        </nav>
      )}

      <main className="content">
        {searching ? (
          <ProductSearch
            onPick={onDetected}
            onManual={openManual}
            onClose={() => setSearching(false)}
          />
        ) : editing ? (
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
            onSetBucket={setItemBucket}
            onSearch={startSearch}
          />
        ) : view === 'compare' ? (
          <Compare items={items} weights={weights} onClose={() => setView('basket')} />
        ) : view === 'saved' ? (
          <SavedBaskets
            currentItems={items}
            onLoad={loadSaved}
            onClose={() => setView('basket')}
            flash={flash}
          />
        ) : view === 'catalog' ? (
          <CatalogCompare onClose={() => setView('basket')} />
        ) : (
          <Settings
            preset={settings.preset}
            proteinTarget={settings.proteinTarget}
            store={settings.store}
            onChangePreset={(preset) => setSettings((s) => ({ ...s, preset }))}
            onChangeTarget={(proteinTarget) => setSettings((s) => ({ ...s, proteinTarget }))}
            onChangeStore={(store) => setSettings((s) => ({ ...s, store: store.trim() || null }))}
            onClose={() => setView('basket')}
          />
        )}
      </main>

      {/* Bottom action bar (hidden while editing/searching or in settings, which carry their own) */}
      {!editing && !searching && (view === 'basket' || view === 'compare') && (
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

// Give an item its shelf on the way into the basket (unless it already carries
// one, e.g. loaded from a saved basket), so grouping is instant and the guess
// persists. bucketOf still classifies lazily for any older item without it.
function stampBucket(item) {
  return item.bucket ? item : { ...item, bucket: classifyBucket(item) }
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
