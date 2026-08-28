"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { isValidISODate } from "@/src/lib/date/calendarDate";

const STORAGE_KEY = "myfinance_date_filter_v2";
const LEGACY_MONTH_KEY = "myfinance_selected_month";

// Module-scope flag: stays `false` only for the first DateFilterProvider
// mount after a real document load (initial visit or hard reload), and
// `true` for every subsequent SPA route change within the same document
// lifetime. This lets us reset to the current month exactly once per
// browser session/reload without disturbing in-app month selection.
let hasBootstrappedDateFilter = false;

export type DateFilterMode = "month" | "quarter" | "year" | "custom";

export type MonthOption = {
  value: string;
  label: string;
};

export type QuarterOption = {
  value: string;
  label: string;
  subLabel: string;
};

export type YearOption = {
  value: string;
  label: string;
};

type StoredDateFilter = {
  mode: DateFilterMode;
  selectedMonth: string;
  selectedQuarter: string;
  selectedYear: number;
  customStart: string;
  customEnd: string;
};

type DateFilterContextValue = {
  filterMode: DateFilterMode;
  setFilterMode: (mode: DateFilterMode) => void;
  selectedMonth: string;
  selectedYear: number;
  selectedMonthNumber: number;
  selectedQuarter: string;
  customStart: string;
  customEnd: string;
  setSelectedMonth: (month: string) => void;
  setSelectedQuarter: (quarter: string) => void;
  setSelectedYearFilter: (year: number) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  monthLabel: string;
  filterLabel: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  months12: MonthOption[];
  quarters8: QuarterOption[];
  years5: YearOption[];
};

const DateFilterContext = createContext<DateFilterContextValue | null>(null);

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function isValidMonthKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function isValidQuarterKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-Q[1-4]$/.test(value));
}

function isValidDate(value: string | null): value is string {
  return Boolean(value && isValidISODate(value));
}

function isValidDateFilterMode(value: unknown): value is DateFilterMode {
  return (
    value === "month" ||
    value === "quarter" ||
    value === "year" ||
    value === "custom"
  );
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    selectedYear: year,
    selectedMonthNumber: month,
  };
}

function toQuarterKey(monthKey: string) {
  const { selectedYear, selectedMonthNumber } = parseMonthKey(monthKey);
  const quarter = Math.ceil(selectedMonthNumber / 3);
  return `${selectedYear}-Q${quarter}`;
}

function formatMonthLabel(monthKey: string) {
  const { selectedYear, selectedMonthNumber } = parseMonthKey(monthKey);
  return `tháng ${selectedMonthNumber} năm ${selectedYear}`;
}

function getMonthEnd(monthKey: string) {
  const { selectedYear, selectedMonthNumber } = parseMonthKey(monthKey);
  const end = new Date(selectedYear, selectedMonthNumber, 0);
  return `${selectedYear}-${pad2(selectedMonthNumber)}-${pad2(end.getDate())}`;
}

function getMonthRange(monthKey: string) {
  return {
    startDate: `${monthKey}-01`,
    endDate: getMonthEnd(monthKey),
  };
}

function parseQuarterKey(quarterKey: string) {
  const [yearRaw, quarterRaw] = quarterKey.split("-Q");
  const year = Number(yearRaw);
  const quarter = Number(quarterRaw);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;

  return {
    year,
    quarter,
    startMonth,
    endMonth,
  };
}

function getQuarterRange(quarterKey: string) {
  const { year, startMonth, endMonth } = parseQuarterKey(quarterKey);
  return {
    startDate: `${year}-${pad2(startMonth)}-01`,
    endDate: getMonthEnd(`${year}-${pad2(endMonth)}`),
  };
}

function formatQuarterLabel(quarterKey: string) {
  const { year, quarter } = parseQuarterKey(quarterKey);
  return `Quý ${quarter}/${year}`;
}

function formatQuarterSubLabel(quarterKey: string) {
  const { startDate, endDate } = getQuarterRange(quarterKey);
  const startMonth = Number(startDate.slice(5, 7));
  const endMonth = Number(endDate.slice(5, 7));
  const year = startDate.slice(0, 4);
  return `Tháng ${startMonth} - ${endMonth}/${year}`;
}

function buildMonths12(baseMonth: string): MonthOption[] {
  const { selectedYear } = parseMonthKey(baseMonth);

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const value = `${selectedYear}-${pad2(month)}`;

    return {
      value,
      label: `${pad2(month)}/${selectedYear}`,
    };
  });
}

function buildQuarters8(baseMonth: string): QuarterOption[] {
  const { selectedYear } = parseMonthKey(baseMonth);
  const years = [selectedYear + 1, selectedYear, selectedYear - 1];

  return years.flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => {
      const value = `${year}-Q${quarter}`;

      return {
        value,
        label: formatQuarterLabel(value),
        subLabel: formatQuarterSubLabel(value),
      };
    }),
  );
}

