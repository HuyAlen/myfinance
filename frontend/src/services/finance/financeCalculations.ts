import type {
  Category,
  Debt,
  Goal,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

export function getTotalAssets(wallets: Wallet[]) {
  return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
}

export function getTotalDebt(debts: Debt[]) {
  return debts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
}

export function getNetWorth(wallets: Wallet[], debts: Debt[]) {
  return getTotalAssets(wallets) - getTotalDebt(debts);
}

export function getTotalIncome(transactions: Transaction[]) {
  return transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalExpense(transactions: Transaction[]) {
  return transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getSavingRate(income: number, expense: number) {
  if (income <= 0) return 0;

  return Math.round(((income - expense) / income) * 1000) / 10;
}

export function getDebtRatio(totalDebt: number, totalAssets: number) {
  if (totalAssets <= 0) return 0;

  return Math.round((totalDebt / totalAssets) * 1000) / 10;
}

export function getGoalScore(goals: Goal[]) {
  if (goals.length === 0) return 0;

  const totalPercent = goals.reduce((sum, goal) => {
    return sum + Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  }, 0);

  return Math.round(totalPercent / goals.length);
}

export function getSpendingByCategory(
  transactions: Transaction[],
  categories: Category[],
) {
  const expenses = transactions.filter((item) => item.type === "expense");
  const totalExpense = getTotalExpense(transactions);

  return categories
    .filter((category) => category.type === "expense")
    .map((category) => {
      const total = expenses
        .filter((item) => item.categoryId === category.id)
        .reduce((sum, item) => sum + item.amount, 0);

      const percent =
        totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0;

      return {
        name: category.name,
        value: total,
        percent,
      };
    })
    .filter((item) => item.value > 0);
}

// ─── Monthly analytics helpers ────────────────────────────────────────────────

/** Returns the last `months` calendar months as YYYY-MM strings, oldest first */
function getLastMonthKeys(months: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
    );
  }
  return keys;
}

/** Month key (YYYY-MM) → Vietnamese short label "T1" … "T12" */
function monthLabel(key: string): string {
  return "T" + parseInt(key.split("-")[1], 10);
}

export interface MonthlyCashFlow {
  month: string; // YYYY-MM
  label: string; // "T1" … "T12"
  thu: number; // income in VND (transfers excluded)
  chi: number; // expense in VND (transfers excluded)
  tietKiem: number; // income − expense
}

/**
 * Builds real monthly cash-flow rows from actual transactions.
 * Transfer transactions are excluded from both income and expense.
 */
export function buildMonthlyCashFlowData(
  transactions: Transaction[],
  months = 6,
): MonthlyCashFlow[] {
  return getLastMonthKeys(months).map((key) => {
    const txns = transactions.filter((t) => t.date.startsWith(key));
    const thu = getTotalIncome(txns);
    const chi = getTotalExpense(txns);
    return {
      month: key,
      label: monthLabel(key),
      thu,
      chi,
      tietKiem: thu - chi,
    };
  });
}

export interface MonthlyNetWorth {
  month: string; // YYYY-MM
  label: string; // "T1" … "T12"
  value: number; // net worth in VND
}

/**
 * Reconstructs approximate monthly net-worth trend by walking backwards from
 * the current snapshot using transaction-derived monthly cash-flow deltas.
 *
 * Algorithm:
 *   netWorth[currentMonth] = currentNetWorth          (Supabase snapshot)
 *   netWorth[m−1]          = netWorth[m] − Δ[m]
 *   Δ[m] = income[m] − expense[m]   (transfers excluded)
 *
 * Anchoring to the real persisted wallet/investment/debt values ensures the
 * endpoint is always accurate; historical months are best-effort reconstructions.
 */
export function buildMonthlyNetWorthData(
  transactions: Transaction[],
  currentNetWorth: number,
  months = 6,
): MonthlyNetWorth[] {
  const keys = getLastMonthKeys(months);

  const deltas = keys.map((key) => {
    const txns = transactions.filter((t) => t.date.startsWith(key));
    return getTotalIncome(txns) - getTotalExpense(txns);
  });

  // Fill right-to-left: the last element is anchored to currentNetWorth
  const values = new Array<number>(months);
  values[months - 1] = currentNetWorth;
  for (let i = months - 2; i >= 0; i--) {
    values[i] = values[i + 1] - deltas[i + 1];
  }

  return keys.map((key, i) => ({
    month: key,
    label: monthLabel(key),
    value: values[i],
  }));
}
