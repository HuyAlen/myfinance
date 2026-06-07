import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export function formatVND(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return (
    new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    }).format(normalized) + " \u0111"
  );
}

export function getFinancialGrade(score: number) {
  if (score >= 90) {
    return {
      grade: "A+",
      label: "Xuất sắc",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      ring: "ring-emerald-100",
      gradient: "from-emerald-500 to-teal-400",
    };
  }

  if (score >= 80) {
    return {
      grade: "A",
      label: "Rất tốt",
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-100",
      ring: "ring-green-100",
      gradient: "from-green-500 to-emerald-400",
    };
  }

  if (score >= 70) {
    return {
      grade: "B",
      label: "Tốt",
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      ring: "ring-blue-100",
      gradient: "from-blue-500 to-sky-400",
    };
  }

  if (score >= 60) {
    return {
      grade: "C",
      label: "Khá",
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      ring: "ring-amber-100",
      gradient: "from-amber-400 to-orange-400",
    };
  }

  if (score >= 50) {
    return {
      grade: "D",
      label: "Cần cải thiện",
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-100",
      ring: "ring-orange-100",
      gradient: "from-orange-500 to-amber-400",
    };
  }

  return {
    grade: "F",
    label: "Nguy cơ cao",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
    ring: "ring-rose-100",
    gradient: "from-rose-500 to-red-600",
  };
}

export function getTotalAssets(wallets: Wallet[]) {
  return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
}

export function getTotalDebt(debts: Debt[]) {
  return debts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
}

export function getTotalInvestmentValue(investments: Investment[]) {
  return investments.reduce((sum, item) => sum + item.currentValue, 0);
}

export function getNetWorth(
  wallets: Wallet[],
  debts: Debt[],
  investments: Investment[] = [],
) {
  return (
    getTotalAssets(wallets) +
    getTotalInvestmentValue(investments) -
    getTotalDebt(debts)
  );
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

  const progressScore = goals.reduce((sum, goal) => {
    if (goal.targetAmount <= 0) return sum;
    return sum + Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  }, 0);

  return Math.round(progressScore / goals.length);
}

export function getMonthlyExpenseEstimate(
  transactions: Transaction[],
  months = 6,
) {
  const expenseTransactions = transactions.filter(
    (item) => item.type === "expense",
  );

  if (expenseTransactions.length === 0) return 0;

  const monthKeys = new Set(
    expenseTransactions
      .map((transaction) => transaction.date.slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month)),
  );

  const divisor = Math.max(1, Math.min(months, monthKeys.size || months));
  const totalExpense = expenseTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  return totalExpense / divisor;
}

export function getEmergencyMonths(
  liquidBalance: number,
  monthlyExpense: number,
) {
  if (monthlyExpense <= 0) return 0;

  const months = liquidBalance / monthlyExpense;
  return Math.max(0, Math.round(months * 10) / 10);
}

export function getEmergencyScore(emergencyMonths: number) {
  if (emergencyMonths <= 0) return 0;
  if (emergencyMonths >= 6) return 100;

  return Math.round((emergencyMonths / 6) * 100);
}

export function getDebtScore(totalDebt: number, totalAssets: number) {
  if (totalDebt <= 0) return 100;
  if (totalAssets <= 0) return 0;

  const debtRatio = totalDebt / totalAssets;

  if (debtRatio <= 0.2) return 90;
  if (debtRatio <= 0.35) return 75;
  if (debtRatio <= 0.5) return 55;

  return 30;
}

export function getSavingScore(savingRate: number) {
  if (savingRate <= 0) return 0;
  if (savingRate >= 40) return 100;

  return Math.round((savingRate / 40) * 100);
}

export function getFinancialHealthScore(input: {
  savingRate: number;
  totalDebt: number;
  totalAssets: number;
  emergencyMonths: number;
  goalScore: number;
}) {
  const savingScore = getSavingScore(input.savingRate);
  const debtScore = getDebtScore(input.totalDebt, input.totalAssets);
  const emergencyScore = getEmergencyScore(input.emergencyMonths);

  return Math.round(
    savingScore * 0.3 +
      debtScore * 0.25 +
      emergencyScore * 0.25 +
      input.goalScore * 0.2,
  );
}

