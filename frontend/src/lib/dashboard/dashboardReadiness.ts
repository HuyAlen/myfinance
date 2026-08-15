/**
 * Pure readiness-decision helper for DashboardPage's per-KPI-group loading
 * state — see the PERF-2 KPI Readiness Correctness patch.
 *
 * This module answers exactly one question: "given this fetch's outcome and
 * whether this group has ever loaded successfully before, may the group's
 * readiness flag become/stay true?" It does not calculate any financial
 * value (Net Worth, income, expense, Forex value, etc.) — that remains the
 * exclusive responsibility of financeCalculations.ts's canonical functions.
 *
 * The core invariant: an unresolved/failed fetch is never equivalent to a
 * successfully-loaded empty/zero value. A group may only report itself
 * ready when either:
 *   - this fetch cycle succeeded, or
 *   - a PRIOR fetch cycle already succeeded at least once (so there is a
 *     last-known-good snapshot to keep showing instead of a fabricated
 *     zero).
 */
export function shouldMarkReady(
  succeededThisCycle: boolean,
  hasEverSucceeded: boolean,
): boolean {
  return succeededThisCycle || hasEverSucceeded;
}

/**
 * The Dashboard Hero section (Net Worth headline, liquidity/investment/
 * debt/Forex-capital HeroMinis, and the "Dòng tiền dương/âm" cash-flow
 * badge) is ready only when BOTH of its real dependency groups are ready:
 * the canonical Net Worth asset/liability bundle (`isDashboardReady`) and
 * the cash-flow group (`cashFlowReady`, feeding the badge's income/
 * expense). This is a pure composition of two already-existing flags —
 * it does not represent a new fetch group or a new financial calculation.
 */
export function isHeroReady(
  netWorthReady: boolean,
  cashFlowReady: boolean,
): boolean {
  return netWorthReady && cashFlowReady;
}

/**
 * UI-DASH-2 Budget Attention Readiness Correctness patch.
 *
 * The Budget Attention card derives from two distinct dependency classes:
 * `budgets` (snapshot-like — globally fetched once, then client-side
 * filtered by month; never refetched on a year switch) and
 * `transactions`+`categories` for the selected period (already exactly
 * `cashFlowReady`'s own dependency set — see the big readiness-flag
 * comment block in DashboardPage.tsx). Rather than inventing a second
 * transactions/categories readiness signal, this reuses `cashFlowReady`
 * as-is: it already correctly resets to false on a genuine year-context
 * change (PERF-3's `invalidatePeriodReadinessForNewContext`) and correctly
 * preserves last-known-good on a same-context retry failure (PERF-2's
 * `shouldMarkReady`) — Budget Attention inherits both properties for free
 * by depending on it, instead of duplicating that logic.
 *
 * `budgetsLoaded` is the one genuinely new piece: has the budgets dataset
 * itself ever completed a successful load this session? `budgets.length
 * === 0` is NOT a substitute for this — it is also true before the very
 * first fetch resolves, and a real empty result must render a legitimate
 * "no budgets" state, not be indistinguishable from "not loaded yet".
 *
 * Budgets remain intentionally secondary/non-blocking (PERF-1): this
 * predicate governs ONLY whether the Budget Attention surface itself may
 * render — it is never consulted by isHeroReady, isDashboardReady, or any
 * other Dashboard readiness computation.
 */
export function isBudgetAttentionReady(
  budgetsLoaded: boolean,
  cashFlowReady: boolean,
): boolean {
  return budgetsLoaded && cashFlowReady;
}

/**
 * DASH-POLISH-1 Monthly Progress readiness.
 *
 * Monthly Progress's calendar fields (elapsed days, days-in-month, time
 * progress %) are pure date arithmetic with no fetch dependency and are
 * safe to render immediately. Its spend/budget fields are not: "Đã chi"/
 * "Dự báo cuối tháng" depend on the selected period's `transactions`, and
 * "Dùng ngân sách"/"Dự báo ngân sách" additionally depend on `budgets`.
 * Before this patch, none of those four fields were gated at all, so a
 * pre-fetch/mid-year-switch render could show "0đ"/"0%" indistinguishable
 * from a legitimate zero — the same class of bug the Budget Attention
 * Readiness Correctness patch fixed, left un-extended here.
 *
 * The union of real dependencies is exactly `cashFlowReady` (the existing
 * "transactions belong to the currently selected period" signal — Monthly
 * Progress's own expense math doesn't strictly need `categories`, but no
 * narrower "transactions-only" flag exists, and reusing `cashFlowReady` as
 * that signal is the same precedented choice Budget Attention already
 * made) `&&` `budgetsLoaded` (has the budgets dataset itself ever
 * completed a successful load this session — `budgets.length === 0` is
 * NOT a substitute, see `isBudgetAttentionReady`'s own doc comment).
 *
 * This happens to share `isBudgetAttentionReady`'s exact formula, but is
 * kept as its own named function rather than an alias: Budget Attention
 * and Monthly Progress are separate Dashboard features with separate
 * dependency contracts that only coincide today — aliasing one to the
 * other would silently couple them, so a future change to either
 * feature's real dependencies wouldn't need to touch the other.
 */
