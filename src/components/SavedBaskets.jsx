import { useEffect, useState, useCallback } from 'react'
import { isCloudEnabled } from '../lib/supabase.js'
import { listSaved, createSaved, renameSaved, deleteSaved, loadSavedItems } from '../lib/baskets.js'

// Saved baskets view: save the current basket (as a one-off snapshot or a
// reusable template), then reload, rename or delete any saved one. Cloud when
// signed in, on-device otherwise — the data layer decides; this UI is the same
// either way.
export default function SavedBaskets({ currentItems, onLoad, onClose, flash }) {
  const [list, setList] = useState(null) // null while loading
  const [error, setError] = useState(false)
  const [name, setName] = useState('')
  const [asTemplate, setAsTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState(null) // { id, value }
  const cloud = isCloudEnabled()

  const refresh = useCallback(async () => {
    setError(false)
    try {
      setList(await listSaved())
    } catch {
      setList([])
      setError(true)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const hasItems = currentItems.length > 0
  const canSave = hasItems && name.trim() && !saving

  const doSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await createSaved({ name: name.trim(), isTemplate: asTemplate, items: currentItems })
      setName('')
      setAsTemplate(false)
      flash(asTemplate ? 'Template saved' : 'Basket saved')
      await refresh()
    } catch {
      flash('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  const doLoad = async (b, newShop) => {
    if (
      hasItems &&
      !confirm(
        `Replace your current basket (${currentItems.length} item${currentItems.length === 1 ? '' : 's'}) with “${b.name}”?`
      )
    ) return
    try {
      let items = await loadSavedItems(b.id)
      // A "new shop" from a template keeps the products but clears prices so the
      // Needs-price tray walks you through re-pricing at the till.
      if (newShop) items = items.map((it) => ({ ...it, price: null }))
      onLoad(items)
      flash(newShop ? `Started a shop from “${b.name}”` : `Loaded “${b.name}”`)
    } catch {
      flash('Could not open that basket')
    }
  }

  const doDelete = async (b) => {
    if (!confirm(`Delete “${b.name}”? This can’t be undone.`)) return
    try {
      await deleteSaved(b.id)
      await refresh()
    } catch {
      flash('Delete failed')
    }
  }

  const commitRename = async (b) => {
    const value = renaming.value.trim()
    setRenaming(null)
    if (!value || value === b.name) return
    try {
      await renameSaved(b.id, value)
      await refresh()
    } catch {
      flash('Rename failed')
    }
  }

  return (
    <div>
      <div className="field">
        <label>Save current basket</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={hasItems ? 'Name this basket' : 'Basket is empty'}
            disabled={!hasItems}
            onKeyDown={(e) => { if (e.key === 'Enter') doSave() }}
          />
          <button className="btn primary" onClick={doSave} disabled={!canSave}>
            {saving ? '…' : 'Save'}
          </button>
        </div>
        <label className="checkrow" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={asTemplate}
            disabled={!hasItems}
            onChange={(e) => setAsTemplate(e.target.checked)}
          />
          <span>Save as a reusable template — start future shops from it</span>
        </label>
        <div className="muted small" style={{ marginTop: 8 }}>
          {cloud ? '☁ Synced across your devices' : '📱 Saved on this device'}
        </div>
      </div>

      <div className="sep" />

      {list == null ? (
        <div className="muted small" style={{ padding: 8 }}>Loading…</div>
      ) : error ? (
        <div className="empty">
          <div className="big">⚠️</div>
          <div>Couldn’t load your saved baskets.</div>
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={refresh}>Retry</button>
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="big">🗂️</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No saved baskets yet</div>
          <div>Save the basket above to reuse or compare it later.</div>
        </div>
      ) : (
        list.map((b) => (
          <div className="card" key={b.id}>
            {renaming?.id === b.id ? (
              <div className="row" style={{ gap: 8 }}>
                <input
                  autoFocus
                  style={{ flex: 1, minWidth: 0 }}
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: b.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(b)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
                <button className="btn primary" onClick={() => commitRename(b)}>Save</button>
              </div>
            ) : (
              <>
                <div className="spread">
                  <div style={{ minWidth: 0 }}>
                    <div className="name" style={{ fontWeight: 700 }}>
                      {b.name}
                      {b.isTemplate && <span className="pill" style={{ marginLeft: 8 }}>template</span>}
                    </div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      {b.itemCount} item{b.itemCount === 1 ? '' : 's'}
                      {b.store ? ` · 🏬 ${b.store}` : ''}
                      {b.updatedAt ? ` · ${since(b.updatedAt)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn ghost" onClick={() => doLoad(b, b.isTemplate)}>
                    {b.isTemplate ? '🛒 New shop' : '↺ Load'}
                  </button>
                  {b.isTemplate && (
                    <button className="btn ghost" onClick={() => doLoad(b, false)}>Open as-is</button>
                  )}
                  <button className="iconbtn" aria-label="Rename" onClick={() => setRenaming({ id: b.id, value: b.name })}>✎</button>
                  <button className="iconbtn" aria-label="Delete" onClick={() => doDelete(b)}>🗑</button>
                </div>
              </>
            )}
          </div>
        ))
      )}

      <div className="actionbar">
        <button className="btn primary block" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

// Compact relative time ("just now", "3h ago", "12 Jun 2026").
function since(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)}d ago`
  return new Date(iso).toLocaleDateString()
}
