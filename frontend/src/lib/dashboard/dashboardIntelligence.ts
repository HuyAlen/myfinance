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
    if (!transaction.categoryId || !categoriesById.has(transaction.categoryId)) {
      addReason(transaction.id, "uncategorized");
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

  const end7 = new Date(today);
  end7.setDate(end7.getDate() + 7);
  const end30 = new Date(today);
  end30.setDate(end30.getDate() + 30);

  const deduped = new Map<string, RecurringForecastEvent>();
  for (const event of events) {
    const date = atStartOfDay(event.date);
    if (!date || date < today || date > end30) continue;
    const key = [
      date.toISOString().slice(0, 10),
      event.type,
      Math.round(Math.abs(Number(event.amount) || 0)),
      normalizeReviewText(event.categoryName),
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, event);
  }

  let income7 = 0;
  let expense7 = 0;
  let income30 = 0;
  let expense30 = 0;

  for (const event of deduped.values()) {
    const date = atStartOfDay(event.date)!;
    const amount = Math.abs(Number(event.amount) || 0);
    if (event.type === "income") income30 += amount;
    else expense30 += amount;

    if (date <= end7) {
      if (event.type === "income") income7 += amount;
      else expense7 += amount;
    }
  }

  return {
    eventCount30: deduped.size,
    income7,
    expense7,
    net7: income7 - expense7,
    income30,
    expense30,
    net30: income30 - expense30,
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
