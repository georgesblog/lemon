import { useEffect, useRef, useState } from 'react'
import { scoreItem, verdict, basketSummary, needsPrice, nutritionConfidence, proteinPortion } from '../lib/scoring.js'
import { fetchPriceInfo } from '../lib/openprices.js'
import { BUCKETS, SORTS, bucketMeta, bucketOf, groupByBucket, sortEntries } from '../lib/buckets.js'
import { gbp, grams, kcal } from '../lib/format.js'
import { ScoreBadge, NutriScore, NovaBadge, DietaryBadges, ProteinBadge } from './Bits.jsx'
import { ShareBar } from './Share.jsx'

// The home view: a "needs price" tray for freshly-scanned items, then the priced
// items grouped by where they live (ready / fridge / pantry), each shelf sorted
// on its own axis, plus live basket totals.
export default function Basket({ items, weights, proteinTarget, onOpen, onRemove, onSetPrice, onSetBucket, onSearch }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Your basket is empty
        </div>
        <div>Scan an item to price it and start scoring.</div>
        {onSearch && (
          <button className="btn ghost" style={{ marginTop: 16 }} onClick={onSearch}>
            🔎 Search by name instead
          </button>
        )}
      </div>
    )
  }

  const needs = items.filter(needsPrice)
  const priced = items.filter((it) => !needsPrice(it))
  const summary = basketSummary(priced, weights, proteinTarget)

  // Score once here; the buckets reorder these entries, they never re-score.
  const entries = priced.map((item) => ({ item, score: scoreItem(item, weights) }))
  const groups = groupByBucket(priced)

  return (
    <div>
      <NeedsPriceTray items={needs} onSetPrice={onSetPrice} onOpen={onOpen} onRemove={onRemove} onSetBucket={onSetBucket} />

      {priced.length > 0 && <BasketSummary summary={summary} />}
      {priced.length > 0 && <ShareBar items={priced} weights={weights} />}
      {groups.map((g) => (
        <BucketGroup
          key={g.id}
          bucket={g}
          entries={entries.filter((e) => bucketOf(e.item) === g.id)}
          onOpen={onOpen}
          onRemove={onRemove}
          onSetBucket={onSetBucket}
        />
      ))}
    </div>
  )
}

// One collapsible shelf: a header with a mini-summary (count · spend · best
// pick) and its own sort, over the priced items that live in this bucket.
function BucketGroup({ bucket, entries, onOpen, onRemove, onSetBucket }) {
  const [open, setOpen] = useState(true)
  const [sort, setSort] = useState('value')
  if (entries.length === 0) return null

  const sorted = sortEntries(entries, sort)
  const spend = entries.reduce((s, e) => s + (Number(e.item.price) || 0), 0)
  const best = entries.reduce((a, b) => (b.score.composite > a.score.composite ? b : a))

  return (
    <div className="bucket">
      <div className="bucket-head">
        <button
          type="button"
          className="bucket-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className={`caret${open ? ' open' : ''}`}>▸</span>
          <span className="bucket-emoji">{bucket.emoji}</span>
          <span className="bucket-title">{bucket.label}</span>
          <span className="pill">{entries.length}</span>
        </button>
        <label className="bucket-sort">
          <span className="sr-only">Sort {bucket.label}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="bucket-summary muted small">
        {gbp(spend)} spend · best: {best.item.name || 'Unnamed'} ({best.score.composite.toFixed(1)})
      </div>

      {open &&
        sorted.map(({ item, score }) => (
          <ItemCard
            key={item.id}
            item={item}
            score={score}
            onOpen={() => onOpen(item)}
            onRemove={() => onRemove(item.id)}
            onSetBucket={onSetBucket}
          />
        ))}
    </div>
  )
}