export function getSpendingByCategory(
  transactions: Transaction[],
  categories: Category[],
) {
  return buildCategorySpendingData(transactions, categories);
}

export interface DashboardSummary {
  walletAssets: number;
  investmentAssets: number;
  investedAmount: number;
  investmentPL: number;
  investmentReturn: number;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  liquidBalance: number;
  income: number;
  expense: number;
  monthlyExpense: number;
  saving: number;
  savingRate: number;
  debtRatio: number;
  goalScore: number;
  emergencyMonths: number;
  financialHealthScore: number;
}

export function calculateDashboardSummary(input: {
  wallets: Wallet[];
  investments: Investment[];
  debts: Debt[];
  transactions: Transaction[];
  goals: Goal[];
}): DashboardSummary {
  const walletAssets = getTotalAssets(input.wallets);
  const investmentAssets = getTotalInvestmentValue(input.investments);
  const investedAmount = input.investments.reduce(
    (sum, item) => sum + item.investedAmount,
    0,
  );
  const totalAssets = walletAssets + investmentAssets;
  const totalDebt = getTotalDebt(input.debts);
  const income = getTotalIncome(input.transactions);
  const expense = getTotalExpense(input.transactions);
  const monthlyExpense = getMonthlyExpenseEstimate(input.transactions);
  const saving = income - expense;
  const investmentPL = investmentAssets - investedAmount;
  const liquidBalance = input.wallets
    .filter((wallet) => wallet.type !== "investment")
    .reduce((sum, wallet) => sum + wallet.balance, 0);

  return {
    walletAssets,
    investmentAssets,
    investedAmount,
    investmentPL,
    investmentReturn:
      investedAmount > 0
        ? Math.round((investmentPL / investedAmount) * 1000) / 10
        : 0,
    totalAssets,
    totalDebt,
    netWorth: walletAssets + investmentAssets - totalDebt,
    liquidBalance,
    income,
    expense,
    monthlyExpense,
    saving,
    savingRate: getSavingRate(income, expense),
    debtRatio: getDebtRatio(totalDebt, totalAssets),
    goalScore: getGoalScore(input.goals),
    emergencyMonths: getEmergencyMonths(liquidBalance, monthlyExpense),
    financialHealthScore: getFinancialHealthScore({
      savingRate: getSavingRate(income, expense),
      totalDebt,
      totalAssets,
      emergencyMonths: getEmergencyMonths(liquidBalance, monthlyExpense),
      goalScore: getGoalScore(input.goals),
    }),
  };
}

export interface CategorySpending {
  id: string;
  name: string;
  value: number;
  percent: number;
}