function buildYears5(baseMonth: string): YearOption[] {
  const { selectedYear } = parseMonthKey(baseMonth);

  return Array.from({ length: 11 }, (_, index) => {
    const value = String(selectedYear + 5 - index);
    return {
      value,
      label: `Năm ${value}`,
    };
  });
}

function getYearRange(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function getDefaultStoredFilter(): StoredDateFilter {
  const selectedMonth = getDefaultMonth();
  const { selectedYear } = parseMonthKey(selectedMonth);
  const monthRange = getMonthRange(selectedMonth);

  return {
    mode: "month",
    selectedMonth,
    selectedQuarter: toQuarterKey(selectedMonth),
    selectedYear,
    customStart: monthRange.startDate,
    customEnd: monthRange.endDate,
  };
}

function normalizeFilter(raw: Partial<StoredDateFilter>): StoredDateFilter {
  const fallback = getDefaultStoredFilter();
  const selectedMonth = isValidMonthKey(raw.selectedMonth ?? null)
    ? raw.selectedMonth!
    : fallback.selectedMonth;
  const { selectedYear } = parseMonthKey(selectedMonth);
  const selectedQuarter = isValidQuarterKey(raw.selectedQuarter ?? null)
    ? raw.selectedQuarter!
    : toQuarterKey(selectedMonth);
  const customStart = isValidDate(raw.customStart ?? null)
    ? raw.customStart!
    : getMonthRange(selectedMonth).startDate;
  const customEnd = isValidDate(raw.customEnd ?? null)
    ? raw.customEnd!
    : getMonthRange(selectedMonth).endDate;

  return {
    mode: isValidDateFilterMode(raw.mode) ? raw.mode : "month",
    selectedMonth,
    selectedQuarter,
    selectedYear: Number.isFinite(raw.selectedYear)
      ? raw.selectedYear!
      : selectedYear,
    customStart,
    customEnd,
  };
}

function getFilterFromUrl(): Partial<StoredDateFilter> | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const month = params.get("month");
  const quarter = params.get("quarter");
  const yearRaw = params.get("year");
  const customStart = params.get("from");
  const customEnd = params.get("to");
  const legacyRange = params.get("range");
  const legacyRangeMatch = legacyRange?.match(
    /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/,
  );
  const resolvedCustomStart = customStart ?? legacyRangeMatch?.[1] ?? null;
  const resolvedCustomEnd = customEnd ?? legacyRangeMatch?.[2] ?? null;

  if (isValidMonthKey(month)) {
    const parsed = parseMonthKey(month);
    return {
      mode: "month",
      selectedMonth: month,
      selectedQuarter: toQuarterKey(month),
      selectedYear: parsed.selectedYear,
    };
  }

  if (isValidQuarterKey(quarter)) {
    const range = getQuarterRange(quarter);
    const parsed = parseMonthKey(range.startDate.slice(0, 7));
    return {
      mode: "quarter",
      selectedMonth: range.startDate.slice(0, 7),
      selectedQuarter: quarter,
      selectedYear: parsed.selectedYear,
    };
  }

  if (yearRaw && /^\d{4}$/.test(yearRaw)) {
    const year = Number(yearRaw);
    return {
      mode: "year",
      selectedMonth: `${year}-01`,
      selectedQuarter: `${year}-Q1`,
      selectedYear: year,
    };
  }

  if (isValidDate(resolvedCustomStart) && isValidDate(resolvedCustomEnd)) {
    const safeStart =
      resolvedCustomStart <= resolvedCustomEnd
        ? resolvedCustomStart
        : resolvedCustomEnd;
    const safeEnd =
      resolvedCustomStart <= resolvedCustomEnd
        ? resolvedCustomEnd
        : resolvedCustomStart;
    const parsed = parseMonthKey(safeStart.slice(0, 7));

    return {
      mode: "custom",
      selectedMonth: safeStart.slice(0, 7),
      selectedQuarter: toQuarterKey(safeStart.slice(0, 7)),
      selectedYear: parsed.selectedYear,
      customStart: safeStart,
      customEnd: safeEnd,
    };
  }

  return null;
}

function getInitialFilter(): StoredDateFilter {
  if (typeof window === "undefined") return getDefaultStoredFilter();

  // A valid deep-link is authoritative on BOTH the first document load and
  // SPA remounts. Without a period query, the first real document load still
  // starts at the current month (avoids resurrecting a stale persisted period);
  // later remounts may restore the persisted in-app selection.
  try {
    const urlFilter = getFilterFromUrl();
    if (urlFilter) {
      return normalizeFilter(urlFilter);
    }

    if (!hasBootstrappedDateFilter) {
      return getDefaultStoredFilter();
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return normalizeFilter(JSON.parse(saved) as Partial<StoredDateFilter>);
    }

    const legacyMonth = window.localStorage.getItem(LEGACY_MONTH_KEY);
    if (isValidMonthKey(legacyMonth)) {
      return normalizeFilter({ selectedMonth: legacyMonth });
    }
  } catch {
    // ignore storage errors
  }

  return getDefaultStoredFilter();
}

