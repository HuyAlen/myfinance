/**
 * Canonical calendar-date primitives — shared by any layer that needs a
 * real "YYYY-MM" / "YYYY-MM-DD" calendar computation.
 *
 * Pure, framework-free: no React, no Next.js, no Supabase, no financial
 * calculation. This is the ONE implementation of month/date validation and
 * month-range expansion in the repository — both the navigation contract
 * (src/lib/navigation/financeNavigation.ts) and AI read tools
 * (src/services/finance/ai-agent/tools/read/financeReadTools.server.ts)
 * import from here rather than each reimplementing date math.
 */

const YEAR_MONTH_SHAPE = /^(\d{4})-(\d{2})$/;
const ISO_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Semantic "YYYY-MM" validation — shape AND a real calendar month (01-12).
 * No year-range restriction is imposed; none exists elsewhere in the
 * domain, so none is invented here.
 */
export function isValidYearMonth(value: string): boolean {
  const match = YEAR_MONTH_SHAPE.exec(value);
  if (!match) return false;

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/**
 * Number of calendar days in `month` (1-12) of `year`, using explicit UTC
 * construction so the result never shifts with the host's local timezone.
 * `Date.UTC(year, month, 0)` is "day 0 of the (0-indexed) `month`-th month",
 * i.e. the last day of the 1-indexed `month` passed in — correct for every
 * month including December (rolls into next year's January index 12,
 * landing back on Dec 31 of `year`) and leap-year Februaries.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Semantic ISO date ("YYYY-MM-DD") validation — shape, a real calendar
 * month, AND a day that actually exists in that year/month (correct
 * Gregorian leap-year handling via `daysInMonth`, not JS Date's silent
 * month-rollover normalization).
 */
export function isValidISODate(value: string): boolean {
  const match = ISO_DATE_SHAPE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  return day <= daysInMonth(year, month);
}

/**
 * Expands a valid "YYYY-MM" into its actual calendar start/end dates —
 * e.g. "2026-02" -> {dateFrom: "2026-02-01", dateTo: "2026-02-28"},
 * "2028-02" -> {..., dateTo: "2028-02-29"}. Returns `undefined` for an
 * invalid month rather than a fabricated date such as "YYYY-MM-31".
 */
export function getMonthDateRange(
  month: string,
): { dateFrom: string; dateTo: string } | undefined {
  if (!isValidYearMonth(month)) return undefined;

  const [yearStr, monthStr] = month.split("-");
  const lastDay = daysInMonth(Number(yearStr), Number(monthStr));

  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}
