# MYFINANCE Dashboard Professional Polish P1 — Design
**Date:** 2026-10-23

## Intent
Improve the existing chart-first Dashboard shown in the October 23 screenshot: visually balanced cards, concise Vietnamese copy, professional fintech aesthetics, meaningful budget/expense/wallet visualizations, compact overview, and responsive iPhone/desktop layouts.

## Constraints
- Keep all canonical finance calculations, display period scopes, readiness gates, income vs capital-movement semantics, and existing detail mode.
- Preserve accessibility including screen readers and keyboard focus; never render fabricated zero data on load.
- Keep true status colors for over-budget categories and negative financial changes; use calmer surfaces instead of changing the meaning of alert colors.
- Keep user-selected seasonal skin elsewhere. Make decorative artwork/motion quieter **only on Dashboard**.
- Do not change global header behavior, route navigation, saved UI preferences, or DB schema.
- No new library dependency.

## Approaches
A. Global chrome/style overhaul — rejected: risks regressions throughout app.
B. Scoped Dashboard polish while retaining chart data components — selected: touches a focused visual module, small chart tweaks, dashboard-only shell CSS, tests.
C. Rebuild dashboard with new data services — rejected: duplicates canonical finance logic.

## Design
- Four balanced chart cards: Cash Flow (7 cols) / Expense breakdown (5); Budget utilization (7) / wallet liquidity (5) at desktop; single column on phone.
- Compact summary cues inside the cards, not a second redundant global KPI bar (Hero and KPI row already precede the chart area).
- Donut larger and visually centered; labels with relative bars and top-category insight from observed data only. Wallet percentages based on total positive displayed liquidity, not largest-wallet normalization.
- Budget uses exact canonical spent/limit with capped visual fill; percentage may exceed 100 and must remain visible. Orange near/at-limit, rose over-budget, muted blue healthy.
- Shorten legends, reduce vertical dead space, consistent borders, radius, shadow and focus.
- Keep all original detailed sections in detail mode; no new scroll owner.
- Scope subdued sidebar/topbar seasonal illustrations using a dashboard route attribute on AppShell.

## Acceptance
- Two chart rows look balanced at wide desktop (screenshot width 1728), no duplicate chart labels or empty whitespace after donut.
- No overflow at 375px; tall category names truncate gracefully, amounts remain readable.
- All chart cards retain explicit empty/load states, read-only financial data semantics, and accessible titles.
- Dark mode, seasonal and other routes not accidentally broken.
- CI TypeScript, ESLint, Vitest, Next production build PASS.
