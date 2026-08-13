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
