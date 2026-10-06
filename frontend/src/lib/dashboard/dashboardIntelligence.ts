import { buildCashFlowForecast } from "@/src/lib/finance/cashFlowForecast";
import type {
  Category,
  Investment,
  InvestmentType,
  NetWorthSnapshot,
  Transaction,
} from "@/src/types/finance";

export type MonthlySpendingPaceStatus = "faster" | "on-track" | "slower";

export type MonthlySpendingPace =
  | { available: false }
  | {
      available: true;
      timeProgress: number;
      spendingProgress: number;
      paceDelta: number;
      idealSpendToDate: number;
      remainingBudget: number;
      status: MonthlySpendingPaceStatus;
    };

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildMonthlySpendingPace(input: {
  spent: number;
  budgetLimit: number;
  elapsedDays: number;
  daysInMonth: number;
}): MonthlySpendingPace {
  const budgetLimit = Math.max(0, Number(input.budgetLimit) || 0);
  const daysInMonth = Math.max(0, Number(input.daysInMonth) || 0);
  const elapsedDays = Math.max(0, Math.min(Number(input.elapsedDays) || 0, daysInMonth));

  if (budgetLimit <= 0 || daysInMonth <= 0 || elapsedDays <= 0) {
    return { available: false };
  }

  const spent = Math.max(0, Number(input.spent) || 0);
  const timeProgress = clampPercent((elapsedDays / daysInMonth) * 100);
  const spendingProgress = Math.max(0, Math.round((spent / budgetLimit) * 100));
  const paceDelta = spendingProgress - timeProgress;
  const status: MonthlySpendingPaceStatus =
    paceDelta > 5 ? "faster" : paceDelta < -5 ? "slower" : "on-track";

  return {
    available: true,
    timeProgress,
    spendingProgress,
    paceDelta,
    idealSpendToDate: Math.round((budgetLimit * elapsedDays) / daysInMonth),
    remainingBudget: Math.max(0, budgetLimit - spent),
    status,
  };
}

export type FinanceReviewReason =
  | "uncategorized"
  | "possible-duplicate"
  | "category-type-mismatch"
  | "unusual-expense";

export type FinanceReviewItem = {
  transactionId: string;
  title: string;
  amount: number;
  date: string;
  reasons: FinanceReviewReason[];
};

export type FinanceReviewInbox = {
  total: number;
  uncategorizedCount: number;
  duplicateCount: number;
  unusualExpenseCount: number;
  items: FinanceReviewItem[];
};

function transactionDayKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeReviewText(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildFinanceReviewInbox(input: {
  transactions: Transaction[];
  categories: Category[];
  limit?: number;
}): FinanceReviewInbox {
  const limit = Math.max(1, input.limit ?? 5);
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const ordinary = input.transactions.filter(
    (transaction) =>
      (transaction.type === "income" || transaction.type === "expense") &&
      Number(transaction.amount) > 0,
  );

  const reasonsById = new Map<string, Set<FinanceReviewReason>>();
  const addReason = (id: string, reason: FinanceReviewReason) => {
    const existing = reasonsById.get(id) ?? new Set<FinanceReviewReason>();
    existing.add(reason);
    reasonsById.set(id, existing);
  };

  for (const transaction of ordinary) {
    const category = transaction.categoryId
      ? categoriesById.get(transaction.categoryId)
      : undefined;
    if (!category) {
      addReason(transaction.id, "uncategorized");
    } else if (category.type !== transaction.type) {
      addReason(transaction.id, "category-type-mismatch");
    }
  }

  const duplicateGroups = new Map<string, Transaction[]>();
  for (const transaction of ordinary) {
    const key = [
      transaction.type,
      Math.round(Number(transaction.amount) || 0),
      transaction.walletId || "",
      transaction.categoryId || "",
      transactionDayKey(transaction.date),
      normalizeReviewText(transaction.note),
    ].join("|");
    const group = duplicateGroups.get(key) ?? [];
    group.push(transaction);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    for (const transaction of group) addReason(transaction.id, "possible-duplicate");
  }

  const expenses = ordinary.filter((transaction) => transaction.type === "expense");
  if (expenses.length >= 5) {
    const baselineMedian = median(expenses.map((transaction) => Number(transaction.amount) || 0));
    const unusualThreshold = Math.max(500_000, baselineMedian * 3);
    for (const transaction of expenses) {
      if (Number(transaction.amount) >= unusualThreshold) {
        addReason(transaction.id, "unusual-expense");
      }
    }
  }

  const priority: Record<FinanceReviewReason, number> = {
    "category-type-mismatch": 4,
    "possible-duplicate": 3,
    uncategorized: 2,
    "unusual-expense": 1,
  };

  const allItems = ordinary
    .filter((transaction) => reasonsById.has(transaction.id))
    .map((transaction) => {
      const reasons = [...(reasonsById.get(transaction.id) ?? [])].sort(
        (a, b) => priority[b] - priority[a],
      );
      const category = categoriesById.get(transaction.categoryId);
      return {
        transactionId: transaction.id,
        title: transaction.note?.trim() || category?.name || "Giao dịch",
        amount: Math.abs(Number(transaction.amount) || 0),
        date: transaction.date,
        reasons,
      } satisfies FinanceReviewItem;
    })
    .sort((a, b) => {
      const aPriority = Math.max(...a.reasons.map((reason) => priority[reason]));
      const bPriority = Math.max(...b.reasons.map((reason) => priority[reason]));
      if (aPriority !== bPriority) return bPriority - aPriority;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  return {
    total: allItems.length,
    uncategorizedCount: allItems.filter((item) => item.reasons.includes("uncategorized")).length,
    duplicateCount: allItems.filter((item) => item.reasons.includes("possible-duplicate")).length,
    unusualExpenseCount: allItems.filter((item) => item.reasons.includes("unusual-expense")).length,
    items: allItems.slice(0, limit),
  };
}

export type RecurringForecastEvent = {
  id: string;
  amount: number;
  type: "income" | "expense";
  date: string | Date;
  categoryName?: string;
};

export type RecurringCashForecast = {
  eventCount30: number;
  income7: number;
  expense7: number;
  net7: number;
  income30: number;
  expense30: number;
  net30: number;
};

function atStartOfDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function buildRecurringCashForecast(
  events: RecurringForecastEvent[],
  todayInput: string | Date,
): RecurringCashForecast {
  const today = atStartOfDay(todayInput);
  if (!today) {
    return { eventCount30: 0, income7: 0, expense7: 0, net7: 0, income30: 0, expense30: 0, net30: 0 };
  }

  const end30 = new Date(today);
  end30.setDate(end30.getDate() + 30);
  const deduped = new Map<string, RecurringForecastEvent>();
  for (const event of events) {
    const date = atStartOfDay(event.date);
    if (!date || date < today || date > end30) continue;
    const key = [
      localDayKey(date),
      event.type,
      Math.round(Math.abs(Number(event.amount) || 0)),
      normalizeReviewText(event.categoryName),
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, event);
  }

  const forecast = buildCashFlowForecast({
    startingBalance: 0,
    events: [...deduped.values()],
    today,
    horizonDays: 30,
    checkpointDays: [7, 30],
  });
  const point7 = forecast.checkpoints.find((point) => point.days === 7);
  const point30 = forecast.checkpoints.find((point) => point.days === 30);

  return {
    eventCount30: forecast.eventCount,
    income7: point7?.scheduledIncome ?? 0,
    expense7: point7?.scheduledExpense ?? 0,
    net7: point7?.netScheduled ?? 0,
    income30: point30?.scheduledIncome ?? 0,
    expense30: point30?.scheduledExpense ?? 0,
    net30: point30?.netScheduled ?? 0,
  };
}
const INVESTMENT_LABELS: Record<InvestmentType | "forex", string> = {
  stock: "Cổ phiếu",
  crypto: "Crypto",
  fund: "Quỹ",
  gold: "Vàng",
  other: "Khác",
  forex: "Forex",
};

export type InvestmentAllocationBucket = {
  key: InvestmentType | "forex";
  label: string;
  value: number;
  percent: number;
};

export type InvestmentAllocationOverview = {
  total: number;
  buckets: InvestmentAllocationBucket[];
};

export function buildInvestmentAllocationOverview(input: {
  investments: Investment[];
  forexAssetValue: number;
}): InvestmentAllocationOverview {
  const totals = new Map<InvestmentType | "forex", number>();
  for (const investment of input.investments) {
    const value = Math.max(0, Number(investment.currentValue) || 0);
    totals.set(investment.type, (totals.get(investment.type) ?? 0) + value);
  }
  const forex = Math.max(0, Number(input.forexAssetValue) || 0);
  if (forex > 0) totals.set("forex", forex);

  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const buckets = [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      key,
      label: INVESTMENT_LABELS[key],
      value,
      percent: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return { total, buckets };
}

export type NetWorthAttributionItem = {
  key: "cash" | "savings" | "investments" | "forex" | "debt" | "other";
  label: string;
  delta: number;
};

export type NetWorthAttribution =
  | { available: false }
  | {
      available: true;
      fromMonth: string;
      toMonth: string;
      netWorthDelta: number;
      items: NetWorthAttributionItem[];
    };

function dedupeNetWorthSnapshots(snapshots: NetWorthSnapshot[]) {
  const byMonth = new Map<string, NetWorthSnapshot>();
  for (const snapshot of snapshots) {
    const existing = byMonth.get(snapshot.snapshotMonth);
    if (!existing || new Date(snapshot.capturedAt).getTime() >= new Date(existing.capturedAt).getTime()) {
      byMonth.set(snapshot.snapshotMonth, snapshot);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.snapshotMonth.localeCompare(b.snapshotMonth));
}

export function buildNetWorthAttribution(input: {
  snapshots: NetWorthSnapshot[];
  selectedYear: number;
  selectedMonth: number;
}): NetWorthAttribution {
  const maxMonth = `${input.selectedYear}-${String(input.selectedMonth).padStart(2, "0")}`;
  const eligible = dedupeNetWorthSnapshots(input.snapshots).filter(
    (snapshot) => snapshot.snapshotMonth <= maxMonth,
  );
  if (eligible.length < 2) return { available: false };

  const current = eligible[eligible.length - 1];
  const previous = eligible[eligible.length - 2];
  const items: NetWorthAttributionItem[] = [
    { key: "cash", label: "Thanh khoản", delta: current.cashAndWallets - previous.cashAndWallets },
    { key: "savings", label: "Tiết kiệm", delta: current.savings - previous.savings },
    { key: "investments", label: "Đầu tư", delta: current.investments - previous.investments },
    { key: "forex", label: "Forex", delta: current.forex - previous.forex },
    { key: "debt", label: "Nợ phải trả", delta: previous.totalDebt - current.totalDebt },
  ];

  const netWorthDelta = current.netWorth - previous.netWorth;
  const explained = items.reduce((sum, item) => sum + item.delta, 0);
  const residual = netWorthDelta - explained;
  if (Math.abs(residual) >= 1) {
    items.push({ key: "other", label: "Điều chỉnh khác", delta: residual });
  }

  return {
    available: true,
    fromMonth: previous.snapshotMonth,
    toMonth: current.snapshotMonth,
    netWorthDelta,
    items: items.filter((item) => Math.abs(item.delta) >= 1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };
}

// DASHBOARD-DECISION-INTELLIGENCE-2
// Pure decision helpers. They consume already-loaded SSOT data and never query,
// mutate or persist finance state.

export type RecurringScheduleInput = {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  nextRunDate: string | Date;
  recurrence?: "daily" | "weekly" | "monthly" | "yearly";
  categoryId?: string;
  categoryName?: string;
};

export type RecurringOccurrence = {
  id: string;
  scheduleId: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  date: Date;
  categoryId?: string;
  categoryName?: string;
};

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localMonthKey(date: Date) {
  return localDayKey(date).slice(0, 7);
}

function addMonthsClamped(date: Date, months: number, anchorDay: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, lastDay));
  target.setHours(0, 0, 0, 0);
  return target;
}

function addYearsClamped(date: Date, years: number, anchorMonth: number, anchorDay: number) {
  const target = new Date(date.getFullYear() + years, anchorMonth, 1);
  const lastDay = new Date(target.getFullYear(), anchorMonth + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, lastDay));
  target.setHours(0, 0, 0, 0);
  return target;
}

function nextRecurringDate(
  date: Date,
  recurrence: NonNullable<RecurringScheduleInput["recurrence"]>,
  anchorDay: number,
  anchorMonth: number,
) {
  if (recurrence === "daily") {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (recurrence === "weekly") {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (recurrence === "monthly") return addMonthsClamped(date, 1, anchorDay);
  return addYearsClamped(date, 1, anchorMonth, anchorDay);
}

export function expandRecurringScheduleOccurrences(
  schedules: RecurringScheduleInput[],
  todayInput: string | Date,
  horizonDays = 90,
): RecurringOccurrence[] {
  const today = atStartOfDay(todayInput);
  if (!today || horizonDays < 0) return [];
  const end = new Date(today);
  end.setDate(end.getDate() + horizonDays);
  const occurrences: RecurringOccurrence[] = [];

  for (const schedule of schedules) {
    const amount = Math.abs(Number(schedule.amount) || 0);
    let occurrence = atStartOfDay(schedule.nextRunDate);
    if (!occurrence || amount <= 0) continue;
    const anchorDay = occurrence.getDate();
    const anchorMonth = occurrence.getMonth();

    if (!schedule.recurrence) {
      if (occurrence >= today && occurrence <= end) {
        occurrences.push({
          id: `${schedule.id}:${localDayKey(occurrence)}`,
          scheduleId: schedule.id,
          title: schedule.title,
          amount,
          type: schedule.type,
          date: occurrence,
          categoryId: schedule.categoryId,
          categoryName: schedule.categoryName,
        });
      }
      continue;
    }

    let guard = 0;
    while (occurrence < today && guard < 500) {
      occurrence = nextRecurringDate(
        occurrence,
        schedule.recurrence,
        anchorDay,
        anchorMonth,
      );
      guard += 1;
    }
    while (occurrence <= end && guard < 1000) {
      occurrences.push({
        id: `${schedule.id}:${localDayKey(occurrence)}`,
        scheduleId: schedule.id,
        title: schedule.title,
        amount,
        type: schedule.type,
        date: new Date(occurrence),
        categoryId: schedule.categoryId,
        categoryName: schedule.categoryName,
      });
      occurrence = nextRecurringDate(
        occurrence,
        schedule.recurrence,
        anchorDay,
        anchorMonth,
      );
      guard += 1;
    }
  }

  const deduped = new Map<string, RecurringOccurrence>();
  for (const occurrence of occurrences) {
    const identity =
      occurrence.categoryId || normalizeReviewText(occurrence.categoryName);
    const key = [
      localDayKey(occurrence.date),
      occurrence.type,
      Math.round(occurrence.amount),
      identity,
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, occurrence);
  }

  return [...deduped.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

export type SafeToSpend =
  | { available: false; reason: "not-current-month" | "no-budget" }
  | {
      available: true;
      amount: number;
      spendableCash: number;
      budgetRemaining: number;
      budgetReservedForRecurring: number;
      recurringExpense: number;
      expectedRecurringIncome: number;
      budgetCapacity: number;
      liquidityCapacity: number;
      limitingConstraint: "budget" | "liquidity";
    };

export function buildSafeToSpend(input: {
  selectedMonthKey: string;
  today: string | Date;
  spendableCash: number;
  budgetConfigured: boolean;
  budgetRemaining: number;
  budgetedCategoryIds: string[];
  occurrences: RecurringOccurrence[];
}): SafeToSpend {
  const today = atStartOfDay(input.today);
  if (!today || input.selectedMonthKey !== localMonthKey(today)) {
    return { available: false, reason: "not-current-month" };
  }
  if (!input.budgetConfigured) {
    return { available: false, reason: "no-budget" };
  }

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  monthEnd.setHours(0, 0, 0, 0);
  const budgeted = new Set(input.budgetedCategoryIds);
  let recurringExpense = 0;
  let expectedRecurringIncome = 0;
  let budgetReservedForRecurring = 0;

  for (const occurrence of input.occurrences) {
    const date = atStartOfDay(occurrence.date);
    if (!date || date < today || date > monthEnd) continue;
    if (occurrence.type === "income") {
      expectedRecurringIncome += occurrence.amount;
      continue;
    }
    recurringExpense += occurrence.amount;
    if (occurrence.categoryId && budgeted.has(occurrence.categoryId)) {
      budgetReservedForRecurring += occurrence.amount;
    }
  }

  const spendableCash = Number(input.spendableCash) || 0;
  const budgetRemaining = Math.max(0, Number(input.budgetRemaining) || 0);
  const budgetCapacity = Math.max(
    0,
    budgetRemaining - budgetReservedForRecurring,
  );
  // Conservative by design: future recurring income is shown as context but
  // is never counted as spendable before it actually reaches a Wallet.
  const liquidityCapacity = Math.max(0, spendableCash - recurringExpense);
  const amount = Math.max(0, Math.min(budgetCapacity, liquidityCapacity));

  return {
    available: true,
    amount,
    spendableCash,
    budgetRemaining,
    budgetReservedForRecurring,
    recurringExpense,
    expectedRecurringIncome,
    budgetCapacity,
    liquidityCapacity,
    limitingConstraint:
      budgetCapacity <= liquidityCapacity ? "budget" : "liquidity",
  };
}

export type CashRunwayPoint = {
  days: 30 | 60 | 90;
  date: string;
  projectedBalance: number;
};

export type CashRunwayForecast = {
  startingBalance: number;
  eventCount90: number;
  points: CashRunwayPoint[];
  lowPointBalance: number;
  lowPointDate: string;
};

export function buildCashRunwayForecast(input: {
  startingBalance: number;
  occurrences: RecurringOccurrence[];
  today: string | Date;
}): CashRunwayForecast {
  const forecast = buildCashFlowForecast({
    startingBalance: input.startingBalance,
    events: input.occurrences,
    today: input.today,
    horizonDays: 90,
    checkpointDays: [30, 60, 90],
  });

  return {
    startingBalance: forecast.startingBalance,
    eventCount90: forecast.eventCount,
    points: forecast.checkpoints.map((point) => ({
      days: point.days as CashRunwayPoint["days"],
      date: point.date,
      projectedBalance: point.projectedBalance,
    })),
    lowPointBalance: forecast.lowPointBalance,
    lowPointDate: forecast.lowPointDate,
  };
}
export function countInvalidRecurringSchedules(input: {
  categories: Category[];
  transactions: Transaction[];
}) {
  const invalidCategories = input.categories.filter((category) => {
    if (!category.isRecurring) return false;
    const date = category.nextRunDate ? atStartOfDay(category.nextRunDate) : null;
    return !date || Number(category.defaultAmount ?? 0) <= 0;
  }).length;
  const invalidTransactions = input.transactions.filter((transaction) => {
    if (
      !transaction.isRecurring ||
      (transaction.type !== "income" && transaction.type !== "expense")
    ) {
      return false;
    }
    const date = transaction.nextRunDate
      ? atStartOfDay(transaction.nextRunDate)
      : null;
    return !date || Number(transaction.amount) <= 0;
  }).length;
  return invalidCategories + invalidTransactions;
}

export type FinanceDataHealthIssue = {
  key: "missing-category" | "possible-duplicate" | "recurring-config" | "net-worth-snapshot";
  title: string;
  detail: string;
  count: number;
};

export type FinanceDataHealth =
  | { available: false }
  | { available: true; issues: FinanceDataHealthIssue[] };

export function buildFinanceDataHealth(input: {
  selectedMonthKey: string;
  today: string | Date;
  reviewInbox: FinanceReviewInbox;
  netWorthSnapshots: NetWorthSnapshot[];
  invalidRecurringScheduleCount: number;
  hasFinancialData: boolean;
}): FinanceDataHealth {
  const today = atStartOfDay(input.today);
  if (!today || input.selectedMonthKey !== localMonthKey(today)) {
    return { available: false };
  }

  const issues: FinanceDataHealthIssue[] = [];
  if (input.reviewInbox.uncategorizedCount > 0) {
    issues.push({
      key: "missing-category",
      title: "Giao dịch thiếu category",
      detail: "Cần phân loại để Budget và báo cáo không bị thiếu ngữ cảnh.",
      count: input.reviewInbox.uncategorizedCount,
    });
  }
  if (input.reviewInbox.duplicateCount > 0) {
    issues.push({
      key: "possible-duplicate",
      title: "Giao dịch có thể bị trùng",
      detail: "Kiểm tra trước khi dùng số liệu cho forecast và closeout.",
      count: input.reviewInbox.duplicateCount,
    });
  }
  if (input.invalidRecurringScheduleCount > 0) {
    issues.push({
      key: "recurring-config",
      title: "Recurring chưa đủ cấu hình",
      detail: "Thiếu ngày chạy tiếp theo hoặc số tiền hợp lệ.",
      count: input.invalidRecurringScheduleCount,
    });
  }

  const hasCurrentSnapshot = input.netWorthSnapshots.some(
    (snapshot) => snapshot.snapshotMonth === input.selectedMonthKey,
  );
  if (input.hasFinancialData && today.getDate() >= 3 && !hasCurrentSnapshot) {
    issues.push({
      key: "net-worth-snapshot",
      title: "Chưa có snapshot Net Worth tháng này",
      detail: "Attribution sẽ chưa phản ánh tháng hiện tại cho tới khi có snapshot được lưu.",
      count: 0,
    });
  }

  return { available: true, issues };
}

export type MonthEndCloseout =
  | { visible: false }
  | {
      visible: true;
      mode: "closing" | "review";
      monthKey: string;
      budgetConfigured: boolean;
      budgetUsage: number;
      reviewPending: number;
      overBudgetCount: number;
      netCashMovement: number;
      netWorthDelta: number | null;
    };

function previousMonthKey(today: Date) {
  return localMonthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

export function buildMonthEndCloseout(input: {
  selectedMonthKey: string;
  today: string | Date;
  budgetConfigured: boolean;
  budgetUsage: number;
  reviewPending: number;
  overBudgetCount: number;
  netCashMovement: number;
  netWorthDelta: number | null;
}): MonthEndCloseout {
  const today = atStartOfDay(input.today);
  if (!today) return { visible: false };
  const currentKey = localMonthKey(today);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const isClosingWindow =
    input.selectedMonthKey === currentKey && lastDay - today.getDate() <= 4;
  const isReviewWindow =
    input.selectedMonthKey === previousMonthKey(today) && today.getDate() <= 3;
  if (!isClosingWindow && !isReviewWindow) return { visible: false };

  return {
    visible: true,
    mode: isClosingWindow ? "closing" : "review",
    monthKey: input.selectedMonthKey,
    budgetConfigured: input.budgetConfigured,
    budgetUsage: Math.max(0, Math.round(Number(input.budgetUsage) || 0)),
    reviewPending: Math.max(0, Math.round(Number(input.reviewPending) || 0)),
    overBudgetCount: Math.max(0, Math.round(Number(input.overBudgetCount) || 0)),
    netCashMovement: Number(input.netCashMovement) || 0,
    netWorthDelta:
      input.netWorthDelta === null ? null : Number(input.netWorthDelta) || 0,
  };
}
