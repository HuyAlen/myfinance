/**
 * Canonical cross-feature navigation contract — INTEGRATION-2.
 *
 * Pure, framework-free route/query-string builders and parsers. No React,
 * no Next.js, no financial calculation of any kind: this module only ever
 * carries IDs and lightweight filter values between pages. Destination
 * pages remain the authoritative source for their own data and for the
 * canonical finance engines (calculateNetWorth, calculateBudgetSpending,
 * etc.) — this module never computes a financial value.
 *
 * Every builder omits undefined/null/empty-string params so URLs never end
 * up with dangling `?walletId=&categoryId=`. Every parser is defensive:
 * unknown/invalid params are ignored rather than thrown on, so a stale or
 * hand-edited URL can never crash a destination page.
 *
 * Calendar-date validation/expansion (isValidYearMonth, isValidISODate,
 * getMonthDateRange) is NOT implemented here — it lives in the generic,
 * navigation-free `src/lib/date/calendarDate.ts` and is re-exported below
 * so existing imports of this module keep working. AI read tools
 * (financeReadTools.server.ts) need the exact same month/date math for
 * Supabase query boundaries and import it from that shared module directly
 * rather than from this navigation-specific one — see the HOTFIX report.
 */

export {
  getMonthDateRange,
  isValidISODate,
  isValidYearMonth,
} from "@/src/lib/date/calendarDate";

import { getMonthDateRange, isValidISODate } from "@/src/lib/date/calendarDate";

function buildQuery(params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, value);
  }

  const query = search.toString();
  return query;
}

function buildHref(pathname: string, params: Record<string, string | undefined | null>) {
  const query = buildQuery(params);
  return query ? `${pathname}?${query}` : pathname;
}

// ─── Transactions ───────────────────────────────────────────────────────────

/** Known Transactions type-filter values (mirrors TransactionsPage's own filter). */
export type TransactionsTypeFilter =
  | "all"
  | "income"
  | "expense"
  | "transfer"
  | "saving"
  | "investment";

const TRANSACTIONS_TYPE_FILTERS = new Set<string>([
  "all",
  "income",
  "expense",
  "transfer",
  "saving",
  "investment",
]);

export type TransactionsNavigationContext = {
  walletId?: string;
  categoryId?: string;
  /** "YYYY-MM" — converted to a dateFrom/dateTo range on Transactions. */
  month?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: TransactionsTypeFilter;
};

/**
 * Builds a `/transactions` href carrying filter context. A Budget's
 * `month` ("YYYY-MM") and an explicit report `dateFrom`/`dateTo` range are
 * mutually exclusive in practice (a Budget drill-down passes `month`, a
 * Reports drill-down passes `dateFrom`/`dateTo`) but both are accepted here
 * since they are just carried through, not computed.
 */
export function buildTransactionsHref(context: TransactionsNavigationContext) {
  return buildHref("/transactions", {
    walletId: context.walletId,
    categoryId: context.categoryId,
    month: context.month,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    type: context.type,
  });
}

export type ParsedTransactionsContext = {
  walletId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: TransactionsTypeFilter;
};

/**
 * Parses `/transactions` search params into validated filter values.
 * Invalid/unknown values are dropped rather than propagated — e.g. a
 * malformed `month` or an unrecognized `type` never reaches the page's
 * filter state. A valid `month` param is expanded into its actual calendar
 * `dateFrom`/`dateTo` range (see `getMonthDateRange` — correct per-month
 * length, including leap-year February) and takes precedence over an
 * explicit `dateFrom`/`dateTo` pair when both are present; an invalid
 * `month` falls back to the explicit pair, each validated independently so
 * a partial range (only `dateFrom` or only `dateTo`) is still honored.
 */
export function parseTransactionsContext(
  searchParams: URLSearchParams,
): ParsedTransactionsContext {
  const result: ParsedTransactionsContext = {};

  const walletId = searchParams.get("walletId");
  if (walletId) result.walletId = walletId;

  const categoryId = searchParams.get("categoryId");
  if (categoryId) result.categoryId = categoryId;

  const type = searchParams.get("type");
  if (type && TRANSACTIONS_TYPE_FILTERS.has(type)) {
    result.type = type as TransactionsTypeFilter;
  }

  const month = searchParams.get("month");
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");

  const monthRange = month ? getMonthDateRange(month) : undefined;
  if (monthRange) {
    result.dateFrom = monthRange.dateFrom;
    result.dateTo = monthRange.dateTo;
  } else {
    if (dateFromParam && isValidISODate(dateFromParam)) {
      result.dateFrom = dateFromParam;
    }
    if (dateToParam && isValidISODate(dateToParam)) {
      result.dateTo = dateToParam;
    }
  }

  return result;
}

/** True when any contextual (non-`action`) Transactions param is present. */
export function hasTransactionsContext(searchParams: URLSearchParams) {
  return (
    searchParams.has("walletId") ||
    searchParams.has("categoryId") ||
    searchParams.has("month") ||
    searchParams.has("dateFrom") ||
    searchParams.has("dateTo") ||
    searchParams.has("type")
  );
}

// ─── Entity-focus destinations ──────────────────────────────────────────────
//
// Each of these focuses a single row on its own (otherwise unfiltered) page
// — see "Filter != Entity Focus". They only ever carry an id.

export function buildBudgetsHref(context: { budgetId?: string } = {}) {
  return buildHref("/budgets", { budgetId: context.budgetId });
}

export function buildWalletsHref(context: { walletId?: string } = {}) {
  return buildHref("/wallets", { walletId: context.walletId });
}

export function buildSavingsHref(context: { savingId?: string } = {}) {
  return buildHref("/savings", { savingId: context.savingId });
}

export function buildInvestmentsHref(
  context: { investmentId?: string; forexAccountId?: string } = {},
) {
  return buildHref("/investments", {
    investmentId: context.investmentId,
    forexAccountId: context.forexAccountId,
  });
}

export function buildGoalsHref(context: { goalId?: string } = {}) {
  return buildHref("/goals", { goalId: context.goalId });
}

export function buildDebtsHref(context: { debtId?: string } = {}) {
  return buildHref("/debts", { debtId: context.debtId });
}

/**
 * Parses a single focus-id param (e.g. `budgetId`, `goalId`). Returns
 * `undefined` for a missing or empty value — callers should treat that as
 * "no focus requested" and render their normal, unfiltered page.
 */
export function parseFocusId(searchParams: URLSearchParams, param: string) {
  const value = searchParams.get(param);
  return value ? value : undefined;
}
