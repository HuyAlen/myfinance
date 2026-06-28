import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  Debt,
  Goal,
  Investment,
  SavingAccount,
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

export type DateRangeInput = {
  startDate: string;
  endDate: string;
};

function normalizeDateKey(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function isDateInRange(
  value: string | null | undefined,
  range: DateRangeInput,
) {
  const date = normalizeDateKey(value);
  if (!date) return false;
  return date >= range.startDate && date <= range.endDate;
}

export function filterByDateRange<T>(
  items: T[],
  range: DateRangeInput,
  getDate: (item: T) => string | null | undefined,
): T[] {
  return items.filter((item) => isDateInRange(getDate(item), range));
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  range: DateRangeInput,
): Transaction[] {
  return filterByDateRange(
    transactions,
    range,
    (transaction) => transaction.date,
  );
}

export function filterBudgetsByDateRange(
  budgets: Budget[],
  range: DateRangeInput,
): Budget[] {
  return budgets.filter((budget) => {
    const budgetStart = `${budget.month}-01`;
    const budgetEnd = `${budget.month}-31`;
    return budgetEnd >= range.startDate && budgetStart <= range.endDate;
  });
}

export function doesDateRangeIncludeToday(range: DateRangeInput) {
  const today = new Date().toISOString().slice(0, 10);
  return today >= range.startDate && today <= range.endDate;
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

export function normalizePlanningGroup(
  value: CategoryPlanningGroup | string | null | undefined,
): CategoryPlanningGroup | undefined {
  if (
    value === "income" ||
    value === "fixed" ||
    value === "variable" ||
    value === "saving" ||
    value === "investment"
  ) {
    return value;
  }

  return undefined;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function inferCategoryPlanningGroup(
  category: Pick<Category, "name" | "type">,
): CategoryPlanningGroup {
  if (category.type === "income") return "income";

  const name = normalizeText(category.name);

  if (
    name.includes("nha") ||
    name.includes("thue nha") ||
    name.includes("dien") ||
    name.includes("nuoc") ||
    name.includes("internet") ||
    name.includes("wifi") ||
    name.includes("gui xe") ||
    name.includes("phi quan ly") ||
    name.includes("bao hiem") ||
    name.includes("hoc phi") ||
    name.includes("tra gop") ||
    name.includes("subscription") ||
    name.includes("dang ky")
  ) {
    return "fixed";
  }

  if (
    name.includes("tiet kiem") ||
    name.includes("quy") ||
    name.includes("khan cap") ||
    name.includes("du phong")
  ) {
    return "saving";
  }

  if (
    name.includes("dau tu") ||
    name.includes("trading") ||
    name.includes("capital") ||
    name.includes("crypto") ||
    name.includes("coin") ||
    name.includes("co phieu") ||
    name.includes("chung khoan") ||
    name.includes("etf") ||
    name.includes("vang")
  ) {
    return "investment";
  }

  return "variable";
}

export function getCategoryPlanningGroup(
  category: Pick<Category, "name" | "type" | "planningGroup"> | undefined,
): CategoryPlanningGroup {
  if (!category) return "variable";

  return (
    normalizePlanningGroup(category.planningGroup) ??
    inferCategoryPlanningGroup(category)
  );
}

export interface Rule503020Summary {
  income: number;
  needsAmount: number;
  wantsAmount: number;
  savingsAmount: number;
  investmentAmount: number;
  futureAllocationAmount: number;
  unclassifiedAmount: number;
  needsPercentOfIncome: number;
  wantsPercentOfIncome: number;
  savingsPercentOfIncome: number;
  needsPercentOfTarget: number;
  wantsPercentOfTarget: number;
  savingsPercentOfTarget: number;
  needsTargetAmount: number;
  wantsTargetAmount: number;
  savingsTargetAmount: number;
}

export function calculateRule503020(input: {
  transactions: Transaction[];
  categories: Category[];
  month?: string;
  income?: number;
}): Rule503020Summary {
  const inScopeTransactions = input.month
    ? input.transactions.filter((transaction) =>
        transaction.date.startsWith(input.month ?? ""),
      )
    : input.transactions;

  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  );

  const calculatedIncome = inScopeTransactions
    .filter((transaction) => String(transaction.type) === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const income = input.income ?? calculatedIncome;

  const summary = inScopeTransactions.reduce(
    (current, transaction) => {
      const transactionType = String(transaction.type);

      if (transactionType === "income" || transactionType === "transfer") {
        return current;
      }

      if (transactionType === "saving") {
        current.savings += transaction.amount;
        return current;
      }

      if (transactionType === "investment") {
        current.investment += transaction.amount;
        return current;
      }

      if (transactionType !== "expense") {
        return current;
      }

      const category = categoryById.get(transaction.categoryId);
      if (!category) {
        current.wants += transaction.amount;
        current.unclassified += transaction.amount;
        return current;
      }

      const group = getCategoryPlanningGroup(category);

      if (group === "fixed") {
        current.needs += transaction.amount;
        return current;
      }

      if (group === "saving") {
        current.savings += transaction.amount;
        return current;
      }

      if (group === "investment") {
        current.investment += transaction.amount;
        return current;
      }

      if (group === "income") {
        return current;
      }

      current.wants += transaction.amount;
      return current;
    },
    {
      needs: 0,
      wants: 0,
      savings: 0,
      investment: 0,
      unclassified: 0,
    },
  );

  const futureAllocationAmount = summary.savings + summary.investment;
  const needsTargetAmount = income > 0 ? income * 0.5 : 0;
  const wantsTargetAmount = income > 0 ? income * 0.3 : 0;
  const savingsTargetAmount = income > 0 ? income * 0.2 : 0;
  const percentOfIncome = (value: number) =>
    income > 0 ? Math.round((value / income) * 100) : 0;
  const percentOfTarget = (value: number, target: number) =>
    target > 0 ? Math.round((value / target) * 100) : 0;

  return {
    income,
    needsAmount: summary.needs,
    wantsAmount: summary.wants,
    savingsAmount: futureAllocationAmount,
    investmentAmount: summary.investment,
    futureAllocationAmount,
    unclassifiedAmount: summary.unclassified,
    needsPercentOfIncome: percentOfIncome(summary.needs),
    wantsPercentOfIncome: percentOfIncome(summary.wants),
    savingsPercentOfIncome: percentOfIncome(futureAllocationAmount),
    needsPercentOfTarget: percentOfTarget(summary.needs, needsTargetAmount),
    wantsPercentOfTarget: percentOfTarget(summary.wants, wantsTargetAmount),
    savingsPercentOfTarget: percentOfTarget(
      futureAllocationAmount,
      savingsTargetAmount,
    ),
    needsTargetAmount,
    wantsTargetAmount,
    savingsTargetAmount,
  };
}

export function getPlanningGroupLabel(group: CategoryPlanningGroup) {
  switch (group) {
    case "income":
      return "Thu nhập";
    case "fixed":
      return "Chi phí cố định";
    case "variable":
      return "Chi phí biến đổi";
    case "saving":
      return "Tiết kiệm";
    case "investment":
      return "Đầu tư";
    default:
      return "Chi phí biến đổi";
  }
}

export function isControllableExpenseCategory(
  category: Pick<Category, "name" | "type" | "planningGroup"> | undefined,
) {
  const group = getCategoryPlanningGroup(category);
  return group === "variable";
}

export function isFixedExpenseCategory(
  category: Pick<Category, "name" | "type" | "planningGroup"> | undefined,
) {
  return getCategoryPlanningGroup(category) === "fixed";
}

export function getGoalLinkedSavingAmount(input: {
  goal: Pick<Goal, "savingCategoryIds">;
  transactions: Transaction[];
}) {
  const linkedCategoryIds = new Set(input.goal.savingCategoryIds ?? []);
  if (linkedCategoryIds.size === 0) return 0;

  return input.transactions.reduce((sum, transaction) => {
    const transactionType = String(transaction.type);
    if (
      linkedCategoryIds.has(transaction.categoryId) &&
      (transactionType === "expense" || transactionType === "saving")
    ) {
      return sum + transaction.amount;
    }

    return sum;
  }, 0);
}

export function getGoalEffectiveCurrentAmount(input: {
  goal: Goal;
  transactions: Transaction[];
}) {
  return (
    input.goal.currentAmount +
    getGoalLinkedSavingAmount({
      goal: input.goal,
      transactions: input.transactions,
    })
  );
}

export function getGoalEffectiveProgress(input: {
  goal: Goal;
  transactions: Transaction[];
}) {
  if (input.goal.targetAmount <= 0) return 0;

  const effectiveCurrentAmount = getGoalEffectiveCurrentAmount(input);
  return Math.round((effectiveCurrentAmount / input.goal.targetAmount) * 100);
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

export function getTotalSavings(savings: SavingAccount[] = []) {
  return savings.reduce((sum, item) => sum + item.balance, 0);
}

export function getNetWorth(
  wallets: Wallet[],
  debts: Debt[],
  investments: Investment[] = [],
  savings: SavingAccount[] = [],
) {
  return (
    getTotalAssets(wallets) +
    getTotalSavings(savings) +
    getTotalInvestmentValue(investments) -
    getTotalDebt(debts)
  );
}

export function getTotalIncome(transactions: Transaction[]) {
  return transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalTransferAmount(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.type === "transfer")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function getWalletTransferStats(
  transactions: Transaction[],
  wallets: Wallet[],
) {
  const stats = new Map<
    string,
    {
      wallet: Wallet;
      sent: number;
      received: number;
      count: number;
    }
  >();

  for (const wallet of wallets) {
    stats.set(wallet.id, {
      wallet,
      sent: 0,
      received: 0,
      count: 0,
    });
  }

  for (const transaction of transactions) {
    if (transaction.type !== "transfer") continue;

    const fromWallet = stats.get(transaction.walletId);
    if (fromWallet) {
      fromWallet.sent += transaction.amount;
      fromWallet.count += 1;
    }

    if (transaction.transferToWalletId) {
      const toWallet = stats.get(transaction.transferToWalletId);
      if (toWallet) {
        toWallet.received += transaction.amount;
        toWallet.count += 1;
      }
    }
  }

  return Array.from(stats.values()).sort((a, b) => b.count - a.count);
}

export function getWalletTransferInsight(
  transactions: Transaction[],
  wallets: Wallet[],
) {
  const [mostActive] = getWalletTransferStats(transactions, wallets).filter(
    (item) => item.count > 0,
  );

  if (!mostActive) {
    return "Chưa có dữ liệu chuyển tiền giữa các ví.";
  }

  if (mostActive.count >= 2) {
    return `Ví ${mostActive.wallet.name} tham gia ${mostActive.count} lần chuyển tiền. Cân nhắc giữ số dư dự phòng ở ví này để giảm thao tác chuyển qua lại.`;
  }

  return `Ví ${mostActive.wallet.name} có phát sinh chuyển tiền trong kỳ. Tiếp tục theo dõi để tối ưu phân bổ số dư.`;
}

function buildCategoryMap(categories: Category[] = []) {
  return new Map(categories.map((category) => [category.id, category]));
}

function getTransactionPlanningGroup(
  transaction: Transaction,
  categoryById?: Map<string, Category>,
): CategoryPlanningGroup | undefined {
  const category = categoryById?.get(transaction.categoryId);
  return category ? getCategoryPlanningGroup(category) : undefined;
}

export function isSavingAllocationTransaction(
  transaction: Transaction,
  categoryById?: Map<string, Category>,
) {
  const transactionType = String(transaction.type);
  return (
    transactionType === "saving" ||
    (transactionType === "expense" &&
      getTransactionPlanningGroup(transaction, categoryById) === "saving")
  );
}

export function isInvestmentAllocationTransaction(
  transaction: Transaction,
  categoryById?: Map<string, Category>,
) {
  const transactionType = String(transaction.type);
  return (
    transactionType === "investment" ||
    (transactionType === "expense" &&
      getTransactionPlanningGroup(transaction, categoryById) === "investment")
  );
}

export function isFutureAllocationTransaction(
  transaction: Transaction,
  categoryById?: Map<string, Category>,
) {
  return (
    isSavingAllocationTransaction(transaction, categoryById) ||
    isInvestmentAllocationTransaction(transaction, categoryById)
  );
}

export function isRealExpenseTransaction(
  transaction: Transaction,
  categoryById?: Map<string, Category>,
) {
  const transactionType = String(transaction.type);
  if (transactionType !== "expense") return false;

  const group = getTransactionPlanningGroup(transaction, categoryById);
  return group !== "saving" && group !== "investment";
}

export function getTotalExpense(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  const categoryById = buildCategoryMap(categories);
  return transactions
    .filter((item) => isRealExpenseTransaction(item, categoryById))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalSavingAllocation(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  const categoryById = buildCategoryMap(categories);
  return transactions
    .filter((item) => isSavingAllocationTransaction(item, categoryById))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalInvestmentAllocation(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  const categoryById = buildCategoryMap(categories);
  return transactions
    .filter((item) => isInvestmentAllocationTransaction(item, categoryById))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalFutureAllocation(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  const categoryById = buildCategoryMap(categories);
  return transactions
    .filter((item) => isFutureAllocationTransaction(item, categoryById))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getDisposableCashFlow(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  return (
    getTotalIncome(transactions) - getTotalExpense(transactions, categories)
  );
}

export function getAvailableAfterFutureAllocation(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  return (
    getDisposableCashFlow(transactions, categories) -
    getTotalFutureAllocation(transactions, categories)
  );
}

export function getSavingRate(income: number, expense: number) {
  if (income <= 0) return 0;

  return Math.round(((income - expense) / income) * 1000) / 10;
}

export function getDebtRatio(totalDebt: number, totalAssets: number) {
  if (totalAssets <= 0) return 0;

  return Math.round((totalDebt / totalAssets) * 1000) / 10;
}

export function getGoalScore(goals: Goal[], transactions: Transaction[] = []) {
  if (goals.length === 0) return 0;

  const progressScore = goals.reduce((sum, goal) => {
    if (goal.targetAmount <= 0) return sum;

    const currentAmount =
      transactions.length > 0
        ? getGoalEffectiveCurrentAmount({ goal, transactions })
        : goal.currentAmount;

    return sum + Math.min((currentAmount / goal.targetAmount) * 100, 100);
  }, 0);

  return Math.round(progressScore / goals.length);
}

export function getMonthlyExpenseEstimate(
  transactions: Transaction[],
  months = 6,
  categories: Category[] = [],
) {
  const categoryById = buildCategoryMap(categories);
  const expenseTransactions = transactions.filter((item) =>
    isRealExpenseTransaction(item, categoryById),
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
  savingAssets: number;
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
  futureAllocation: number;
  savingRate: number;
  debtRatio: number;
  goalScore: number;
  emergencyMonths: number;
  financialHealthScore: number;
}

export function calculateDashboardSummary(input: {
  wallets: Wallet[];
  savings?: SavingAccount[];
  investments: Investment[];
  debts: Debt[];
  transactions: Transaction[];
  categories?: Category[];
  goals: Goal[];
}): DashboardSummary {
  const categories = input.categories ?? [];

  /**
   * Snapshot data: current asset position.
   * Do not derive net worth from transactions and do not apply cash-flow logic here.
   */
  const walletAssets = getTotalAssets(input.wallets);
  const liquidBalance = input.wallets
    .filter((wallet) => wallet.type !== "investment")
    .reduce((sum, wallet) => sum + wallet.balance, 0);
  const savingAssets = getTotalSavings(input.savings ?? []);
  const investmentAssets = getTotalInvestmentValue(input.investments);
  const investedAmount = input.investments.reduce(
    (sum, item) => sum + item.investedAmount,
    0,
  );
  const investmentPL = investmentAssets - investedAmount;
  const totalDebt = getTotalDebt(input.debts);
  const totalAssets = walletAssets + savingAssets + investmentAssets;
  const netWorth = totalAssets - totalDebt;

  /**
   * Flow data: period movement from the already filtered transactions.
   * Transfer transactions only move money between wallets, so they are never
   * included in income, expense, or net cash flow.
   */
  const income = getTotalIncome(input.transactions);
  const expense = getTotalExpense(input.transactions, categories);
  const netCashFlow = income - expense;
  const futureAllocation = getTotalFutureAllocation(
    input.transactions,
    categories,
  );
  const monthlyExpense = getMonthlyExpenseEstimate(
    input.transactions,
    6,
    categories,
  );
  const savingRate =
    income > 0 ? Math.round((netCashFlow / income) * 1000) / 10 : 0;
  const emergencyMonths = getEmergencyMonths(liquidBalance, monthlyExpense);
  const goalScore = getGoalScore(input.goals);

  return {
    walletAssets,
    savingAssets,
    investmentAssets,
    investedAmount,
    investmentPL,
    investmentReturn:
      investedAmount > 0
        ? Math.round((investmentPL / investedAmount) * 1000) / 10
        : 0,
    totalAssets,
    totalDebt,
    netWorth,
    liquidBalance,
    income,
    expense,
    monthlyExpense,
    saving: netCashFlow,
    futureAllocation,
    savingRate,
    debtRatio: getDebtRatio(totalDebt, totalAssets),
    goalScore,
    emergencyMonths,
    financialHealthScore: getFinancialHealthScore({
      savingRate,
      totalDebt,
      totalAssets,
      emergencyMonths,
      goalScore,
    }),
  };
}

export interface CategorySpending {
  id: string;
  name: string;
  value: number;
  percent: number;
  planningGroup: CategoryPlanningGroup;
}

export function buildCategorySpendingData(
  transactions: Transaction[],
  categories: Category[],
): CategorySpending[] {
  const categoryById = buildCategoryMap(categories);
  const expenseTransactions = transactions.filter((item) =>
    isRealExpenseTransaction(item, categoryById),
  );
  const totalExpense = expenseTransactions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const totals = new Map<
    string,
    {
      id: string;
      name: string;
      value: number;
      planningGroup: CategoryPlanningGroup;
    }
  >();

  for (const transaction of expenseTransactions) {
    const category = categoryById.get(transaction.categoryId);
    const id = category?.id ?? "__uncategorized__";
    const name = category?.name ?? "Khac";
    const planningGroup = getCategoryPlanningGroup(category);
    const current = totals.get(id) ?? { id, name, value: 0, planningGroup };
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

export interface PlanningGroupSpending {
  group: CategoryPlanningGroup;
  label: string;
  value: number;
  percentOfIncome: number;
  percentOfExpense: number;
}

export function buildPlanningGroupSpendingData(input: {
  transactions: Transaction[];
  categories: Category[];
  income?: number;
}): PlanningGroupSpending[] {
  const income = input.income ?? getTotalIncome(input.transactions);
  const totalExpense = getTotalExpense(input.transactions, input.categories);
  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  );
  const totals = new Map<CategoryPlanningGroup, number>([
    ["fixed", 0],
    ["variable", 0],
    ["saving", 0],
    ["investment", 0],
  ]);

  for (const transaction of input.transactions) {
    const transactionType = String(transaction.type);

    if (transactionType === "income" || transactionType === "transfer") {
      continue;
    }

    if (transactionType === "saving") {
      totals.set("saving", (totals.get("saving") ?? 0) + transaction.amount);
      continue;
    }

    if (transactionType === "investment") {
      totals.set(
        "investment",
        (totals.get("investment") ?? 0) + transaction.amount,
      );
      continue;
    }

    if (transactionType !== "expense") {
      continue;
    }

    const category = categoryById.get(transaction.categoryId);
    const group = getCategoryPlanningGroup(category);

    if (group === "income") continue;

    totals.set(group, (totals.get(group) ?? 0) + transaction.amount);
  }

  return (
    ["fixed", "variable", "saving", "investment"] as CategoryPlanningGroup[]
  ).map((group) => {
    const value = totals.get(group) ?? 0;

    return {
      group,
      label: getPlanningGroupLabel(group),
      value,
      percentOfIncome: income > 0 ? Math.round((value / income) * 100) : 0,
      percentOfExpense:
        totalExpense > 0 && (group === "fixed" || group === "variable")
          ? Math.round((value / totalExpense) * 100)
          : 0,
    };
  });
}

export function getPlanningGroupAmount(input: {
  transactions: Transaction[];
  categories: Category[];
  group: CategoryPlanningGroup;
}) {
  if (input.group === "income") {
    return getTotalIncome(input.transactions);
  }

  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  );

  return input.transactions.reduce((sum, transaction) => {
    const transactionType = String(transaction.type);

    if (transactionType === "income" || transactionType === "transfer") {
      return sum;
    }

    if (input.group === "saving") {
      if (transactionType === "saving") return sum + transaction.amount;

      if (transactionType === "expense") {
        const category = categoryById.get(transaction.categoryId);
        return getCategoryPlanningGroup(category) === "saving"
          ? sum + transaction.amount
          : sum;
      }

      return sum;
    }

    if (input.group === "investment") {
      if (transactionType === "investment") return sum + transaction.amount;

      if (transactionType === "expense") {
        const category = categoryById.get(transaction.categoryId);
        return getCategoryPlanningGroup(category) === "investment"
          ? sum + transaction.amount
          : sum;
      }

      return sum;
    }

    if (transactionType !== "expense") return sum;

    const category = categoryById.get(transaction.categoryId);
    const group = getCategoryPlanningGroup(category);

    return group === input.group ? sum + transaction.amount : sum;
  }, 0);
}

export function getFixedCostAmount(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  return getPlanningGroupAmount({
    transactions: input.transactions,
    categories: input.categories,
    group: "fixed",
  });
}

export function getVariableCostAmount(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  return getPlanningGroupAmount({
    transactions: input.transactions,
    categories: input.categories,
    group: "variable",
  });
}

export function getPlanningSavingAmount(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  return getPlanningGroupAmount({
    transactions: input.transactions,
    categories: input.categories,
    group: "saving",
  });
}

export function getPlanningInvestmentAmount(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  return getPlanningGroupAmount({
    transactions: input.transactions,
    categories: input.categories,
    group: "investment",
  });
}

export function getFixedCostRatio(input: {
  transactions: Transaction[];
  categories: Category[];
  income?: number;
}) {
  const income = input.income ?? getTotalIncome(input.transactions);
  if (income <= 0) return 0;

  const fixedCost = getFixedCostAmount({
    transactions: input.transactions,
    categories: input.categories,
  });

  return Math.round((fixedCost / income) * 1000) / 10;
}

export function getVariableCostRatio(input: {
  transactions: Transaction[];
  categories: Category[];
  income?: number;
}) {
  const income = input.income ?? getTotalIncome(input.transactions);
  if (income <= 0) return 0;

  const variableCost = getVariableCostAmount({
    transactions: input.transactions,
    categories: input.categories,
  });

  return Math.round((variableCost / income) * 1000) / 10;
}

export function getPlanningSavingRate(input: {
  transactions: Transaction[];
  categories: Category[];
  income?: number;
}) {
  const income = input.income ?? getTotalIncome(input.transactions);
  if (income <= 0) return 0;

  const savingAmount = getPlanningSavingAmount({
    transactions: input.transactions,
    categories: input.categories,
  });

  return Math.round((savingAmount / income) * 1000) / 10;
}

export function getInvestmentRate(input: {
  transactions: Transaction[];
  categories: Category[];
  income?: number;
}) {
  const income = input.income ?? getTotalIncome(input.transactions);
  if (income <= 0) return 0;

  const investmentAmount = getPlanningInvestmentAmount({
    transactions: input.transactions,
    categories: input.categories,
  });

  return Math.round((investmentAmount / income) * 1000) / 10;
}

export interface FinancialStructureSummary {
  income: number;
  expense: number;
  cashFlow: number;
  fixedCost: number;
  variableCost: number;
  savingAmount: number;
  investmentAmount: number;
  fixedCostRatio: number;
  variableCostRatio: number;
  planningSavingRate: number;
  investmentRate: number;
}

export function calculateFinancialStructureSummary(input: {
  transactions: Transaction[];
  categories: Category[];
}): FinancialStructureSummary {
  const income = getTotalIncome(input.transactions);
  const expense = getTotalExpense(input.transactions, input.categories);
  const fixedCost = getFixedCostAmount(input);
  const variableCost = getVariableCostAmount(input);
  const savingAmount = getPlanningSavingAmount(input);
  const investmentAmount = getPlanningInvestmentAmount(input);

  return {
    income,
    expense,
    cashFlow: income - expense,
    fixedCost,
    variableCost,
    savingAmount,
    investmentAmount,
    fixedCostRatio: getFixedCostRatio({ ...input, income }),
    variableCostRatio: getVariableCostRatio({ ...input, income }),
    planningSavingRate: getPlanningSavingRate({ ...input, income }),
    investmentRate: getInvestmentRate({ ...input, income }),
  };
}

export interface FinancialStabilityBreakdownItem {
  key: "fixedCost" | "saving" | "investment" | "cashFlow" | "emergency";
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  status: "good" | "warning" | "danger";
  detail: string;
}

export interface FinancialStabilitySummary {
  score: number;
  label: string;
  tone: "good" | "warning" | "danger";
  breakdown: FinancialStabilityBreakdownItem[];
  strengths: string[];
  improvements: string[];
}

function scoreFixedCostRatio(ratio: number) {
  if (ratio <= 35) return 100;
  if (ratio <= 45) return 85;
  if (ratio <= 60) return 60;
  if (ratio <= 75) return 35;
  return 15;
}

function scorePlanningSavingRate(rate: number) {
  if (rate >= 25) return 100;
  if (rate >= 20) return 90;
  if (rate >= 10) return 70;
  if (rate > 0) return 40;
  return 10;
}

function scoreInvestmentRate(rate: number) {
  if (rate >= 20) return 100;
  if (rate >= 15) return 90;
  if (rate >= 5) return 65;
  if (rate > 0) return 35;
  return 10;
}

function scoreCashFlowRatio(cashFlow: number, income: number) {
  if (income <= 0) return 0;
  const ratio = (cashFlow / income) * 100;
  if (ratio >= 25) return 100;
  if (ratio >= 15) return 85;
  if (ratio >= 0) return 65;
  if (ratio >= -10) return 35;
  return 10;
}

function getStabilityStatus(score: number): "good" | "warning" | "danger" {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "danger";
}

export function calculateFinancialStabilitySummary(input: {
  financialStructure: FinancialStructureSummary;
  emergencyMonths: number;
}): FinancialStabilitySummary {
  const { financialStructure, emergencyMonths } = input;

  const rows: Omit<
    FinancialStabilityBreakdownItem,
    "weightedScore" | "status"
  >[] = [
    {
      key: "fixedCost",
      label: "Chi phí cố định",
      score: scoreFixedCostRatio(financialStructure.fixedCostRatio),
      weight: 25,
      detail: `${financialStructure.fixedCostRatio}% thu nhập`,
    },
    {
      key: "saving",
      label: "Tỷ lệ tiết kiệm",
      score: scorePlanningSavingRate(financialStructure.planningSavingRate),
      weight: 20,
      detail: `${financialStructure.planningSavingRate}% thu nhập`,
    },
    {
      key: "investment",
      label: "Tỷ lệ đầu tư",
      score: scoreInvestmentRate(financialStructure.investmentRate),
      weight: 15,
      detail: `${financialStructure.investmentRate}% thu nhập`,
    },
    {
      key: "cashFlow",
      label: "Dòng tiền ròng",
      score: scoreCashFlowRatio(
        financialStructure.cashFlow,
        financialStructure.income,
      ),
      weight: 20,
      detail: `${financialStructure.cashFlow >= 0 ? "+" : ""}${formatVND(financialStructure.cashFlow)}`,
    },
    {
      key: "emergency",
      label: "Quỹ khẩn cấp",
      score: getEmergencyScore(emergencyMonths),
      weight: 20,
      detail: `${Math.round(emergencyMonths * 10) / 10} tháng chi tiêu`,
    },
  ];

  const breakdown = rows.map((item) => ({
    ...item,
    weightedScore: Math.round((item.score * item.weight) / 100),
    status: getStabilityStatus(item.score),
  }));

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(breakdown.reduce((sum, item) => sum + item.weightedScore, 0)),
    ),
  );

  const label =
    score >= 85
      ? "Rất ổn định"
      : score >= 70
        ? "Ổn định"
        : score >= 50
          ? "Cần theo dõi"
          : "Rủi ro";

  const tone = getStabilityStatus(score);

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (financialStructure.fixedCostRatio <= 40) {
    strengths.push("Chi phí cố định đang ở vùng an toàn.");
  } else {
    improvements.push("Giảm tỷ trọng chi phí cố định xuống dưới 40% thu nhập.");
  }

  if (financialStructure.planningSavingRate >= 20) {
    strengths.push("Tỷ lệ tiết kiệm vượt mức khuyến nghị 20%.");
  } else {
    improvements.push("Tăng tỷ lệ tiết kiệm lên tối thiểu 20% thu nhập.");
  }

  if (financialStructure.investmentRate >= 15) {
    strengths.push("Tỷ lệ đầu tư đang tích cực xây tài sản dài hạn.");
  } else {
    improvements.push("Dành thêm một phần dòng tiền cho đầu tư dài hạn.");
  }

  if (financialStructure.cashFlow >= 0) {
    strengths.push("Dòng tiền ròng đang dương.");
  } else {
    improvements.push(
      "Dòng tiền ròng âm, cần giảm chi tiêu hoặc tăng thu nhập.",
    );
  }

  if (emergencyMonths >= 3) {
    strengths.push("Quỹ khẩn cấp đạt mức tối thiểu 3 tháng.");
  } else {
    improvements.push("Bổ sung quỹ khẩn cấp lên tối thiểu 3 tháng chi tiêu.");
  }

  return {
    score,
    label,
    tone,
    breakdown,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
  };
}

// ─── V11.3 Financial Independence Tracker ───────────────────────────────────
export interface FinancialIndependenceSummary {
  savingAssets: number;
  investmentAssets: number;
  fiAssets: number;
  monthlyExpense: number;
  monthlyInvestment: number;
  annualExpense: number;
  targetAssets: number;
  progressPercent: number;
  remainingAmount: number;
  yearsToFI: number | null;
  label: string;
  tone: "good" | "warning" | "danger";
  insight: string;
}

export function calculateFinancialIndependenceSummary(input: {
  investments: Investment[];
  savings?: SavingAccount[];
  monthlyExpense: number;
  monthlyInvestment?: number;
}): FinancialIndependenceSummary {
  const savingAssets = getTotalSavings(input.savings ?? []);
  const investmentAssets = getTotalInvestmentValue(input.investments);
  const fiAssets = savingAssets + investmentAssets;
  const monthlyExpense = Math.max(0, input.monthlyExpense);
  const monthlyInvestment = Math.max(0, input.monthlyInvestment ?? 0);
  const annualExpense = monthlyExpense * 12;
  const targetAssets = annualExpense * 25;
  const remainingAmount = Math.max(targetAssets - fiAssets, 0);
  const progressPercent =
    targetAssets > 0
      ? Math.min(100, Math.round((fiAssets / targetAssets) * 1000) / 10)
      : 0;
  const yearsToFI =
    remainingAmount > 0 && monthlyInvestment > 0
      ? Math.round((remainingAmount / monthlyInvestment / 12) * 10) / 10
      : remainingAmount <= 0
        ? 0
        : null;

  const label =
    progressPercent >= 100
      ? "Đã đạt FI"
      : progressPercent >= 50
        ? "Gần mục tiêu"
        : progressPercent >= 20
          ? "Đang tăng tốc"
          : "Đang xây nền";

  const tone: "good" | "warning" | "danger" =
    progressPercent >= 50
      ? "good"
      : progressPercent >= 10
        ? "warning"
        : "danger";

  const insight =
    targetAssets <= 0
      ? "Cần dữ liệu chi tiêu tháng để ước tính mục tiêu tự do tài chính."
      : remainingAmount <= 0
        ? "Tài sản đầu tư đã đạt ngưỡng mục tiêu theo quy tắc 4%."
        : yearsToFI !== null
          ? `Nếu duy trì đầu tư ${formatVND(monthlyInvestment)}/tháng, bạn có thể đạt FI sau khoảng ${yearsToFI} năm.`
          : "Hãy thiết lập dòng tiền đầu tư hằng tháng để ước tính thời gian đạt FI.";

  return {
    savingAssets,
    investmentAssets,
    fiAssets,
    monthlyExpense,
    monthlyInvestment,
    annualExpense,
    targetAssets,
    progressPercent,
    remainingAmount,
    yearsToFI,
    label,
    tone,
    insight,
  };
}

export interface AiCfoPriorityAction {
  title: string;
  body: string;
  tone: "good" | "warning" | "danger";
  ctaLabel?: string;
  ctaRoute?: string;
}

export interface AiCfoInsightSummary {
  score: number;
  label: string;
  tone: "good" | "warning" | "danger";
  headline: string;
  summary: string;
  priorityActions: AiCfoPriorityAction[];
  accelerationInsight: string;
  warning: string | null;
}

function getCfoTone(score: number): "good" | "warning" | "danger" {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "danger";
}

function getCfoLabel(score: number) {
  if (score >= 85) return "Rất tốt";
  if (score >= 70) return "Ổn định";
  if (score >= 50) return "Cần tối ưu";
  return "Cần hành động";
}

export function calculateAiCfoInsightSummary(input: {
  financialStructure: FinancialStructureSummary;
  financialStability: FinancialStabilitySummary;
  financialIndependence: FinancialIndependenceSummary;
  emergencyMonths: number;
}): AiCfoInsightSummary {
  const {
    financialStructure,
    financialStability,
    financialIndependence,
    emergencyMonths,
  } = input;

  const actions: AiCfoPriorityAction[] = [];

  if (financialStructure.fixedCostRatio > 45) {
    const targetFixedCost = financialStructure.income * 0.4;
    const reduceAmount = Math.max(
      financialStructure.fixedCost - targetFixedCost,
      0,
    );
    actions.push({
      title: "Giảm chi phí cố định",
      body: `Chi phí cố định đang chiếm ${financialStructure.fixedCostRatio}% thu nhập. Mục tiêu an toàn là dưới 40%, tương đương cần tối ưu khoảng ${formatVND(reduceAmount)}/tháng.`,
      tone: financialStructure.fixedCostRatio > 60 ? "danger" : "warning",
      ctaLabel: "Xem ngân sách",
      ctaRoute: "/budgets",
    });
  }

  if (financialStructure.planningSavingRate < 20) {
    const targetSaving = financialStructure.income * 0.2;
    const addAmount = Math.max(
      targetSaving - financialStructure.savingAmount,
      0,
    );
    actions.push({
      title: "Tăng tỷ lệ tiết kiệm",
      body: `Tỷ lệ tiết kiệm hiện là ${financialStructure.planningSavingRate}%. Nên hướng tới 20%, cần tăng thêm khoảng ${formatVND(addAmount)}/tháng.`,
      tone: financialStructure.planningSavingRate < 10 ? "danger" : "warning",
      ctaLabel: "Xem giao dịch",
      ctaRoute: "/transactions",
    });
  }

  if (financialStructure.investmentRate < 15) {
    const targetInvestment = financialStructure.income * 0.15;
    const addInvestment = Math.max(
      targetInvestment - financialStructure.investmentAmount,
      0,
    );
    actions.push({
      title: "Tăng tốc đầu tư",
      body: `Tỷ lệ đầu tư hiện là ${financialStructure.investmentRate}%. Nếu nâng lên 15%, bạn cần bổ sung khoảng ${formatVND(addInvestment)}/tháng cho nhóm đầu tư.`,
      tone: financialStructure.investmentRate < 5 ? "danger" : "warning",
      ctaLabel: "Xem đầu tư",
      ctaRoute: "/investments",
    });
  }

  if (emergencyMonths < 3) {
    actions.push({
      title: "Củng cố quỹ khẩn cấp",
      body: `Quỹ khẩn cấp mới đạt ${Math.round(emergencyMonths * 10) / 10} tháng chi tiêu. Mốc tối thiểu nên là 3 tháng trước khi tăng rủi ro đầu tư.`,
      tone: emergencyMonths < 1 ? "danger" : "warning",
      ctaLabel: "Tạo mục tiêu",
      ctaRoute: "/goals",
    });
  }

  if (financialIndependence.progressPercent < 20) {
    actions.push({
      title: "Xây nền tự do tài chính",
      body: `FI Progress hiện là ${financialIndependence.progressPercent}%. Hãy ưu tiên tăng tài sản đầu tư đều đặn để rút ngắn khoảng cách ${formatVND(financialIndependence.remainingAmount)}.`,
      tone: "warning",
      ctaLabel: "Xem mục tiêu",
      ctaRoute: "/goals",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "Duy trì chiến lược hiện tại",
      body: "Cấu trúc tài chính đang cân bằng. Tiếp tục duy trì tiết kiệm, đầu tư định kỳ và kiểm soát chi phí biến đổi.",
      tone: "good",
      ctaLabel: "Xem báo cáo",
      ctaRoute: "/reports",
    });
  }

  const cfoScore = Math.round(
    financialStability.score * 0.45 +
      Math.min(financialIndependence.progressPercent * 2, 100) * 0.25 +
      Math.min(financialStructure.planningSavingRate * 4, 100) * 0.15 +
      Math.min(financialStructure.investmentRate * 5, 100) * 0.15,
  );

  const tone = getCfoTone(cfoScore);
  const label = getCfoLabel(cfoScore);

  const headline =
    tone === "good"
      ? "Tài chính đang đi đúng hướng"
      : tone === "warning"
        ? "Tài chính ổn nhưng cần tối ưu"
        : "Cần ưu tiên kiểm soát rủi ro";

  const summary =
    tone === "good"
      ? `Stability ${financialStability.score}/100, tiết kiệm ${financialStructure.planningSavingRate}% và đầu tư ${financialStructure.investmentRate}% cho thấy nền tài chính đang lành mạnh.`
      : tone === "warning"
        ? `Stability ${financialStability.score}/100. Điểm cần tối ưu chính là chi phí cố định, tỷ lệ tiết kiệm hoặc tốc độ đầu tư.`
        : `Stability ${financialStability.score}/100 đang thấp. Cần ưu tiên dòng tiền dương, quỹ khẩn cấp và giảm chi phí cố định.`;

  const boostedMonthlyInvestment =
    financialStructure.investmentAmount + financialStructure.income * 0.05;
  const remaining = financialIndependence.remainingAmount;
  const currentYears = financialIndependence.yearsToFI;
  const boostedYears =
    remaining > 0 && boostedMonthlyInvestment > 0
      ? Math.round((remaining / boostedMonthlyInvestment / 12) * 10) / 10
      : null;
  const accelerationInsight =
    currentYears !== null &&
    boostedYears !== null &&
    currentYears > boostedYears
      ? `Nếu tăng đầu tư thêm 5% thu nhập/tháng, thời gian đạt FI có thể rút ngắn khoảng ${Math.round((currentYears - boostedYears) * 10) / 10} năm.`
      : "Khi có dòng tiền đầu tư đều đặn hơn, hệ thống sẽ ước tính khả năng rút ngắn thời gian đạt FI.";

  const warning =
    financialStructure.fixedCostRatio > 60
      ? `Chi phí cố định ${financialStructure.fixedCostRatio}% vượt xa ngưỡng an toàn 40%.`
      : financialStructure.cashFlow < 0
        ? "Dòng tiền ròng đang âm, cần xử lý trước khi tăng đầu tư."
        : emergencyMonths < 1
          ? "Quỹ khẩn cấp dưới 1 tháng, rủi ro thanh khoản cao."
          : null;

  return {
    score: cfoScore,
    label,
    tone,
    headline,
    summary,
    priorityActions: actions.slice(0, 3),
    accelerationInsight,
    warning,
  };
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

/** Returns all 12 months of a calendar year as YYYY-MM strings. */
function getYearMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
}

/** Converts a date/string value to YYYY-MM. Empty string means invalid date. */
function getMonthKey(dateValue: string | Date): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return (
    date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0")
  );
}

/** Month key (YYYY-MM) → Vietnamese short label "T1" … "T12" */
function monthLabel(key: string): string {
  return "T" + parseInt(key.split("-")[1], 10);
}

export interface MonthlyCashFlow {
  month: string; // YYYY-MM
  label: string; // "T1" … "T12"
  thu: number; // income in VND (transfers excluded)
  chi: number; // real expense in VND (saving/investment/transfer excluded)
  tietKiem: number; // income − real expense
  tichLuy: number; // saving + investment allocations
}

/**
 * Builds real monthly cash-flow rows from actual transactions.
 * Transfer transactions are excluded from both income and expense.
 */
export function buildMonthlyCashFlowData(
  transactions: Transaction[],
  categoriesOrMonths: Category[] | number = 6,
  maybeMonths = 6,
  selectedYear?: number,
): MonthlyCashFlow[] {
  const categories = Array.isArray(categoriesOrMonths)
    ? categoriesOrMonths
    : [];
  const months = Array.isArray(categoriesOrMonths)
    ? maybeMonths
    : categoriesOrMonths;
  const categoryById = buildCategoryMap(categories);
  const monthKeys = Number.isFinite(selectedYear)
    ? getYearMonthKeys(Number(selectedYear))
    : getLastMonthKeys(months);

  return monthKeys.map((key) => {
    const txns = transactions.filter((t) => t.date.startsWith(key));
    const thu = txns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const chi = txns
      .filter((t) => isRealExpenseTransaction(t, categoryById))
      .reduce((sum, t) => sum + t.amount, 0);
    const tichLuy = txns
      .filter((t) => isFutureAllocationTransaction(t, categoryById))
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      month: key,
      label: monthLabel(key),
      thu,
      chi,
      tietKiem: thu - chi,
      tichLuy,
    };
  });
}

export interface MonthlyNetWorth {
  month: string; // YYYY-MM
  label: string; // "T1" … "T12"
  value: number | null; // null = no reliable historical net-worth snapshot
  hasData: boolean;
}

/**
 * Builds the net-worth trend without inventing historical balances.
 *
 * The current persisted wallet/savings/investment/debt snapshot is reliable, but older
 * months are not unless the app stores monthly snapshots. Do not walk backwards
 * from the current balance using this month's cash flow because it can create
 * fake negative balances for months with no data.
 */
export function buildMonthlyNetWorthData(
  input:
    | {
        wallets: Wallet[];
        savings?: SavingAccount[];
        investments: Investment[];
        debts: Debt[];
        transactions: Transaction[];
        categories?: Category[];
        months?: number;
        selectedYear?: number;
      }
    | Transaction[],
  legacyCurrentNetWorth?: number,
  legacyMonths = 6,
): MonthlyNetWorth[] {
  const isLegacyCall = Array.isArray(input);
  const currentNetWorth = isLegacyCall
    ? (legacyCurrentNetWorth ?? 0)
    : getNetWorth(
        input.wallets,
        input.debts,
        input.investments,
        input.savings ?? [],
      );
  const months = isLegacyCall ? legacyMonths : (input.months ?? 6);
  const keys =
    !isLegacyCall && Number.isFinite(input.selectedYear)
      ? getYearMonthKeys(Number(input.selectedYear))
      : getLastMonthKeys(months);
  const currentMonthKey = getMonthKey(new Date());

  return keys.map((key) => {
    const isCurrentMonth = key === currentMonthKey;

    return {
      month: key,
      label: monthLabel(key),
      value: isCurrentMonth ? currentNetWorth : null,
      hasData: isCurrentMonth,
    };
  });
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
  savings?: SavingAccount[];
  categories: Category[];
  summary?: DashboardSummary;
}): DashboardAction[] {
  const summary =
    input.summary ??
    calculateDashboardSummary({
      wallets: input.wallets,
      investments: input.investments,
      savings: input.savings ?? [],
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
    .map((budget) => {
      const category = input.categories.find(
        (item) => item.id === budget.categoryId,
      );
      const spent = spendingByCategoryId.get(budget.categoryId) ?? 0;
      const overAmount = spent - budget.limitAmount;
      const planningGroup = getCategoryPlanningGroup(category);

      return {
        budget,
        spent,
        overAmount,
        planningGroup,
        isControllable: planningGroup === "variable",
        categoryName: category?.name ?? "Khac",
      };
    })
    .filter((item) => item.overAmount > 0)
    .sort((a, b) => {
      if (a.isControllable !== b.isControllable) {
        return a.isControllable ? -1 : 1;
      }

      return b.overAmount - a.overAmount;
    })[0];

  if (overBudget) {
    actions.push({
      icon: "budget",
      title: `Vuot ngan sach: ${overBudget.categoryName}`,
      body: `Da chi ${formatVND(overBudget.spent)} tren han muc ${formatVND(overBudget.budget.limitAmount)} trong thang nay. Nhom: ${getPlanningGroupLabel(overBudget.planningGroup)}.`,
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
