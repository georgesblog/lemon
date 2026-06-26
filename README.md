# Basket Score 🧺

**Scan → Price → Score.** A personal-use mobile web app (PWA) that scores your
grocery basket on *fitness value* — how much protein quality you get per pound.

Scan a barcode, confirm the nutrition, enter the price, and every item gets a
**Fitness Value Score out of 10**. Build a ranked basket, compare two products
head-to-head, and see what it costs per day to hit your protein target.

## How an item is scored

Each item is reduced to three metrics, then blended into one composite score:

| Metric | Measures | Better when |
|---|---|---|
| **£ per 100 g protein** | Core value | lower |
| **Protein-to-calorie ratio** | Lean quality | higher |
| **Sugar-to-carb ratio** | Carb quality | lower |

The composite is a **weighted blend** you can tune to your goal:

- **Balanced** — even mix of value and quality (default)
- **Cutting** — leans on protein-to-calorie (lean, filling items win)
- **Bulking** — leans on value (cheap protein/calories win)

The scoring engine lives in [`src/lib/scoring.js`](src/lib/scoring.js) and is
covered by unit tests in [`test/scoring.test.js`](test/scoring.test.js).

## Features

- 📷 **Barcode scanning** in the browser (ZXing) — no app store needed
- 🌐 **Open Food Facts** lookup (free, keyless) auto-fills nutrition + pack size
- ✏️ **Manual entry / correction** for anything the API gets wrong or is missing
- 🧺 **Ranked basket** with running totals (spend, protein, kcal, carbs, fat)
- 📅 **Cost per day** to hit your daily protein target from the current basket
- ⚖️ **Compare mode** — two products side-by-side with per-metric winners
- 💾 **Offline-friendly PWA** — installable, basket persists in local storage
- ⚙️ **Tunable weighting** via goal presets + protein target

No backend, no accounts, no database — everything lives on the device.

## Tech stack

- **React + Vite** PWA (`vite-plugin-pwa`)
- **@zxing/browser** for in-browser barcode decoding (lazy-loaded)
- **Open Food Facts API v2** for product data
- `localStorage` for persistence

## Develop

```bash
npm install
npm run dev      # start the dev server
npm test         # run the scoring-engine unit tests
npm run build    # production build → dist/
npm run preview  # serve the production build
```

> **Camera note:** browsers only grant camera access over **HTTPS** (or
> `localhost`). On a phone, run `npm run dev -- --host` and open the HTTPS URL,
> or deploy the `dist/` build to any static host. If the camera can't start you
> can always add items by hand.

### Icons

PWA icons are generated (no image deps) by:

```bash
node scripts/gen-icons.mjs
```

## Roadmap

Built: barcode scan → API → nutrition, price + scoring, ranked basket with
totals, composite algorithm, and side-by-side comparison.

Possible next steps: saved favourites / shop history, and an optional
Claude-powered plain-English "is this a good deal?" verdict per item.
