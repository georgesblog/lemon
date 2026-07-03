# Changelog

All notable changes to Basket Score are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **"Better pick" on every scan** — the confirm screen now automatically surfaces
  higher-protein alternatives in the same Open Food Facts category (UK) the moment
  it opens, instead of hiding them behind a button. If the item you scanned is
  already near the top of its category it says so; otherwise it lists the stronger
  options (protein per 100g, and protein per 100 kcal where known). Best-effort —
  it loads quietly and hides entirely if the category search returns nothing.
- **Search by name** — when a barcode won't scan or a product isn't keyed by its
  barcode, search Open Food Facts by name instead. Reachable from the scanner
  ("Search by name"), the empty basket, and manual entry; pick a result and it
  flows into the same confirm-and-price screen as a scan.
- **Protein goal progress** in the basket — a meter showing how many days of your
  protein target the basket now covers ("1.4 days of protein at 150g/day"),
  turning the shop into visible progress toward your own goal.
- **Score trust signals** — the confirm screen flags when a score rests on
  incomplete data (missing protein/calories/pack size, or figures converted from
  a per-serving label) so you know when to double-check, and priced basket items
  carry a small "estimated" marker when their nutrition was partial.
- **30-second first run** — a skippable setup on first launch (goal, protein
  target, usual store) drops you straight into scanning, with no account. The
  usual store is remembered and shown, and everything stays on the device.
- **Rapid multi-scan mode** (⚡ Rapid) — scan many items in a row without
  stopping; each is added to the basket from its Open Food Facts data the moment
  it's read, the camera stays open, and a counter tracks the haul. Built for
  banking a shelf of items fast and pricing them afterwards.
- **"Needs price" tray** at the top of the basket — items scanned without a
  price gather here with an inline £ box (and a one-tap community average from
  Open Prices where available). Enter a price and the item drops into the ranked
  list. The basket score and totals are computed from priced items only.
- **Built-in number pad for the price** — opens automatically on a fresh scan so
  you can start typing the price with zero taps. iOS won't raise its own keyboard
  after a camera scan (it needs a user tap), so an in-app pad is the only way to
  make pricing truly tap-free; it also caps at two decimals and works one-handed.

### Changed
- A single scan now **looks up the Open Prices community price in parallel** with
  the product lookup, so the price suggestion is showing the instant the confirm
  screen opens.

### Fixed
- **Rapid multi-scan duplicate handling.** A stale-closure bug made every rapid
  add flash "Already in basket" even for new items; de-duplication now uses a
  synchronous basket check so the same barcode is reliably skipped. The scanner
  also shows a clear **"✓ Added" / "Already scanned"** banner (with distinct
  haptics) so each scan visibly registers instead of being silently ignored.

## [0.3.0] - 2026-06-29

### Added
- **Open Prices integration** — on scan, look up crowd-sourced prices for the
  barcode (scoped to GBP) and show the typical price with a one-tap "use
  average", plus an "is this a good price?" verdict (Cheapest seen / Below
  average / Typical / Above average / Pricey) once you enter a price. Best-effort
  and hidden when there's no data.
- **"Best protein in this category"** — an on-demand lookup (Open Food Facts
  search) listing the highest-protein products in the scanned item's category in
  the UK, so you can spot a better deal than the one in your hand.
- **Dietary & processing flags** on the confirm screen and basket cards: vegan /
  vegetarian / palm-oil-free, and an additives count — straight from Open Food
  Facts' ingredient analysis. Allergen and "may contain" lists are shown too.
- **Per-serving framing** — when a serving size is known, the confirm screen
  shows protein and calories per serving alongside the per-100g figures.
- **Store-internal barcode detection** — restricted-circulation barcodes (loose
  produce, deli, weighed items; GS1 prefix 2 / 02 / 04) are recognised and the
  app tells you to enter the item by hand instead of failing a pointless lookup.
