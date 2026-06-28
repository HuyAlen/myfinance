"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "myfinance_date_filter_v2";
const LEGACY_MONTH_KEY = "myfinance_selected_month";

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
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function isValidQuarterKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-Q[1-4]$/.test(value));
}

function isValidDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
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
    mode: raw.mode ?? "month",
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

  if (isValidDate(customStart) && isValidDate(customEnd)) {
    const safeStart = customStart <= customEnd ? customStart : customEnd;
    const safeEnd = customStart <= customEnd ? customEnd : customStart;
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

  try {
    const urlFilter = getFilterFromUrl();
    if (urlFilter) {
      return normalizeFilter(urlFilter);
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
