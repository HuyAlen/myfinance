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
  nextRunDate?: string;
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
    const aDate = a.nextRunDate ?? "9999-12-31";
    const bDate = b.nextRunDate ?? "9999-12-31";
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
      nextRunDate: schedule.nextRunDate!,
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
