# Changelog

All notable changes to Basket Score are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Fixed
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

[Unreleased]: https://github.com/georgesblog/lemon/compare/afc3ed3...main
[0.2.0]: https://github.com/georgesblog/lemon/compare/8e9e1eb...afc3ed3
[0.1.0]: https://github.com/georgesblog/lemon/commits/8e9e1eb
