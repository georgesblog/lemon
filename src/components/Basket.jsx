import { scoreItem, verdict, basketSummary } from '../lib/scoring.js'
import { gbp, grams, kcal, one } from '../lib/format.js'
import { ScoreBadge } from './Bits.jsx'

// The home view: a ranked list of scored items plus live basket totals.
export default function Basket({ items, weights, proteinTarget, onOpen, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Your basket is empty
        </div>
        <div>Scan an item to price it and start scoring.</div>
      </div>
    )
  }

  const summary = basketSummary(items, weights, proteinTarget)

  // Rank items best-first so the strongest buys float to the top.
  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, weights) }))
    .sort((a, b) => b.score.composite - a.score.composite)

  return (
    <div>
      <BasketSummary summary={summary} />
      <div className="muted small" style={{ margin: '4px 2px 8px' }}>
        {items.length} item{items.length === 1 ? '' : 's'} · best value first
      </div>
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

function ItemCard({ item, score, onOpen, onRemove }) {
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
        </div>
      </div>
      <button className="iconbtn" onClick={onRemove} aria-label="Remove item">✕</button>
    </div>
  )
}

function BasketSummary({ summary }) {
  const { totals, composite, costPerProteinDay, proteinTarget } = summary
  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div>
          <div className="muted small">Basket score</div>
          <div style={{ fontWeight: 700 }}>{verdict({ composite })}</div>
        </div>
        <ScoreBadge score={composite} size="lg" />
      </div>

      <div className="totals-grid">
        <div className="spread"><span className="k">Total spend</span><span className="v">{gbp(totals.price)}</span></div>
        <div className="spread"><span className="k">Protein</span><span className="v">{grams(totals.protein)}</span></div>
        <div className="spread"><span className="k">Energy</span><span className="v">{kcal(totals.kcal)}</span></div>
        <div className="spread"><span className="k">Carbs</span><span className="v">{grams(totals.carbs)}</span></div>
        <div className="spread"><span className="k">Sugars</span><span className="v">{grams(totals.sugars)}</span></div>
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