- **Hybrid barcode scanner** following Open Food Facts' smooth-app strategy of
  "use the strongest decoder the platform offers", with three tiers, best first:
  1. the browser-native **`BarcodeDetector`** (the web equivalent of smooth-app's
     default ML Kit engine) on Android Chrome / modern desktop Chromium;
  2. **`zxing-wasm`** — the C++ ZXing compiled to WebAssembly, far stronger on
     blurry / curved / low-light barcodes than the pure-JS port. This is the
     path iOS browsers and Firefox take, since WebKit has no `BarcodeDetector`;
  3. the pure-JS **`@zxing/browser`** as a last-resort fallback.

  The `.wasm` is bundled and served from our own origin (no CDN), so it works
  offline and behind a strict network policy. Each engine is loaded on demand,
  so a device only downloads the decoder it actually uses.
- **Torch / flashlight toggle** in the scanner (where the camera supports it),
  to rescue dim and curved-surface reads.
- Barcode normalisation mirroring smooth-app's `_fixBarcodeIfNecessary`: strip
  separators and **pad 12-digit UPC-A to 13-digit EAN-13** (Open Food Facts
  keys on EAN-13), with an EAN-13 check-digit guard.
- Fetch and surface richer Open Food Facts data: **fibre** and **saturated fat**
  (editable in the confirm form, summed in basket totals), plus **Nutri-Score**
  (A–E) and **NOVA** processing-group (1–4) badges on item cards and the confirm
  screen.
- Fetch the nutrition-label image URL for future label verification.
- This `CHANGELOG.md`.

### Changed
- Pack size now uses Open Food Facts' numeric `product_quantity` when available
  (more reliable than parsing the free-text quantity string), falling back to
  text parsing. Pack size drives the £/100g-protein metric.
- Nutri-Score now pins to the **2023** algorithm when Open Food Facts provides
  the per-version data, so the grade doesn't shift if OFF changes its default.

### Fixed
- Hard-to-read barcodes (curved tubs, blurry, low light) now decode far more
  reliably. All engines get a **1920×1080 continuous-focus** camera request
  (was an unconstrained-resolution default), and both ZXing fallbacks run with
  `TRY_HARDER` rather than the default fast scan.
- Products whose nutrition is declared **per serving** are now converted to
  per-100g (using the serving size) so scores stay valid, with a warning in the
  confirm form.

### Notes
- The composite score is intentionally unchanged in this release — fibre and
  processing level are displayed but not yet folded into the scoring formula.

## [0.2.0] - 2026-06-26

### Changed
- **Protein-value score is now a smooth, never-zero curve** anchored so
  £4/100g protein scores 5/10. The previous linear scale hit 0 at £6/100g
  protein and stayed there, collapsing every expensive item to the same value;
  any two items now get an ordered, comparable score — the app's core purpose.
- Re-weighted the goal presets toward coached priorities: **Cutting** leans on
  protein-to-calorie, **Bulking** on value, **Balanced** on protein quality.
- GitHub Pages now deploys on every push to `main` (was the feature branch), so
  merging auto-publishes.

### Fixed
- Dairy's natural lactose is no longer penalised like added sugar in the
  sugar-to-carb score. Dairy is auto-detected from Open Food Facts categories
  (with a manual toggle), and a typical lactose baseline is forgiven before
  scoring.

## [0.1.0] - 2026-06-26

### Added
- Initial release of **Basket Score**, an installable React PWA.
- Barcode scanning in-browser (ZXing) with Open Food Facts product lookup and
  manual entry / correction.
- Fitness-value scoring: £/100g protein, protein-to-calorie, and sugar-to-carb
  sub-scores blended into a composite out of 10.
- Ranked basket with running totals (spend, protein, kcal, carbs, sugars, fat)
  and a "cost per day to hit your protein target" figure.
- Side-by-side comparison mode for two products.
- Tunable goal presets (Balanced / Cutting / Bulking) and an adjustable protein
  target.
- Offline-friendly PWA: installable, basket and settings persisted in
  `localStorage`, Open Food Facts lookups cached.
- GitHub Pages deployment workflow.

[Unreleased]: https://github.com/georgesblog/lemon/compare/main...claude/basket-score-app-mgzyhh
[0.3.0]: https://github.com/georgesblog/lemon/compare/afc3ed3...main
[0.2.0]: https://github.com/georgesblog/lemon/compare/8e9e1eb...afc3ed3
[0.1.0]: https://github.com/georgesblog/lemon/commits/8e9e1eb
