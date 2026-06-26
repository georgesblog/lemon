import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import ItemForm from './components/ItemForm.jsx'
import Basket from './components/Basket.jsx'
import Compare from './components/Compare.jsx'
import Settings from './components/Settings.jsx'
import { fetchProduct } from './lib/openfoodfacts.js'
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

  // ── Scan → fetch → confirm ──────────────────────────────────────────────
  const onDetected = useCallback(
    async (barcode) => {
      setScanning(false)
      setBusy(true)
      try {
        const product = await fetchProduct(barcode)
        if (product) {
          setEditing({ ...product, id: null, price: null })
        } else {
          flash('Not in Open Food Facts — add it by hand')
          setEditing(blankDraft(barcode))
        }
      } catch {
        flash('Lookup failed — add it by hand')
        setEditing(blankDraft(barcode))
      } finally {
        setBusy(false)
      }
    },
    [flash]
  )

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
          onDetected={onDetected}
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
              <button className="btn primary" onClick={() => setScanning(true)}>
                📷 Scan item
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={() => setView('basket')}>← Basket</button>
              <button className="btn primary" onClick={() => setScanning(true)}>📷 Scan item</button>
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
    price: null,
    packGrams: null,
    isDairy: false,
    nutriments: { proteins: null, energyKcal: null, carbs: null, sugars: null, fat: null },
  }
}

function describePreset(preset) {
  return `${(PRESETS[preset] || PRESETS[DEFAULT_PRESET]).label} weighting`
}
