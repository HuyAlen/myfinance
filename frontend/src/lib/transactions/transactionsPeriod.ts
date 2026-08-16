/**
 * Canonical Transactions effective-period resolution — TXN-CORRECTNESS-1.
 *
 * Pure, framework-free (no React, no Supabase) — safe to unit-test and
 * import from anywhere without pulling in the Transactions page's full
 * module graph (auth/realtime providers, which require env vars at import
 * time).
 *
 * The single source of truth for "what date range is Transactions
 * actually showing" — used to resolve the fetch range, the visible
 * filter window, and the summary/label period all from ONE value, so
 * they can never drift from each other the way a locally re-derived,
 * month-only range (blind to quarter/year/custom global-filter mode, and
 * blind to a contextual drill-down link) used to.
 */

export type TransactionsEffectiveRange = {
  startDate: string;
  endDate: string;
};

/**
 * Precedence: an explicit drill-down date range carried in the URL (e.g. a
 * Dashboard/Budgets/Reports "?month=" or "?dateFrom=&dateTo=" link, already
 * resolved by financeNavigation's parseTransactionsContext) always wins for
 * the current navigation — this is what makes a historical drill-down
 * (Dashboard viewing August, link says March) land on March instead of
 * silently falling back to whatever the global filter still says.
 * Otherwise, the global DateFilterProvider range drives the page,
 * whichever mode (month/quarter/year/custom) is currently active.
 *
 * No `new Date()`/current-time fallback anywhere in this resolution — an
 * absent/invalid drill-down range simply defers to the global range,
 * never to "now".
 */
export function resolveTransactionsEffectiveRange(
  globalRange: TransactionsEffectiveRange,
  urlContext: { dateFrom?: string; dateTo?: string } | null | undefined,
): TransactionsEffectiveRange {
  if (urlContext?.dateFrom && urlContext?.dateTo) {
    return { startDate: urlContext.dateFrom, endDate: urlContext.dateTo };
  }

  return globalRange;
}
