import type {
  Category,
  RecurrenceFrequency,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export type RecurringMoneySource = "category" | "transaction";
export type RecurringMoneyIssue =
  | "missing-amount"
  | "missing-wallet"
  | "missing-wallet-reference"
  | "missing-category-reference"
  | "missing-recurrence"
  | "missing-next-date";

export type RecurringMoneySchedule = {
  id: string;
  source: RecurringMoneySource;
  sourceId: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  categoryName: string;
  walletId: string;
  walletName: string;
  recurrence?: RecurrenceFrequency;
  /** Persisted schedule anchor / last explicitly configured next date. */
  nextRunDate?: string;
  /** Derived first occurrence on/after the supplied reference calendar date. */
  effectiveNextRunDate?: string;
  enabled: boolean;
  legacy: boolean;
  issues: RecurringMoneyIssue[];
  shadowedSourceIds: string[];
};

function hasCategoryScheduleMetadata(category: Category) {
  return Boolean(
    category.isRecurring ||
      category.recurrence ||
      category.nextRunDate ||
      category.defaultWalletId ||
      Number(category.defaultAmount ?? 0) > 0,
  );
}

function hasTransactionScheduleMetadata(transaction: Transaction) {
  return Boolean(
    transaction.isRecurring || transaction.recurrence || transaction.nextRunDate,
  );
}

function scheduleIssues(input: {
  amount: number;
  walletId: string;
  walletExists: boolean;
  categoryExists: boolean;
  recurrence?: RecurrenceFrequency;
  nextRunDate?: string;
}): RecurringMoneyIssue[] {
  const issues: RecurringMoneyIssue[] = [];
  if (!(input.amount > 0)) issues.push("missing-amount");
  if (!input.walletId) issues.push("missing-wallet");
  else if (!input.walletExists) issues.push("missing-wallet-reference");
  if (!input.categoryExists) issues.push("missing-category-reference");
  if (!input.recurrence) issues.push("missing-recurrence");
  if (!input.nextRunDate) issues.push("missing-next-date");
  return issues;
}

type CalendarParts = {
  year: number;
  month: number;
  day: number;
};

function parseCalendarDate(value: string): CalendarParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return undefined;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return undefined;

  return { year, month, day };
}

function calendarDateKey(parts: CalendarParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function clampedCalendarDate(
  year: number,
  month: number,
  anchorDay: number,
): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return calendarDateKey({
    year,
    month,
    day: Math.min(anchorDay, lastDay),
  });
}

function calendarOrdinal(parts: CalendarParts) {
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000,
  );
}

/**
 * RECURRING-NEXT-RUN-ROLLFORWARD-1
 *
 * Returns the first real calendar occurrence on or after `referenceDate`.
 * `nextRunDate` remains the persisted anchor; callers use this derived value
 * for presentation, ordering and forecast without silently rewriting storage.
 *
 * Monthly/yearly schedules preserve the ORIGINAL anchor day/month across short
 * months (Jan 31 -> Feb 28 -> Mar 31; leap-day -> Feb 28 -> Feb 29 when valid).
 */
export function resolveEffectiveNextRunDate(
  nextRunDate: string | undefined,
  recurrence: RecurrenceFrequency | undefined,
  referenceDate: string,
): string | undefined {
  if (!nextRunDate || !recurrence) return nextRunDate;

  const anchor = parseCalendarDate(nextRunDate);
  const reference = parseCalendarDate(referenceDate);
  if (!anchor || !reference) return undefined;

  if (nextRunDate >= referenceDate) return nextRunDate;

  if (recurrence === "daily" || recurrence === "weekly") {
    const intervalDays = recurrence === "daily" ? 1 : 7;
    const elapsedDays = calendarOrdinal(reference) - calendarOrdinal(anchor);
    const steps = Math.max(0, Math.ceil(elapsedDays / intervalDays));
    const targetOrdinal = calendarOrdinal(anchor) + steps * intervalDays;
    const target = new Date(targetOrdinal * 86_400_000);
    return calendarDateKey({
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
    });
  }

  if (recurrence === "monthly") {
    let offset =
      (reference.year - anchor.year) * 12 +
      (reference.month - anchor.month);
    offset = Math.max(0, offset);

    let absoluteMonth = anchor.year * 12 + (anchor.month - 1) + offset;
    let year = Math.floor(absoluteMonth / 12);
    let month = (absoluteMonth % 12) + 1;
    let candidate = clampedCalendarDate(year, month, anchor.day);

    if (candidate < referenceDate) {
      absoluteMonth += 1;
      year = Math.floor(absoluteMonth / 12);
      month = (absoluteMonth % 12) + 1;
      candidate = clampedCalendarDate(year, month, anchor.day);
    }

    return candidate;
  }

  let targetYear = Math.max(anchor.year, reference.year);
  let candidate = clampedCalendarDate(
    targetYear,
    anchor.month,
    anchor.day,
  );
  if (candidate < referenceDate) {
    targetYear += 1;
    candidate = clampedCalendarDate(
      targetYear,
      anchor.month,
      anchor.day,
    );
  }
  return candidate;
}
function exactMirrorKey(schedule: RecurringMoneySchedule) {
  return [
    schedule.type,
    Math.round(schedule.amount),
    schedule.categoryId,
    schedule.walletId,
    schedule.recurrence ?? "",
    schedule.nextRunDate ?? "",
  ].join("|");
}