function persistFilter(filter: StoredDateFilter) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
    window.localStorage.setItem(LEGACY_MONTH_KEY, filter.selectedMonth);
  } catch {
    // ignore storage errors
  }
}

function getFilterRange(filter: StoredDateFilter) {
  if (filter.mode === "quarter") return getQuarterRange(filter.selectedQuarter);
  if (filter.mode === "year") return getYearRange(filter.selectedYear);
  if (filter.mode === "custom") {
    return {
      startDate: filter.customStart,
      endDate: filter.customEnd,
    };
  }

  return getMonthRange(filter.selectedMonth);
}

function getFilterLabel(filter: StoredDateFilter) {
  if (filter.mode === "quarter")
    return formatQuarterLabel(filter.selectedQuarter);
  if (filter.mode === "year") return `Năm ${filter.selectedYear}`;
  if (filter.mode === "custom") {
    return `${filter.customStart.split("-").reverse().join("/")} - ${filter.customEnd
      .split("-")
      .reverse()
      .join("/")}`;
  }

  return formatMonthLabel(filter.selectedMonth);
}

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState(getInitialFilter);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const filterRef = useRef(filter);
  pathnameRef.current = pathname;
  filterRef.current = filter;

  // Mark this document's DateFilterProvider lifecycle as bootstrapped and
  // persist the resolved filter, but only the FIRST time this happens for
  // the current document (module flag stays true across SPA remounts,
  // resets only on a real reload). This intentionally lives in an effect,
  // not in the lazy `useState` initializer above, because that initializer
  // can be invoked more than once per render in React Strict Mode — a
  // module-level mutation there would make the second invocation see a
  // stale flag and fall through to the URL/localStorage branch, silently
  // reintroducing the exact bug this is meant to fix.
  useEffect(() => {
    if (hasBootstrappedDateFilter) return;
    hasBootstrappedDateFilter = true;
    persistFilter(filter);
  }, [filter]);

  const replaceCanonicalPeriodInUrl = useCallback(
    (nextFilter: StoredDateFilter) => {
      if (typeof window === "undefined") return;

      const currentParams = new URLSearchParams(window.location.search);
      const currentPathname = pathnameRef.current;
      if (
        currentPathname === "/transactions" &&
        (currentParams.has("dateFrom") || currentParams.has("dateTo"))
      ) {
        return;
      }

      const nextParams = new URLSearchParams(window.location.search);
      ["month", "quarter", "year", "from", "to", "range"].forEach((key) =>
        nextParams.delete(key),
      );

      if (nextFilter.mode === "quarter") {
        nextParams.set("quarter", nextFilter.selectedQuarter);
      } else if (nextFilter.mode === "year") {
        nextParams.set("year", String(nextFilter.selectedYear));
      } else if (nextFilter.mode === "custom") {
        nextParams.set("from", nextFilter.customStart);
        nextParams.set("to", nextFilter.customEnd);
      } else {
        nextParams.set("month", nextFilter.selectedMonth);
      }

      if (currentParams.toString() === nextParams.toString()) return;

      const query = nextParams.toString();
      router.replace(query ? `${currentPathname}?${query}` : currentPathname);
    },
    [router],
  );

  // Route changes are special: normal sidebar navigation has no period query,
  // so carry the current global period into the new URL. A route that already
  // carries a valid period deep-link becomes authoritative instead. Explicit
  // Transactions dateFrom/dateTo drill-downs are contextual and must remain
  // independent — do not inject a global month that would override them.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (
      pathname === "/transactions" &&
      (params.has("dateFrom") || params.has("dateTo"))
    ) {
      return;
    }

    const urlFilter = getFilterFromUrl();
    if (urlFilter) {
      const normalized = normalizeFilter(urlFilter);
      const currentFilter = filterRef.current;
      const currentRange = getFilterRange(currentFilter);
      const nextRange = getFilterRange(normalized);
      const isSame =
        currentFilter.mode === normalized.mode &&
        currentRange.startDate === nextRange.startDate &&
        currentRange.endDate === nextRange.endDate;

      if (!isSame) {
        setFilter(normalized);
        persistFilter(normalized);
      }
      return;
    }

    replaceCanonicalPeriodInUrl(filterRef.current);
    // Route adoption is intentionally keyed to pathname, while the callback
    // itself is stable unless the Next router instance changes.
  }, [pathname, replaceCanonicalPeriodInUrl]);

  // Canonical durable URL contract. DateFilterProvider is the ONLY writer of
  // global-period query params after an in-app filter change: preserve
  // unrelated params, delete every stale period key from prior modes, then
  // write exactly the active mode. Keeping pathname out of this dependency
  // list prevents a contextual Transactions month drill-down from being
  // overwritten merely because navigation changed routes.
  useEffect(() => {
    replaceCanonicalPeriodInUrl(filter);
    // `replaceCanonicalPeriodInUrl` reads the latest pathname via a ref so
    // route transitions themselves do not trigger this state-to-URL effect.
  }, [filter, replaceCanonicalPeriodInUrl]);

  const updateFilter = (next: StoredDateFilter) => {
    setFilter(next);
    persistFilter(next);
  };

  const setFilterMode = (mode: DateFilterMode) => {
    updateFilter({ ...filter, mode });
  };

  const setSelectedMonth = (month: string) => {
    if (!isValidMonthKey(month)) return;
    const parsed = parseMonthKey(month);
    updateFilter({
      ...filter,
      mode: "month",
      selectedMonth: month,
      selectedQuarter: toQuarterKey(month),
      selectedYear: parsed.selectedYear,
    });
  };

  const setSelectedQuarter = (quarter: string) => {
    if (!isValidQuarterKey(quarter)) return;
    const range = getQuarterRange(quarter);
    const parsed = parseMonthKey(range.startDate.slice(0, 7));
    updateFilter({
      ...filter,
      mode: "quarter",
      selectedMonth: range.startDate.slice(0, 7),
      selectedQuarter: quarter,
      selectedYear: parsed.selectedYear,
    });
  };

  const setSelectedYearFilter = (year: number) => {
    if (!Number.isFinite(year)) return;
    updateFilter({
      ...filter,
      mode: "year",
      selectedMonth: `${year}-01`,
      selectedQuarter: `${year}-Q1`,
      selectedYear: year,
    });
  };

  const setCustomRange = (startDate: string, endDate: string) => {
    if (!isValidDate(startDate) || !isValidDate(endDate)) return;
    const safeStart = startDate <= endDate ? startDate : endDate;
    const safeEnd = startDate <= endDate ? endDate : startDate;
    const parsed = parseMonthKey(safeStart.slice(0, 7));

    updateFilter({
      ...filter,
      mode: "custom",
      selectedMonth: safeStart.slice(0, 7),
      selectedQuarter: toQuarterKey(safeStart.slice(0, 7)),
      selectedYear: parsed.selectedYear,
      customStart: safeStart,
      customEnd: safeEnd,
    });
  };

  const value = useMemo<DateFilterContextValue>(() => {
    const parsed = parseMonthKey(filter.selectedMonth);

    return {
      filterMode: filter.mode,
      setFilterMode,
      selectedMonth: filter.selectedMonth,
      selectedYear: filter.selectedYear,
      selectedMonthNumber: parsed.selectedMonthNumber,
      selectedQuarter: filter.selectedQuarter,
      customStart: filter.customStart,
      customEnd: filter.customEnd,
      setSelectedMonth,
      setSelectedQuarter,
      setSelectedYearFilter,
      setCustomRange,
      monthLabel: formatMonthLabel(filter.selectedMonth),
      filterLabel: getFilterLabel(filter),
      dateRange: getFilterRange(filter),
      months12: buildMonths12(filter.selectedMonth),
      quarters8: buildQuarters8(filter.selectedMonth),
      years5: buildYears5(filter.selectedMonth),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <DateFilterContext.Provider value={value}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const context = useContext(DateFilterContext);

  if (context) return context;

  const fallback = getDefaultStoredFilter();
  const parsed = parseMonthKey(fallback.selectedMonth);

  return {
    filterMode: fallback.mode,
    setFilterMode: () => {},
    selectedMonth: fallback.selectedMonth,
    selectedYear: fallback.selectedYear,
    selectedMonthNumber: parsed.selectedMonthNumber,
    selectedQuarter: fallback.selectedQuarter,
    customStart: fallback.customStart,
    customEnd: fallback.customEnd,
    setSelectedMonth: () => {},
    setSelectedQuarter: () => {},
    setSelectedYearFilter: () => {},
    setCustomRange: () => {},
    monthLabel: formatMonthLabel(fallback.selectedMonth),
    filterLabel: getFilterLabel(fallback),
    dateRange: getFilterRange(fallback),
    months12: buildMonths12(fallback.selectedMonth),
    quarters8: buildQuarters8(fallback.selectedMonth),
    years5: buildYears5(fallback.selectedMonth),
  } satisfies DateFilterContextValue;
}
