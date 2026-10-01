export const MONTH_END_REVIEW_HISTORY_STORAGE_KEY =
  "myfinance:month-end-review-history-v1";

export const MONTH_END_REVIEW_HISTORY_MAX_MONTHS = 24;

export type MonthEndReviewHistoryRecord = {
  version: 1;
  monthKey: string;
  savedAt: string;
  budgetConfigured: boolean;
  budgetUsage: number;
  reviewPending: number;
  overBudgetCount: number;
  netCashMovement: number;
  netWorthDelta: number | null;
};

type MonthEndReviewSnapshotInput = {
  monthKey: string;
  budgetConfigured: boolean;
  budgetUsage: number;
  reviewPending: number;
  overBudgetCount: number;
  netCashMovement: number;
  netWorthDelta: number | null;
};

function isValidMonthKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function normalizeFinite(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeCount(value: unknown) {
  return Math.max(0, Math.round(normalizeFinite(value)));
}

function normalizeBudgetUsage(value: unknown) {
  return Math.max(0, Math.round(normalizeFinite(value)));
}

function normalizeSavedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseRecord(value: unknown): MonthEndReviewHistoryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !isValidMonthKey(candidate.monthKey)) {
    return null;
  }
  const savedAt = normalizeSavedAt(candidate.savedAt);
  if (!savedAt) return null;

  return {
    version: 1,
    monthKey: candidate.monthKey,
    savedAt,
    budgetConfigured: candidate.budgetConfigured === true,
    budgetUsage: normalizeBudgetUsage(candidate.budgetUsage),
    reviewPending: normalizeCount(candidate.reviewPending),
    overBudgetCount: normalizeCount(candidate.overBudgetCount),
    netCashMovement: normalizeFinite(candidate.netCashMovement),
    netWorthDelta:
      candidate.netWorthDelta === null || candidate.netWorthDelta === undefined
        ? null
        : normalizeFinite(candidate.netWorthDelta),
  };
}

function sortNewestMonthFirst(
  records: MonthEndReviewHistoryRecord[],
): MonthEndReviewHistoryRecord[] {
  return [...records].sort((a, b) => {
    const monthDiff = b.monthKey.localeCompare(a.monthKey);
    if (monthDiff !== 0) return monthDiff;
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });
}

export function createMonthEndReviewHistoryRecord(
  input: MonthEndReviewSnapshotInput,
  savedAt: Date = new Date(),
): MonthEndReviewHistoryRecord {
  if (!isValidMonthKey(input.monthKey)) {
    throw new Error("Invalid month key for month-end review history");
  }

  return {
    version: 1,
    monthKey: input.monthKey,
    savedAt: savedAt.toISOString(),
    budgetConfigured: input.budgetConfigured === true,
    budgetUsage: normalizeBudgetUsage(input.budgetUsage),
    reviewPending: normalizeCount(input.reviewPending),
    overBudgetCount: normalizeCount(input.overBudgetCount),
    netCashMovement: normalizeFinite(input.netCashMovement),
    netWorthDelta:
      input.netWorthDelta === null ? null : normalizeFinite(input.netWorthDelta),
  };
}

export function parseMonthEndReviewHistory(
  raw: string | null | undefined,
): MonthEndReviewHistoryRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const latestByMonth = new Map<string, MonthEndReviewHistoryRecord>();
    for (const value of parsed) {
      const record = parseRecord(value);
      if (!record) continue;
      const existing = latestByMonth.get(record.monthKey);
      if (
        !existing ||
        new Date(record.savedAt).getTime() > new Date(existing.savedAt).getTime()
      ) {
        latestByMonth.set(record.monthKey, record);
      }
    }

    return sortNewestMonthFirst([...latestByMonth.values()]).slice(
      0,
      MONTH_END_REVIEW_HISTORY_MAX_MONTHS,
    );
  } catch {
    return [];
  }
}

export function upsertMonthEndReviewHistory(
  history: readonly MonthEndReviewHistoryRecord[],
  record: MonthEndReviewHistoryRecord,
  maxMonths = MONTH_END_REVIEW_HISTORY_MAX_MONTHS,
): MonthEndReviewHistoryRecord[] {
  const safeMax = Math.max(1, Math.round(maxMonths));
  const next = history.filter((item) => item.monthKey !== record.monthKey);
  next.push(record);
  return sortNewestMonthFirst(next).slice(0, safeMax);
}

export function getMonthEndReviewAttentionCount(
  record: MonthEndReviewHistoryRecord,
) {
  return (
    record.reviewPending +
    record.overBudgetCount +
    (record.budgetConfigured ? 0 : 1)
  );
}

export function readMonthEndReviewHistory() {
  if (typeof window === "undefined") return [];
  try {
    return parseMonthEndReviewHistory(
      window.localStorage.getItem(MONTH_END_REVIEW_HISTORY_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

export function persistMonthEndReviewHistory(
  history: readonly MonthEndReviewHistoryRecord[],
) {
  if (typeof window === "undefined") return false;
  try {
    const normalized = sortNewestMonthFirst([...history]).slice(
      0,
      MONTH_END_REVIEW_HISTORY_MAX_MONTHS,
    );
    window.localStorage.setItem(
      MONTH_END_REVIEW_HISTORY_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    return true;
  } catch {
    // Review history is derived UX metadata. Financial ledger correctness
    // must never depend on browser storage availability.
    return false;
  }
}
