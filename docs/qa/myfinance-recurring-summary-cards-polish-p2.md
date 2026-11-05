# My Finance — Recurring Summary Cards Polish P2

## Purpose
Replace the misleading four remainder-only recurring forecast cards with a clear selected-month actual-versus-estimate overview.

## Cards
1. Kỳ đã ghi nhận: realized / planned occurrences for the header-selected month.
2. Tổng chi dự tính: full estimated expense plan (never disappears when recorded); show estimated income as supporting line when present.
3. Tổng chi thực tế: actual expense from persisted matching transactions; show actual income as supporting line when present.
4. Chênh lệch chi: actual minus estimate for **recorded** expense occurrences; show income difference separately when present. No recorded occurrences means a dash, **not** a claim of savings.

For income-only months, prioritize income figures. Mixed income+expense plans are never netted.

## Integrity / guardrails
- Uses `buildRecurringMonthSummary`, a read-only helper on the canonical P1 schedule and transaction models.
- Plan occurrences expand from **persisted schedule nextRunDate anchor**, not `effectiveNextRunDate` (the first unpaid date).
- Reuses P1 `reconcileRecurringOccurrence` matching by category ID / type / specific recurrence period.
- Aggregates multiple actual transaction amounts per occurrence; never double-counts transaction IDs.
- Excludes paused, invalid or ambiguous category schedules from totals.
- Existing current-month reminders, Dashboard projection, selected-month calendar, transaction create/edit/delete and wallet mutation pathways are unchanged.
- No migration, no new API, no automatic transactions or wallet balance changes.
- Card numbers recompute on month selection, transaction mutation and realtime reload.

## Test coverage
- Three bill reference: 3/3; 8,900,000 estimate; 8,667,054 actual; -232,946 difference.
- Two unpaid bills do not count as lower-than-budget spending.
- Mixed income/expense; income-only; multi-transaction matching.
- Month 10 ↔ 11 ↔ 12, edit/delete/category/wallet changes.
- Daily/weekly/yearly occurrences; month-end clamping.
- Paused, invalid, overlapping schedules; pure read-model behavior.
- UI contract for four cards and unchanged P1 safety semantics.

## Release criteria
- GitHub Quality Gate: TypeScript, ESLint, Vitest, production build must pass.
- Browser QA desktop and iPhone with selected month and verified money amounts, screenshot evidence; do not call browser QA PASS based only on source tests.
- Keep on feature branch until release verification. Merge only after authorization.

## P2 layout polish — three recurring schedule cards on desktop
- List grid: 1 column under lg; 2 at lg; 3 at xl and above. No horizontal scrolling.
- Loading skeleton uses the same responsive columns, adding a third skeleton at xl to avoid reflow.
- Cards fill the grid row height, with action buttons anchored to the bottom for consistent visual alignment.
- The long title and wallet/category labels truncate safely in narrow three-column cards, with native title tooltip retaining full text.
- Mobile action footer stays in two columns with full-width delete; desktop remains three compact buttons.
- QA: verify three monthly plans fit one row at 1280/1440/1712 desktop; one column at phone width; no clipped amount or action; long Vietnamese category title; disabled/recorded cards and load/error states.
