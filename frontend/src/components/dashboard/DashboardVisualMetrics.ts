type Expense = { name: string; value: number };
type WalletShare = { id: string; name: string; balance: number; sharePercent: number };
type BudgetValue = { spent: number; limit: number };

/** Two proportional columns: tile area is precisely the category's fraction. */
export function getDashboardExpenseMosaicColumns(items: Expense[]) {
  const positive = items.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return [];
  const columnGroups = positive.length < 3 ? [positive] : [positive.slice(0, 2), positive.slice(2)];
  return columnGroups.filter((group) => group.length).map((group) => {
    const columnTotal = group.reduce((sum, item) => sum + item.value, 0);
    return {
      widthPercent: (columnTotal / total) * 100,
      tiles: group.map((item) => ({
        ...item,
        heightPercent: (item.value / columnTotal) * 100,
        sharePercent: (item.value / total) * 100,
      })),
    };
  });
}

/** Shared scale allows users to visually compare a 446% overage to a 110% one. */
export function getDashboardBudgetScale(rows: BudgetValue[]) {
  const max = rows.reduce((current, row) => {
    if (!Number.isFinite(row.spent) || !Number.isFinite(row.limit) || row.spent < 0 || row.limit <= 0) return current;
    return Math.max(current, (row.spent / row.limit) * 100);
  }, 100);
  return Math.ceil(max / 50) * 50;
}

export function getDashboardBudgetBand(row: BudgetValue, scale: number) {
  const hasLimit = Number.isFinite(row.limit) && row.limit > 0;
  if (!hasLimit) {
    return {
      hasLimit: false,
      markerPercent: 0,
      basePercent: 0,
      excessPercent: 0,
    };
  }
  const percent = Number.isFinite(row.spent) ? Math.max(0, (row.spent / row.limit) * 100) : 0;
  return {
    hasLimit,
    markerPercent: (100 / scale) * 100,
    basePercent: (Math.min(100, percent) / scale) * 100,
    excessPercent: (Math.max(0, percent - 100) / scale) * 100,
  };
}

export function getDashboardWalletDistribution(rows: WalletShare[], maxWallets = 5) {
  const positive = rows.filter((row) => Number.isFinite(row.balance) && row.balance > 0);
  if (positive.length <= maxWallets) return positive;
  const head = positive.slice(0, maxWallets);
  const tail = positive.slice(maxWallets);
  return [...head, {
    id: "dashboard-wallet-other",
    name: "Ví khác",
    balance: tail.reduce((sum, row) => sum + row.balance, 0),
    sharePercent: tail.reduce((sum, row) => sum + row.sharePercent, 0),
  }];
}

/** Only observed operating-flow months count; unavailable future months are null. */
export function getDashboardObservedCashFlowTotals(
  data: { label?: string; cashIn: number | null; cashOut: number | null; netCashMovement: number | null }[],
) {
  const observed = data.filter((row) =>
    [row.cashIn, row.cashOut, row.netCashMovement].some(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
  if (observed.length === 0) return null;
  const sum = (key: "cashIn" | "cashOut" | "netCashMovement") => {
    const values = observed.map((row) => row[key]).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
  };
  return { cashIn: sum("cashIn"), cashOut: sum("cashOut"), netCashMovement: sum("netCashMovement") };
}
