# MY FINANCE DASHBOARD — EXPENSE CATEGORY CARD POLISH P3

## Visual issue
The screenshot at Dashboard month 2026-11 shows the largest category
(approximately 59% of actual expenses) occupying a visually empty flat tile
while remaining labels, percentages and VND amounts crowd small tiles.

## Solution
- Preserve the existing real-data expense model and proportional mosaic area.
- Introduce a clear actual-spend hero with a data-derived dominant-category hint.
- Introduce a desktop 100% stacked composition strip with five category-identity colours, matching the existing mobile view. It is *not* budget usage.
- Update tile surfaces to subtle pastel gradients, consistent colour accents,
  proportional emphasis, better type hierarchy and a restrained badge + meter
  only on a sufficiently large dominant tile.
- Improve iPhone row cards with a quiet proportional share meter. Keep their
  existing label, exact VND amount, rounded percentage and aggregated "Khác".
- Keep responsive layout, min-height/stretch with the neighbouring cash-flow card,
  full accessible text, and a distinct no-expense empty state.
- Add scoped dark-mode background/contrast so mobile and desktop remain legible.

## Data integrity
- Values come only from `buildCategorySpendingData`; do not invent amount or shares.
- `groupDashboardExpenseSlices` retains four real groups and a sum-preserving
  aggregated "Danh mục khác" when necessary.
- All percentage widths use exact value/total; rounded integer labels are
  presentation only.
- No database changes, no transaction mutation, no changes to business logic,
  category classifications, wallet totals, or cash-flow.
- No API calls in the visualization.

## QA
- New SSR/contract test: sum of bar widths is 100%, dominant group and actual
  amount from real fixtures, five tiles/rows, empty state and dark-mode CSS.
- Retain all dashboard visual contracts, especially chart/readability P1/P2.
- GitHub Quality Gate: TypeScript, ESLint, Vitest, production build.
- Browser QA desktop (1366/1440/1728), iPhone (~390px), dark theme, no truncation;
  QA not claimed until actual browser screenshots are checked.