// Quick-entry list for items scanned without a price yet, grouped by bucket so
// the "pick up milk / grab a bar" mental model holds even before pricing. Each
// row offers an inline £ box and, where Open Prices has data, a one-tap average.
function NeedsPriceTray({ items, onSetPrice, onOpen, onRemove, onSetBucket }) {
  if (items.length === 0) return null
  const groups = groupByBucket(items)
  return (
    <div className="card needs-price">
      <div className="spread" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 700 }}>Needs price</span>
        <span className="pill">{items.length}</span>
      </div>
      {groups.map((g) => (
        <div key={g.id}>
          {groups.length > 1 && (
            <div className="needs-bucket-label muted small">
              {g.emoji} {g.label} · {g.items.length}
            </div>
          )}
          {g.items.map((item) => (
            <PriceRow
              key={item.id}
              item={item}
              onSetPrice={onSetPrice}
              onOpen={() => onOpen(item)}
              onRemove={() => onRemove(item.id)}
              onSetBucket={onSetBucket}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PriceRow({ item, onSetPrice, onOpen, onRemove, onSetBucket }) {
  const [val, setVal] = useState('')
  const [info, setInfo] = useState(null)
  const rowRef = useRef(null)

  // Lazily look up the community price only once the row is actually on screen.
  // With a 50-item basket, fetching every row on mount fired a burst of ~50
  // requests at Open Prices; an IntersectionObserver defers each to when it
  // scrolls into view (and we fetch at most once per barcode).
  useEffect(() => {
    if (!item.barcode) return
    const el = rowRef.current
    const ctrl = new AbortController()
    let done = false
    const load = () => {
      if (done) return
      done = true
      fetchPriceInfo(item.barcode, { signal: ctrl.signal })
        .then((i) => setInfo(i))
        .catch(() => {})
    }
    if (!el || typeof IntersectionObserver === 'undefined') {
      load() // no observer support — fall back to eager fetch
      return () => ctrl.abort()
    }
    const obs = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) {
          load()
          obs.disconnect()
        }
      },
      { rootMargin: '200px' } // start a touch before it's visible
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      ctrl.abort()
    }
  }, [item.barcode])

  const commit = (v) => {
    const p = parseFloat(v)
    if (Number.isFinite(p) && p > 0) onSetPrice(item.id, p)
  }

  return (
    <div className="price-row" ref={rowRef}>
      <div className="price-row-main">
        <div className="small" style={{ fontWeight: 600, cursor: 'pointer' }} onClick={onOpen}>
          {item.name || 'Unnamed item — tap to edit'}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {onSetBucket && <BucketSelect item={item} onSetBucket={onSetBucket} />}
          {info && info.count > 0 && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => { const v = info.avg.toFixed(2); setVal(v); commit(v) }}
            >
              avg {gbp(info.avg)} · use
            </button>
          )}
        </div>
      </div>
      <div className="with-prefix price-row-input">
        <span className="prefix">£</span>
        <input
          type="number" inputMode="decimal" step="0.01" min="0"
          value={val} placeholder="0.00"
          onChange={(e) => setVal(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(e.target.value) }}
        />
      </div>
      <button className="iconbtn" onClick={onRemove} aria-label="Remove item">✕</button>
    </div>
  )
}

function ItemCard({ item, score, onOpen, onRemove, onSetBucket }) {
  const confidence = nutritionConfidence(item)
  const portion = proteinPortion(item)
  return (
    <div className="card item-card">
      <Thumb item={item} score={score} />
      <div className="item-main" onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div className="name">{item.name || 'Unnamed item'}</div>
        <div className="muted small">
          {item.brand ? `${item.brand} · ` : ''}
          {gbp(item.price)} · {grams(item.packGrams)}
        </div>
        <div className="small" style={{ marginTop: 2 }}>
          {score.costPer100gProtein != null
            ? `${gbp(score.costPer100gProtein)} / 100g protein`
            : 'No protein value'}
          {confidence.level !== 'ok' && (
            <span className="muted" title="Some nutrition data was missing or estimated — tap to check">
              {' · '}{confidence.level === 'low' ? '⚠️ estimated' : 'ℹ️ estimated'}
            </span>
          )}
        </div>
        {(portion || item.nutriscoreGrade || item.novaGroup || item.additivesCount != null) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <ProteinBadge portion={portion} />
            <NutriScore grade={item.nutriscoreGrade} />
            <NovaBadge group={item.novaGroup} />
            <DietaryBadges dietary={item.dietary} additivesCount={item.additivesCount} />
          </div>
        )}
      </div>
      <div className="item-aside">
        <ScoreBadge score={score.composite} />
        {onSetBucket && <BucketSelect item={item} onSetBucket={onSetBucket} />}
        <button className="iconbtn sm" onClick={onRemove} aria-label="Remove item">✕</button>
      </div>
    </div>
  )
}