export function isMonthlyProgressReady(
  cashFlowReady: boolean,
  budgetsLoaded: boolean,
): boolean {
  return cashFlowReady && budgetsLoaded;
}

/**
 * PERF-3: classifies whether a period (year-scoped) reload targets a
 * different context than the one currently reflected in state.
 *
 * `loadedYear` is the year whose transactions are currently in state
 * (`null` before the first successful period load ever completes).
 * `requestedYear` is the year about to be fetched.
 *
 * This is deliberately narrow: it does not decide what to DO about a
 * context change (that's DashboardPage's invalidation logic) — it only
 * answers "is this the same context as what's already loaded, or a
 * different one?" A `null` loadedYear is never a context change (there is
 * nothing yet to mismatch against) — only two non-null, different years
 * are.
 */
export function isNewPeriodContext(
  loadedYear: number | null,
  requestedYear: number,
): boolean {
  return loadedYear !== null && loadedYear !== requestedYear;
}

/**
 * PERF-3 final period-surface correctness patch.
 *
 * The positive form of `isNewPeriodContext`: is the transaction snapshot
 * currently in state actually valid for the currently selected year? Any
 * visible surface that derives from `transactions` (Cash Flow KPI,
 * netWorthTrend/netWorthChartStats, the Cash Flow panel, the 50/30/20
 * split, top-spending categories, etc.) must render nothing but a loading
 * state whenever this is false — otherwise a still-held prior year's
 * transactions could be presented as if they belonged to the newly
 * selected year, which is exactly as invalid as a genuinely failed fetch
 * (see the PERF-3 acceptance criteria: "old period data cannot appear as
 * valid new-period KPI data").
 *
 * DashboardPage does not read this directly during render — doing so
 * would mean reading `loadedPeriodYearRef.current` (a ref) at render time,
 * which is not guaranteed to trigger a re-render. Instead it relies on
 * `cashFlowReady`, a piece of React state that reloadData/reloadPeriod
 * already maintain to be true if-and-only-if this predicate holds (see
 * dashboardReadiness.test.ts's orchestration simulation, which asserts the
 * two never diverge across every PERF-3 race scenario). This helper exists
 * to make that equivalence explicit and independently testable.
 */
export function isPeriodSnapshotCurrent(
  loadedYear: number | null,
  requestedYear: number,
): boolean {
  return loadedYear !== null && loadedYear === requestedYear;
}

/**
 * PERF-3 race-generation guard.
 *
 * A "logical period operation" is one call to reloadData (the full
 * snapshot+period reload) or one call to reloadPeriod (a pure year
 * switch). Each such call must claim exactly ONE generation id — every
 * branch it spawns (DashboardPage's four period-dependent readiness
 * groups: cashFlow/goals/emergencyFund/savingInvestment) shares that same
 * id, rather than each branch minting its own. Sharing one id per logical
 * operation is what lets an in-flight OLDER operation's branches all
 * agree they've been superseded the moment a NEWER operation starts,
 * instead of some branches from the old operation incorrectly surviving
 * because they happened to claim a "later" id than a sibling branch from
 * the same call.
 *
 * `generationRef` is a plain mutable counter (a React ref in practice,
 * but this module stays framework-free) — callers own its storage.
 */
export type PeriodGenerationRef = { current: number };

/** Claims a new generation for one logical period operation. Call this
 * exactly once per reloadData/reloadPeriod invocation, before spawning any
 * of its branches, and have every branch capture the returned id. */
export function beginPeriodGeneration(
  generationRef: PeriodGenerationRef,
): number {
  generationRef.current += 1;
  return generationRef.current;
}

/** True once a newer logical period operation has started after this
 * branch captured its generation id — the branch's result must then be
 * discarded as a no-op rather than applied to state. */
export function isStalePeriodGeneration(
  generationRef: PeriodGenerationRef,
  capturedGeneration: number,
): boolean {
  return generationRef.current !== capturedGeneration;
}
