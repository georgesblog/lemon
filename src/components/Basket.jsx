import { useEffect, useState } from 'react'
import { scoreItem, verdict, basketSummary, needsPrice, nutritionConfidence } from '../lib/scoring.js'
import { fetchPriceInfo } from '../lib/openprices.js'
import { gbp, grams, kcal } from '../lib/format.js'
import { ScoreBadge, NutriScore, NovaBadge, DietaryBadges } from './Bits.jsx'

// The home view: a "needs price" tray for freshly-scanned items, then a ranked
// list of priced items plus live basket totals.
export default function Basket({ items, weights, proteinTarget, onOpen, onRemove, onSetPrice, onSearch }) {
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

  // Rank priced items best-first so the strongest buys float to the top.
  const ranked = priced
    .map((item) => ({ item, score: scoreItem(item, weights) }))
    .sort((a, b) => b.score.composite - a.score.composite)

  return (
    <div>
      <NeedsPriceTray items={needs} onSetPrice={onSetPrice} onOpen={onOpen} onRemove={onRemove} />

      {priced.length > 0 && <BasketSummary summary={summary} />}
      {priced.length > 0 && (
        <div className="muted small" style={{ margin: '4px 2px 8px' }}>
          {priced.length} priced item{priced.length === 1 ? '' : 's'} · best value first
        </div>
      )}
      {ranked.map(({ item, score }) => (
        <ItemCard
          key={item.id}
          item={item}
          score={score}
          onOpen={() => onOpen(item)}
          onRemove={() => onRemove(item.id)}
        />
      ))}
    </div>
  )
}

// Quick-entry list for items scanned without a price yet. Each row offers an
// inline £ box and, where Open Prices has data, a one-tap community average.
function NeedsPriceTray({ items, onSetPrice, onOpen, onRemove }) {
  if (items.length === 0) return null
  return (
    <div className="card needs-price">
      <div className="spread" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 700 }}>Needs price</span>
        <span className="pill">{items.length}</span>
      </div>
      {items.map((item) => (
        <PriceRow
          key={item.id}
          item={item}
          onSetPrice={onSetPrice}
          onOpen={() => onOpen(item)}
          onRemove={() => onRemove(item.id)}
        />
      ))}
    </div>
  )
}

function PriceRow({ item, onSetPrice, onOpen, onRemove }) {
  const [val, setVal] = useState('')
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!item.barcode) return
    const ctrl = new AbortController()
    fetchPriceInfo(item.barcode, { signal: ctrl.signal })
      .then((i) => setInfo(i))
      .catch(() => {})
    return () => ctrl.abort()
  }, [item.barcode])

  const commit = (v) => {
    const p = parseFloat(v)
    if (Number.isFinite(p) && p > 0) onSetPrice(item.id, p)
  }

  return (
    <div className="price-row">
      <div className="price-row-main">
        <div className="small" style={{ fontWeight: 600, cursor: 'pointer' }} onClick={onOpen}>
          {item.name || 'Unnamed item — tap to edit'}
        </div>
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

function ItemCard({ item, score, onOpen, onRemove }) {
  const confidence = nutritionConfidence(item)
  return (
    <div className="card item-card">
      <ScoreBadge score={score.composite} />
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
        {(item.nutriscoreGrade || item.novaGroup || item.additivesCount != null) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <NutriScore grade={item.nutriscoreGrade} />
            <NovaBadge group={item.novaGroup} />
            <DietaryBadges dietary={item.dietary} additivesCount={item.additivesCount} />
          </div>
        )}
      </div>
      <button className="iconbtn" onClick={onRemove} aria-label="Remove item">✕</button>
    </div>
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
