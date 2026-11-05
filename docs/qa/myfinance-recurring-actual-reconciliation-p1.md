# My Finance — Recurring Actual Transaction Reconciliation P1

## Rule
- A schedule amount is an estimate, never an actual ledger value.
- A realized transaction may have another amount, date (inside the relevant period), or wallet.
- Monthly schedule linking uses category ID, transaction type, calendar year/month, positive actual amount; aggregate multiple realized transactions.
- Weekly uses the seven-day scheduled window, daily uses the scheduled day, annual uses its scheduled calendar month.
- Many schedules sharing category/type are blocked for automatic matching and forecast rather than allocating one transaction to multiple bills.
- No transaction auto-created, no amount inferred and no schedule config overwritten by actuals.
- A user explicitly enters realized amount, wallet, date, note and confirms before the existing atomic transaction mutation.
- Recheck existing actuals before creating a duplicate; all existing ledger edits/deletions recompute on reload.
- Dashboard 90-day recurring forecasts exclude recorded occurrences, including future paid periods; projections remain estimates.

## Safety
- No migration, no direct SQL, no write to main.
- Existing wallet mutation continues via addTransaction and its atomic RPC.
- No automatic categorization on transaction create; matching is read-only.
- Source transaction-history reads remain scoped by authenticated user.
- Regression coverage in `frontend/src/lib/recurring/recurringActualReconciliation.p1.test.ts`.

## QA
- Run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` in frontend.
- Manually verify list/calendar and due action on desktop + iPhone.
- Manually test one monthly 1,000,000 estimate: enter 850,000 in different wallet earlier in month; verify current-month recorded and next month's estimate unchanged.
- Verify edit/delete via /transactions recomputes status and dashboard forecast.
- Verify duplicate legacy schedules are flagged instead of auto-matching.
- Do not merge to main before CI and browser QA pass.