/**
 * RECURRING-MONEY-MANAGER-1
 *
 * Canonical read model for recurring money. Category-backed schedules are the
 * preferred source because they are pure schedule definitions and do not imply
 * that a wallet mutation already happened. Legacy transaction-backed schedules
 * remain readable/editable for compatibility. If a legacy schedule is an
 * exact mirror of a valid category schedule, the category schedule is the
 * authority even while paused; only it is emitted and the hidden source id is
 * attached as provenance. This prevents a paused category schedule from being
 * silently reactivated by an old transaction mirror and prevents Dashboard
 * Safe-to-Spend/Runway from double-counting the same bill.
 */
export function buildRecurringMoneySchedules(input: {
  categories: Category[];
  transactions: Transaction[];
  wallets: Wallet[];
  referenceDate?: string;
}): RecurringMoneySchedule[] {
  const categoriesById = new Map(input.categories.map((item) => [item.id, item]));
  const walletsById = new Map(input.wallets.map((item) => [item.id, item]));

  const categorySchedules: RecurringMoneySchedule[] = input.categories
    .filter(hasCategoryScheduleMetadata)
    .filter((category) => category.type === "income" || category.type === "expense")
    .map((category) => {
      const amount = Math.abs(Number(category.defaultAmount ?? 0));
      const walletId = category.defaultWalletId ?? "";
      return {
        id: `category-${category.id}`,
        source: "category" as const,
        sourceId: category.id,
        title: category.name,
        type: category.type,
        amount,
        categoryId: category.id,
        categoryName: category.name,
        walletId,
        walletName: walletsById.get(walletId)?.name ?? "Chưa chọn ví",
        recurrence: category.recurrence,
        nextRunDate: category.nextRunDate,
        effectiveNextRunDate: input.referenceDate
          ? resolveEffectiveNextRunDate(
              category.nextRunDate,
              category.recurrence,
              input.referenceDate,
            )
          : category.nextRunDate,
        enabled: category.isRecurring === true,
        legacy: false,
        issues: scheduleIssues({
          amount,
          walletId,
          walletExists: walletId ? walletsById.has(walletId) : false,
          categoryExists: true,
          recurrence: category.recurrence,
          nextRunDate: category.nextRunDate,
        }),
        shadowedSourceIds: [],
      };
    });

  const categoryMirrorIndex = new Map<string, RecurringMoneySchedule>();
  for (const schedule of categorySchedules) {
    if (schedule.issues.length === 0) {
      categoryMirrorIndex.set(exactMirrorKey(schedule), schedule);
    }
  }

  const legacySchedules: RecurringMoneySchedule[] = [];
  for (const transaction of input.transactions) {
    if (!hasTransactionScheduleMetadata(transaction)) continue;
    if (transaction.type !== "income" && transaction.type !== "expense") continue;

    const category = categoriesById.get(transaction.categoryId);
    const amount = Math.abs(Number(transaction.amount ?? 0));
    const walletId = transaction.walletId ?? "";
    const schedule: RecurringMoneySchedule = {
      id: `transaction-${transaction.id}`,
      source: "transaction",
      sourceId: transaction.id,
      title: transaction.note?.trim() || category?.name || "Giao dịch định kỳ",
      type: transaction.type,
      amount,
      categoryId: transaction.categoryId ?? "",
      categoryName: category?.name ?? "Chưa phân loại",
      walletId,
      walletName: walletsById.get(walletId)?.name ?? "Không tìm thấy ví",
      recurrence: transaction.recurrence,
      nextRunDate: transaction.nextRunDate,
      effectiveNextRunDate: input.referenceDate
        ? resolveEffectiveNextRunDate(
            transaction.nextRunDate,
            transaction.recurrence,
            input.referenceDate,
          )
        : transaction.nextRunDate,
      enabled: transaction.isRecurring === true,
      legacy: true,
      issues: scheduleIssues({
        amount,
        walletId,
        walletExists: walletId ? walletsById.has(walletId) : false,
        categoryExists: Boolean(category),
        recurrence: transaction.recurrence,
        nextRunDate: transaction.nextRunDate,
      }),
      shadowedSourceIds: [],
    };

    const mirror =
      schedule.issues.length === 0
        ? categoryMirrorIndex.get(exactMirrorKey(schedule))
        : undefined;
    if (mirror) {
      mirror.shadowedSourceIds.push(transaction.id);
      continue;
    }
    legacySchedules.push(schedule);
  }

  return [...categorySchedules, ...legacySchedules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const aDate =
      a.effectiveNextRunDate ?? a.nextRunDate ?? "9999-12-31";
    const bDate =
      b.effectiveNextRunDate ?? b.nextRunDate ?? "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
    return a.title.localeCompare(b.title, "vi");
  });
}

/** Forecast-safe projection: only enabled and fully valid schedules may feed
 * Safe-to-Spend / runway / upcoming cash calculations. */
export function toRecurringScheduleInputs(schedules: RecurringMoneySchedule[]) {
  return schedules
    .filter((schedule) => schedule.enabled && schedule.issues.length === 0)
    .map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      amount: schedule.amount,
      type: schedule.type,
      nextRunDate:
        schedule.effectiveNextRunDate ?? schedule.nextRunDate!,
      recurrence: schedule.recurrence,
      categoryId: schedule.categoryId,
      categoryName: schedule.categoryName,
    }));
}

export function getRecurringIssueLabel(issue: RecurringMoneyIssue) {
  switch (issue) {
    case "missing-amount":
      return "Thiếu số tiền";
    case "missing-wallet":
      return "Thiếu ví";
    case "missing-wallet-reference":
      return "Ví không còn tồn tại";
    case "missing-category-reference":
      return "Danh mục không còn tồn tại";
    case "missing-recurrence":
      return "Thiếu tần suất";
    case "missing-next-date":
      return "Thiếu ngày chạy tiếp";
  }
}
