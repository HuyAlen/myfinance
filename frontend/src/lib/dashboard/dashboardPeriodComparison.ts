/**
 * UI-DASH-4 Period Comparison Layer.
 *
 * Pure, framework-free helpers for comparing a Dashboard metric's current
 * value against its comparable previous-period value. This module knows
 * about DATE SEMANTICS (which previous window is "like-for-like") and
 * about the GENERIC shape of a comparison result — it computes no
 * financial value itself. Callers (DashboardPage.tsx) compute both the
 * current and previous numeric values using the exact same canonical
 * helpers already powering the current KPI (getTotalIncome/getTotalExpense/
 * the saving-allocation helpers), then hand both numbers to
 * `buildDashboardComparison`.
 *
 * Scope: this sprint's "previous period" is only resolved for the
 * Dashboard's `"month"` filter mode — the dominant, default mode, and the
 * one every product example in this sprint's brief is expressed in terms
 * of. Quarter/year/custom-range modes are intentionally left unavailable
 * (see DashboardPage.tsx's periodComparison memo) rather than shipping
 * under-tested previous-quarter/previous-year elapsed-window arithmetic
 * this sprint never specifies or exemplifies.
 *
 * No React, no router, no network — this module never decides whether a
 * previous period's transactions are actually LOADED; it only computes
 * what the ideal previous window WOULD be (`resolveMonthComparisonWindow`)
 * and, given the caller's own already-known loaded-data boundary, whether
 * that window falls inside it (`isComparisonWindowLoaded`).
 */
import type { DateRangeInput } from "@/src/services/finance/financeCalculations";

const MONTH_START_SHAPE = /^(\d{4})-(\d{2})-01$/;

/** Days in `month` (1-12) of `year`, via UTC construction so the result
 * never shifts with the host's local timezone — the same technique
 * `calendarDate.ts` (this repo's one canonical month/date-range module)
 * already uses for identical reasons. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseMonthStart(startDate: string): { year: number; month: number } {
  const match = MONTH_START_SHAPE.exec(startDate);
  if (!match) {
    throw new Error(
      `resolveMonthComparisonWindow expects a month-mode range whose startDate is the 1st of a month (got "${startDate}")`,
    );
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The full calendar boundaries of the month immediately before
 * `year`-`month`, rolling back into December of the prior year from
 * January. */
function previousMonthRange(year: number, month: number): DateRangeInput {
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const lastDay = daysInMonth(previousYear, previousMonth);

  return {
    startDate: `${previousYear}-${pad2(previousMonth)}-01`,
    endDate: `${previousYear}-${pad2(previousMonth)}-${pad2(lastDay)}`,
  };
}

export type MonthComparisonWindow = {
  /** The current window actually used for the comparison — equal to the
   * full selected month when it is already complete, or clamped to
   * `[monthStart, today]` when the selected month is still ongoing. */
  current: DateRangeInput;
  /** The comparable previous-month window — full month vs full month, or
   * the SAME elapsed day-count as `current` when the selected month is
   * ongoing (clamped to the previous month's own last day, so a 31-day
   * "so far" never overruns a 28/29/30-day previous month). */
  previous: DateRangeInput;
  /** False when the selected month still has unelapsed days as of
   * `today` — current/previous are both elapsed-clamped, not full months. */
  isComplete: boolean;
};

/**
 * Resolves the like-for-like comparison window for a month-mode
 * `dateRange`. `today` is an explicit "YYYY-MM-DD" input (never read via
 * `new Date()` inside this module) so the decision of "is the selected
 * month still ongoing" is centralized at one call site and fully
 * deterministic under test.
 *
 * - Selected month already ended (`today` on/after its last day, or the
 *   month is otherwise in the past): compares the FULL selected month to
 *   the FULL previous month.
 * - Selected month is the ongoing current month (`today` falls strictly
 *   before its last day): compares `[monthStart, today]` to the SAME
 *   elapsed day-count in the previous month, clamped to that month's own
 *   length — e.g. "Aug 1-15" vs "Jul 1-15", or a day-31 elapsed count
 *   safely clamped to Feb 28/29 rather than overrunning into March.
 */
export function resolveMonthComparisonWindow(
  current: DateRangeInput,
  today: string,
): MonthComparisonWindow {
  const { year, month } = parseMonthStart(current.startDate);
  const previousFull = previousMonthRange(year, month);

  const isOngoing = today >= current.startDate && today < current.endDate;

  if (!isOngoing) {
    return { current, previous: previousFull, isComplete: true };
  }

  const elapsedDay = Number(today.slice(8, 10));
  const previousLastDay = Number(previousFull.endDate.slice(8, 10));
  const clampedPreviousDay = Math.min(elapsedDay, previousLastDay);

  return {
    current: { startDate: current.startDate, endDate: today },
    previous: {
      startDate: previousFull.startDate,
      endDate: `${previousFull.startDate.slice(0, 7)}-${pad2(clampedPreviousDay)}`,
    },
    isComplete: false,
  };
}

/**
 * True when `previous.startDate` falls on/after the earliest date
 * DashboardPage's year-scoped transaction fetch actually loaded — i.e.
 * this previous window's data already exists in state and computing its
 * comparison requires no new network read. `loadedRangeStartDate` is the
 * caller's own already-computed fetch-range start (DashboardPage.tsx's
 * existing `getDashboardFetchRange`), not recomputed here — this module
 * has no opinion on fetch policy, only on whether a given window is
 * inside an already-known boundary.
 */
export function isComparisonWindowLoaded(
  previous: DateRangeInput,
  loadedRangeStartDate: string,
): boolean {
  return previous.startDate >= loadedRangeStartDate;
}

export type DashboardComparisonDirection = "up" | "down" | "flat";

export type DashboardComparison =
  | {
      available: true;
      current: number;
      previous: number;
      delta: number;
      direction: DashboardComparisonDirection;
    }
  | { available: false };

function directionFromDelta(delta: number): DashboardComparisonDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * Generic numeric comparison — no currency/percentage-point formatting,
 * no "up is good" judgment. `direction` is purely the sign of
 * `current - previous`; callers decide what that means for their own
 * metric (Cash Flow and Saving Rate both treat "up" as improvement, but
 * this module makes no such assumption on their behalf — see UI-DASH-4's
 * final report, "Metric-Specific Semantics").
 *
 * `previous: null` means "no comparable previous-period value exists"
 * (missing loaded data, undefined denominator, etc.) — the result is
 * `{ available: false }`, never a comparison against a fabricated zero.
 */
export function buildDashboardComparison(
  current: number,
  previous: number | null,
): DashboardComparison {
  if (previous === null) {
    return { available: false };
  }

  const delta = current - previous;
  return {
    available: true,
    current,
    previous,
    delta,
    direction: directionFromDelta(delta),
  };
}