// Product thumbnail — makes the list skimmable at a glance. Falls back to the
// bucket's placeholder tile when there's no image, or when the image fails to
// load (offline / broken URL), so the row never shows a blank box.
function Thumb({ item, score }) {
  const [broken, setBroken] = useState(false)
  const meta = bucketMeta(bucketOf(item))
  if (item.image && !broken) {
    return (
      <img
        className="item-thumb"
        src={item.image}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <div className="item-thumb placeholder" aria-hidden="true" title={meta.label}>
      {meta.emoji}
    </div>
  )
}

// One-tap re-bucket. A native select keeps it accessible and compact; the
// current bucket (explicit or auto-classified) is always the selected value.
function BucketSelect({ item, onSetBucket }) {
  const current = bucketOf(item)
  return (
    <label className="bucket-select" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Move {item.name || 'item'} to a different shelf</span>
      <select
        value={current}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSetBucket(item.id, e.target.value)}
      >
        {BUCKETS.map((b) => (
          <option key={b.id} value={b.id}>{b.emoji} {b.label}</option>
        ))}
      </select>
    </label>
  )
}

function BasketSummary({ summary }) {
  const { totals, composite, costPerProteinDay, proteinDays, proteinTarget } = summary
  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div>
          <div className="muted small">Basket score</div>
          <div style={{ fontWeight: 700 }}>{verdict({ composite })}</div>
        </div>
        <ScoreBadge score={composite} size="lg" />
      </div>

      <ProteinGoal proteinDays={proteinDays} proteinTarget={proteinTarget} />

      <div className="totals-grid">
        <div className="spread"><span className="k">Total spend</span><span className="v">{gbp(totals.price)}</span></div>
        <div className="spread"><span className="k">Protein</span><span className="v">{grams(totals.protein)}</span></div>
        <div className="spread"><span className="k">Energy</span><span className="v">{kcal(totals.kcal)}</span></div>
        <div className="spread"><span className="k">Carbs</span><span className="v">{grams(totals.carbs)}</span></div>
        <div className="spread"><span className="k">Sugars</span><span className="v">{grams(totals.sugars)}</span></div>
        <div className="spread"><span className="k">Fibre</span><span className="v">{grams(totals.fiber)}</span></div>
        <div className="spread"><span className="k">Fat</span><span className="v">{grams(totals.fat)}</span></div>
      </div>

      <div className="sep" />
      <div className="spread small">
        <span className="muted">Cost / day for {proteinTarget}g protein</span>
        <span style={{ fontWeight: 700 }}>
          {costPerProteinDay != null ? gbp(costPerProteinDay) : '—'}
        </span>
      </div>
    </div>
  )
}

// Personal progress meter — how many days of your protein target this basket's
// protein covers. Progress feedback toward your own goal, no leaderboard. The
// bar fills over one day; beyond that it reads "N.N days".
function ProteinGoal({ proteinDays, proteinTarget }) {
  if (proteinDays == null || proteinDays <= 0) return null
  const pct = Math.max(0, Math.min(100, proteinDays * 100))
  const label =
    proteinDays >= 1
      ? `${proteinDays.toFixed(1)} days of protein`
      : `${Math.round(proteinDays * 100)}% of a day’s protein`
  return (
    <div className="metric" style={{ marginBottom: 12 }}>
      <div className="spread small" style={{ marginBottom: 4 }}>
        <span className="muted">Protein goal · {proteinTarget}g/day</span>
        <span style={{ fontWeight: 700 }}>{label}</span>
      </div>
      <div className="bar">
        <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  )
}