export function buildCategorySpendingData(
  transactions: Transaction[],
  categories: Category[],
): CategorySpending[] {
  const expenseTransactions = transactions.filter(
    (item) => item.type === "expense",
  );
  const totalExpense = expenseTransactions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const totals = new Map<string, { id: string; name: string; value: number }>();

  for (const transaction of expenseTransactions) {
    const category = categoryById.get(transaction.categoryId);
    const id = category?.id ?? "__uncategorized__";
    const name = category?.name ?? "Khac";
    const current = totals.get(id) ?? { id, name, value: 0 };
    current.value += transaction.amount;
    totals.set(id, current);
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      percent:
        totalExpense > 0 ? Math.round((item.value / totalExpense) * 100) : 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
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
    const thu = txns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const chi = txns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
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
  input:
    | {
        wallets: Wallet[];
        investments: Investment[];
        debts: Debt[];
        transactions: Transaction[];
        months?: number;
      }
    | Transaction[],
  legacyCurrentNetWorth?: number,
  legacyMonths = 6,
): MonthlyNetWorth[] {
  const isLegacyCall = Array.isArray(input);
  const transactions = isLegacyCall ? input : input.transactions;
  const currentNetWorth = isLegacyCall
    ? (legacyCurrentNetWorth ?? 0)
    : getNetWorth(input.wallets, input.debts, input.investments);
  const months = isLegacyCall ? legacyMonths : (input.months ?? 6);
  const keys = getLastMonthKeys(months);

  const deltas = keys.map((key) => {
    const txns = transactions.filter((t) => t.date.startsWith(key));
    const income = txns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = txns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return income - expense;
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

export type DashboardActionTone = "danger" | "warning" | "good";
export type DashboardActionIcon =
  | "alert"
  | "savings"
  | "shield"
  | "debt"
  | "bank"
  | "emergency"
  | "investment"
  | "goal"
  | "budget";

export interface DashboardAction {
  icon: DashboardActionIcon;
  title: string;
  body: string;
  tone: DashboardActionTone;
  ctaLabel?: string;
  ctaRoute?: string;
}

export function generateDashboardActions(input: {
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  goals: Goal[];
  debts: Debt[];
  investments: Investment[];
  categories: Category[];
  summary?: DashboardSummary;
}): DashboardAction[] {
  const summary =
    input.summary ??
    calculateDashboardSummary({
      wallets: input.wallets,
      investments: input.investments,
      debts: input.debts,
      transactions: input.transactions,
      goals: input.goals,
    });
  const actions: DashboardAction[] = [];
  const hasFinancialData =
    input.transactions.length > 0 ||
    input.wallets.length > 0 ||
    input.debts.length > 0 ||
    input.investments.length > 0 ||
    input.goals.length > 0 ||
    input.budgets.length > 0;

  if (!hasFinancialData) {
    return [
      {
        icon: "alert",
        title: "Chua co du lieu tai chinh",
        body: "Dashboard se dua ra hanh dong uu tien sau khi co vi, giao dich, no, dau tu, muc tieu hoac ngan sach thuc te.",
        tone: "warning",
        ctaLabel: "Thêm giao dịch",
        ctaRoute: "/transactions",
      },
    ];
  }

  if (summary.income > 0) {
    if (summary.savingRate < 20) {
      actions.push({
        icon: "alert",
        title: "Ty le tiet kiem thap",
        body: `Ban dang tiet kiem ${summary.savingRate}% thu nhap. Chi tieu thuc te la ${formatVND(summary.expense)} tren thu nhap ${formatVND(summary.income)}.`,
        tone: "danger",
        ctaLabel: "Xem giao dịch",
        ctaRoute: "/transactions",
      });
    } else if (summary.savingRate < 40) {
      const targetGap = Math.max(0, summary.income * 0.4 - summary.saving);
      actions.push({
        icon: "savings",
        title: "Tang them tiet kiem",
        body: `Ty le tiet kiem ${summary.savingRate}%. Can them ${formatVND(targetGap)} de dat muc tieu 40% trong du lieu hien tai.`,
        tone: "warning",
        ctaLabel: "Xem giao dịch",
        ctaRoute: "/transactions",
      });
    } else {
      actions.push({
        icon: "shield",
        title: "Tiet kiem vuot muc tieu",
        body: `Ban dang tiet kiem ${summary.savingRate}% voi thang du ${formatVND(summary.saving)} tu giao dich thuc te.`,
        tone: "good",
        ctaLabel: "Phân bổ mục tiêu",
        ctaRoute: "/goals",
      });
    }
  } else if (summary.expense > 0) {
    actions.push({
      icon: "alert",
      title: "Chua co thu nhap",
      body: `Da ghi nhan ${formatVND(summary.expense)} chi tieu nhung chua co giao dich thu nhap.`,
      tone: "danger",
      ctaLabel: "Thêm thu nhập",
      ctaRoute: "/transactions",
    });
  }

  if (summary.debtRatio > 50) {
    actions.push({
      icon: "debt",
      title: "Ty le no cao",
      body: `No con lai ${formatVND(summary.totalDebt)} dang chiem ${summary.debtRatio}% tong tai san.`,
      tone: "danger",
      ctaLabel: "Xem khoản nợ",
      ctaRoute: "/debts",
    });
  } else if (summary.debtRatio > 30) {
    actions.push({
      icon: "bank",
      title: "Theo doi no dinh ky",
      body: `No con lai ${formatVND(summary.totalDebt)} chiem ${summary.debtRatio}% tong tai san.`,
      tone: "warning",
      ctaLabel: "Xem khoản nợ",
      ctaRoute: "/debts",
    });
  }

  if (summary.monthlyExpense > 0 && summary.emergencyMonths < 3) {
    actions.push({
      icon: "emergency",
      title: "Quy khan cap thieu",
      body: `So du thanh khoan ${formatVND(summary.liquidBalance)} du dung ${summary.emergencyMonths} thang. Muc tieu 3 thang la ${formatVND(summary.monthlyExpense * 3)}.`,
      tone: "danger",
      ctaLabel: "Tạo mục tiêu",
      ctaRoute: "/goals",
    });
  }

  const currentMonth = getLastMonthKeys(1)[0];
  const currentBudgets = input.budgets.filter(
    (budget) => budget.month === currentMonth,
  );
  const currentMonthSpending = buildCategorySpendingData(
    input.transactions.filter((transaction) =>
      transaction.date.startsWith(currentMonth),
    ),
    input.categories,
  );
  const spendingByCategoryId = new Map(
    currentMonthSpending.map((item) => [item.id, item.value]),
  );
  const overBudget = currentBudgets
    .map((budget) => ({
      budget,
      spent: spendingByCategoryId.get(budget.categoryId) ?? 0,
      categoryName:
        input.categories.find((category) => category.id === budget.categoryId)
          ?.name ?? "Khac",
    }))
    .filter((item) => item.spent > item.budget.limitAmount)
    .sort(
      (a, b) =>
        b.spent - b.budget.limitAmount - (a.spent - a.budget.limitAmount),
    )[0];

  if (overBudget) {
    actions.push({
      icon: "budget",
      title: `Vuot ngan sach: ${overBudget.categoryName}`,
      body: `Da chi ${formatVND(overBudget.spent)} tren han muc ${formatVND(overBudget.budget.limitAmount)} trong thang nay.`,
      tone: "danger",
      ctaLabel: "Xem ngân sách",
      ctaRoute: "/budgets",
    });
  }

  if (summary.investmentReturn < 0 && input.investments.length > 0) {
    actions.push({
      icon: "investment",
      title: "Danh muc dau tu am",
      body: `Danh muc dang lo ${Math.abs(summary.investmentReturn)}%, tuong duong ${formatVND(Math.abs(summary.investmentPL))}.`,
      tone: "warning",
      ctaLabel: "Xem đầu tư",
      ctaRoute: "/investments",
    });
  }

  const slowGoal = input.goals
    .map((goal) => {
      const percent =
        goal.targetAmount > 0
          ? Math.min(
              Math.round((goal.currentAmount / goal.targetAmount) * 100),
              100,
            )
          : 0;
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
      const monthsLeft =
        remaining > 0 && summary.saving > 0
          ? Math.max(0, Math.ceil(remaining / summary.saving))
          : null;
      return { goal, percent, monthsLeft };
    })
    .filter((item) => item.percent < 50)
    .sort((a, b) => a.percent - b.percent)[0];

  if (slowGoal) {
    actions.push({
      icon: "goal",
      title: `Day nhanh: ${slowGoal.goal.name}`,
      body:
        slowGoal.monthsLeft !== null
          ? `Moi dat ${slowGoal.percent}%. Con khoang ${slowGoal.monthsLeft} thang voi dong tien hien tai.`
          : `Moi dat ${slowGoal.percent}%. Can dong tien duong de uoc tinh thoi gian ve dich.`,
      tone: "warning",
      ctaLabel: "Xem mục tiêu",
      ctaRoute: "/goals",
    });
  }

  return actions.slice(0, 3);
}
