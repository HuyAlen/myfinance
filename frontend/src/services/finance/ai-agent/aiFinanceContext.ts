import { supabase } from "@/src/lib/supabase";

import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getTransactions,
  getWallets,
} from "@/src/services/finance/financeStorage";
import {
  calculateDashboardSummary,
  filterBudgetsByDateRange,
  getFinancialGrade,
  filterTransactionsByDateRange,
  formatVND,
  getGoalEffectiveCurrentAmount,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
  SavingAccount,
} from "@/src/types/finance";

export type AIFinanceTone = "good" | "warning" | "danger" | "neutral";

export type AIFinanceTopCategory = {
  categoryId: string;
  categoryName: string;
  amount: number;
  amountLabel: string;
  percentOfExpense: number;
};

export type AIFinanceBudgetAlert = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  usedPercent: number;
  status: "safe" | "near_limit" | "over_limit";
};

export type AIFinanceGoalProgress = {
  goalId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  status: "not_started" | "in_progress" | "near_done" | "done";
};

export type AIFinanceHealthSnapshot = {
  score: number;
  grade: string;
  label: string;
  risk: "Thấp" | "Trung bình" | "Cao" | "Rất cao";
  tone: AIFinanceTone;
  savingScore: number;
  debtScore: number;
  emergencyScore: number;
  goalScore: number;
  emergencyMonths: number;
};

export type AIFinanceContext = {
  generatedAt: string;
  month: string;
  range: {
    startDate: string;
    endDate: string;
  };
  raw: {
    wallets: Wallet[];
    savings: SavingAccount[];
    categories: Category[];
    transactions: Transaction[];
    budgets: Budget[];
    goals: Goal[];
    debts: Debt[];
    investments: Investment[];
  };
  counts: {
    wallets: number;
    savings: number;
    transactions: number;
    budgets: number;
    goals: number;
    debts: number;
    investments: number;
  };
  snapshot: {
    netWorth: number;
    netWorthLabel: string;
    totalAssets: number;
    totalAssetsLabel: string;
    totalDebt: number;
    totalDebtLabel: string;
    liquidBalance: number;
    liquidBalanceLabel: string;
    investmentAssets: number;
    investmentAssetsLabel: string;
    /** Backward compatible scalar. Same value as health.score. */
    healthScore: number;
    /** Backward compatible tone. Same value as health.tone. */
    healthTone: AIFinanceTone;
    /** Authoritative dashboard health score snapshot. AI must not recalculate this. */
    health: AIFinanceHealthSnapshot;
  };
  cashflow: {
    income: number;
    incomeLabel: string;
    expense: number;
    expenseLabel: string;
    netCashFlow: number;
    netCashFlowLabel: string;
    savingRate: number;
    savingRateLabel: string;
    tone: AIFinanceTone;
  };
  budgets: {
    totalLimit: number;
    totalLimitLabel: string;
    totalSpent: number;
    totalSpentLabel: string;
    totalRemaining: number;
    totalRemainingLabel: string;
    usedPercent: number;
    alerts: AIFinanceBudgetAlert[];
    nearLimitCount: number;
    overLimitCount: number;
  };
  spending: {
    topCategories: AIFinanceTopCategory[];
    largestTransaction: {
      id: string;
      amount: number;
      amountLabel: string;
      categoryName: string;
      note: string;
      date: string;
    } | null;
  };
  goals: {
    items: AIFinanceGoalProgress[];
    total: number;
    done: number;
    nearDone: number;
    averageProgress: number;
  };
  contextText: string;
};

type AIFinanceSavingRow = {
  id: string;
  name: string;
  type: SavingAccount["type"];
  balance: number | string | null;
  principal?: number | string | null;
  principal_amount?: number | string | null;
  initial_amount?: number | string | null;
  opening_amount?: number | string | null;
  deposit_amount?: number | string | null;
  interest_rate?: number | string | null;
  maturity_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function toFiniteNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSavingRowToSavingAccount(row: AIFinanceSavingRow): SavingAccount {
  const principal = toFiniteNumber(
    row.principal ??
      row.principal_amount ??
      row.initial_amount ??
      row.opening_amount ??
      row.deposit_amount ??
      row.balance ??
      0,
  );

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: toFiniteNumber(row.balance),
    targetAmount: principal,
    interestRate:
      row.interest_rate === null || row.interest_rate === undefined
        ? undefined
        : toFiniteNumber(row.interest_rate),
    maturityDate: row.maturity_date ?? undefined,
    notes: row.notes ?? undefined,
  };
}

async function getSavingsForAIFinanceContext(): Promise<SavingAccount[]> {
  try {
    const { data, error } = await supabase
      .from("savings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return [];
    return ((data ?? []) as AIFinanceSavingRow[]).map(
      mapSavingRowToSavingAccount,
    );
  } catch {
    return [];
  }
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), 100));
}

/**
 * Must stay aligned with DashboardPage health widget.
 *
 * Do not use calculateDashboardSummary.financialHealthScore here because the
 * dashboard currently applies the newer V2 weights:
 * - Saving rate: 30%
 * - Debt safety: 30%
 * - Emergency fund: 25%
 * - Goal progress: 15%
 *
 * It also evaluates emergency fund from savings marked as emergency_fund,
 * not only liquid wallet balance. This is why old AI answers could show
 * 55/57 while Dashboard showed a healthier score.
 */
function calculateDashboardAlignedHealth(input: {
  savingRate: number;
  debtRatio: number;
  goalScore: number;
  emergencyMonthsExact: number;
}) {
  const savingScore = clampScore(input.savingRate * 2.5);
  const debtScore = clampScore(100 - input.debtRatio);
  const goalScore = clampScore(input.goalScore);
  const emergencyScore = clampScore((input.emergencyMonthsExact / 6) * 100);

  const score = Math.round(
    savingScore * 0.3 +
      debtScore * 0.3 +
      emergencyScore * 0.25 +
      goalScore * 0.15,
  );

  return {
    score,
    savingScore,
    debtScore,
    emergencyScore,
    goalScore,
  };
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function getHealthTone(score: number): AIFinanceTone {
  if (score >= 70) return "good";
  if (score >= 50) return "warning";
  return "danger";
}

function getHealthRisk(score: number): AIFinanceHealthSnapshot["risk"] {
  if (score >= 80) return "Thấp";
  if (score >= 60) return "Trung bình";
  if (score >= 50) return "Cao";
  return "Rất cao";
}

function getCashflowTone(netCashFlow: number): AIFinanceTone {
  if (netCashFlow > 0) return "good";
  if (netCashFlow === 0) return "neutral";
  return "danger";
}

function getCategoryName(categoryById: Map<string, Category>, id: string) {
  return categoryById.get(id)?.name ?? "Chưa phân loại";
}

function buildTopCategories(input: {
  transactions: Transaction[];
  categories: Category[];
  totalExpense: number;
}): AIFinanceTopCategory[] {
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const expenseByCategory = new Map<string, number>();

  for (const transaction of input.transactions) {
    if (transaction.type !== "expense") continue;
    expenseByCategory.set(
      transaction.categoryId,
      (expenseByCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  return Array.from(expenseByCategory.entries())
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: getCategoryName(categoryById, categoryId),
      amount,
      amountLabel: formatVND(amount),
      percentOfExpense: percent(amount, input.totalExpense),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

function buildBudgetAlerts(input: {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
}): AIFinanceBudgetAlert[] {
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));

  return input.budgets
    .map((budget): AIFinanceBudgetAlert => {
      const spentAmount = input.transactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.categoryId === budget.categoryId,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const usedPercent = percent(spentAmount, budget.limitAmount);
      const remainingAmount = Math.max(budget.limitAmount - spentAmount, 0);
      const warningThreshold = budget.warningThreshold ?? 80;
      const criticalThreshold = budget.criticalThreshold ?? 100;
      const status: AIFinanceBudgetAlert["status"] =
        usedPercent >= criticalThreshold
          ? "over_limit"
          : usedPercent >= warningThreshold
            ? "near_limit"
            : "safe";

      return {
        budgetId: budget.id,
        categoryId: budget.categoryId,
        categoryName: getCategoryName(categoryById, budget.categoryId),
        limitAmount: budget.limitAmount,
        spentAmount,
        remainingAmount,
        usedPercent,
        status,
      };
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
}

function buildGoalProgress(input: {
  goals: Goal[];
  transactions: Transaction[];
}): AIFinanceGoalProgress[] {
  return input.goals
    .map((goal): AIFinanceGoalProgress => {
      const currentAmount = getGoalEffectiveCurrentAmount({
        goal,
        transactions: input.transactions,
      });
      const progressPercent = percent(currentAmount, goal.targetAmount);
      const remainingAmount = Math.max(goal.targetAmount - currentAmount, 0);
      const status: AIFinanceGoalProgress["status"] =
        progressPercent >= 100
          ? "done"
          : progressPercent >= 75
            ? "near_done"
            : progressPercent > 0
              ? "in_progress"
              : "not_started";

      return {
        goalId: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount,
        remainingAmount,
        progressPercent,
        status,
      };
    })
    .sort((a, b) => b.progressPercent - a.progressPercent);
}

function findLargestExpense(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  const categoryById = new Map(input.categories.map((item) => [item.id, item]));
  const largest = input.transactions
    .filter((transaction) => transaction.type === "expense")
    .sort((a, b) => b.amount - a.amount)[0];

  if (!largest) return null;

  return {
    id: largest.id,
    amount: largest.amount,
    amountLabel: formatVND(largest.amount),
    categoryName: getCategoryName(categoryById, largest.categoryId),
    note: largest.note,
    date: largest.date,
  };
}

function buildContextText(context: Omit<AIFinanceContext, "contextText">) {
  const topCategories = context.spending.topCategories
    .map(
      (item) =>
        `- ${item.categoryName}: ${item.amountLabel} (${item.percentOfExpense}%)`,
    )
    .join("\n");
  const budgetAlerts = context.budgets.alerts
    .filter((item) => item.status !== "safe")
    .slice(0, 5)
    .map(
      (item) =>
        `- ${item.categoryName}: ${item.usedPercent}% (${formatVND(item.spentAmount)} / ${formatVND(item.limitAmount)})`,
    )
    .join("\n");
  const goals = context.goals.items
    .slice(0, 5)
    .map(
      (item) =>
        `- ${item.name}: ${item.progressPercent}% (${formatVND(item.currentAmount)} / ${formatVND(item.targetAmount)})`,
    )
    .join("\n");

  return [
    `Kỳ phân tích: ${context.month}`,
    `Tài sản ròng: ${context.snapshot.netWorthLabel}`,
    `Điểm sức khỏe tài chính: ${context.snapshot.health.score}/100 (${context.snapshot.health.grade} - ${context.snapshot.health.label}, rủi ro: ${context.snapshot.health.risk})`,
    `Thu nhập: ${context.cashflow.incomeLabel}`,
    `Chi tiêu: ${context.cashflow.expenseLabel}`,
    `Dòng tiền ròng: ${context.cashflow.netCashFlowLabel}`,
    `Tỷ lệ tiết kiệm: ${context.cashflow.savingRateLabel}`,
    `Ngân sách đã dùng: ${context.budgets.usedPercent}%`,
    `Ngân sách gần/vượt hạn mức: ${context.budgets.nearLimitCount}/${context.budgets.overLimitCount}`,
    "Top chi tiêu:",
    topCategories || "- Chưa có dữ liệu chi tiêu",
    "Cảnh báo ngân sách:",
    budgetAlerts || "- Không có cảnh báo ngân sách",
    "Mục tiêu:",
    goals || "- Chưa có mục tiêu",
  ].join("\n");
}

export async function buildAIFinanceContext(
  month = getCurrentMonthKey(),
): Promise<AIFinanceContext> {
  const range = getMonthRange(month);

  const [
    wallets,
    savings,
    categories,
    transactions,
    debts,
    goals,
    budgets,
    investments,
  ] = await Promise.all([
    getWallets(),
    getSavingsForAIFinanceContext(),
    getCategories(),
    getTransactions(),
    getDebts(),
    getGoals(),
    getBudgets(),
    getInvestments(),
  ]);

  const scopedTransactions = filterTransactionsByDateRange(transactions, range);
  const scopedBudgets = filterBudgetsByDateRange(budgets, range);
  const dashboard = calculateDashboardSummary({
    wallets,
    savings,
    investments,
    debts,
    transactions: scopedTransactions,
    categories,
    goals,
  });

  const income = getTotalIncome(scopedTransactions);
  const expense = getTotalExpense(scopedTransactions, categories);
  const emergencyFund = savings
    .filter((item) => item.type === "emergency_fund")
    .reduce((sum, item) => sum + item.balance, 0);
  const emergencyMonthsExact =
    dashboard.monthlyExpense > 0 ? emergencyFund / dashboard.monthlyExpense : 0;
  const dashboardHealth = calculateDashboardAlignedHealth({
    savingRate: dashboard.savingRate,
    debtRatio: dashboard.debtRatio,
    goalScore: dashboard.goalScore,
    emergencyMonthsExact,
  });
  const healthScore = dashboardHealth.score;
  const healthTone = getHealthTone(healthScore);
  const healthGrade = getFinancialGrade(healthScore);

  const netCashFlow = income - expense;
  const savingRate =
    income > 0 ? Math.round((netCashFlow / income) * 1000) / 10 : 0;
  const budgetAlerts = buildBudgetAlerts({
    budgets: scopedBudgets,
    transactions: scopedTransactions,
    categories,
  });
  const totalLimit = scopedBudgets.reduce(
    (sum, item) => sum + item.limitAmount,
    0,
  );
  const totalSpent = budgetAlerts.reduce(
    (sum, item) => sum + item.spentAmount,
    0,
  );
  const totalRemaining = Math.max(totalLimit - totalSpent, 0);
  const goalItems = buildGoalProgress({ goals, transactions });
  const averageProgress =
    goalItems.length > 0
      ? Math.round(
          goalItems.reduce((sum, item) => sum + item.progressPercent, 0) /
            goalItems.length,
        )
      : 0;

  const contextWithoutText: Omit<AIFinanceContext, "contextText"> = {
    generatedAt: new Date().toISOString(),
    month,
    range,
    raw: {
      wallets,
      savings,
      categories,
      transactions: scopedTransactions,
      budgets: scopedBudgets,
      goals,
      debts,
      investments,
    },
    counts: {
      wallets: wallets.length,
      savings: savings.length,
      transactions: scopedTransactions.length,
      budgets: scopedBudgets.length,
      goals: goals.length,
      debts: debts.length,
      investments: investments.length,
    },
    snapshot: {
      netWorth: dashboard.netWorth,
      netWorthLabel: formatVND(dashboard.netWorth),
      totalAssets: dashboard.totalAssets,
      totalAssetsLabel: formatVND(dashboard.totalAssets),
      totalDebt: dashboard.totalDebt,
      totalDebtLabel: formatVND(dashboard.totalDebt),
      liquidBalance: dashboard.liquidBalance,
      liquidBalanceLabel: formatVND(dashboard.liquidBalance),
      investmentAssets: dashboard.investmentAssets,
      investmentAssetsLabel: formatVND(dashboard.investmentAssets),
      healthScore,
      healthTone,
      health: {
        score: healthScore,
        grade: healthGrade.grade,
        label: healthGrade.label,
        risk: getHealthRisk(healthScore),
        tone: healthTone,
        savingScore: dashboardHealth.savingScore,
        debtScore: dashboardHealth.debtScore,
        emergencyScore: dashboardHealth.emergencyScore,
        goalScore: dashboardHealth.goalScore,
        emergencyMonths: Math.round(emergencyMonthsExact * 10) / 10,
      },
    },
    cashflow: {
      income,
      incomeLabel: formatVND(income),
      expense,
      expenseLabel: formatVND(expense),
      netCashFlow,
      netCashFlowLabel: formatVND(netCashFlow),
      savingRate,
      savingRateLabel: `${savingRate}%`,
      tone: getCashflowTone(netCashFlow),
    },
    budgets: {
      totalLimit,
      totalLimitLabel: formatVND(totalLimit),
      totalSpent,
      totalSpentLabel: formatVND(totalSpent),
      totalRemaining,
      totalRemainingLabel: formatVND(totalRemaining),
      usedPercent: percent(totalSpent, totalLimit),
      alerts: budgetAlerts,
      nearLimitCount: budgetAlerts.filter(
        (item) => item.status === "near_limit",
      ).length,
      overLimitCount: budgetAlerts.filter(
        (item) => item.status === "over_limit",
      ).length,
    },
    spending: {
      topCategories: buildTopCategories({
        transactions: scopedTransactions,
        categories,
        totalExpense: expense,
      }),
      largestTransaction: findLargestExpense({
        transactions: scopedTransactions,
        categories,
      }),
    },
    goals: {
      items: goalItems,
      total: goalItems.length,
      done: goalItems.filter((item) => item.status === "done").length,
      nearDone: goalItems.filter((item) => item.status === "near_done").length,
      averageProgress,
    },
  };

  return {
    ...contextWithoutText,
    contextText: buildContextText(contextWithoutText),
  };
}

export function buildAIFinanceMockAnswer(
  question: string,
  context: AIFinanceContext | null,
) {
  if (!context) {
    return [
      "Tổng quan",
      "Tôi chưa đọc được dữ liệu tài chính thật trong app.",
      "",
      "Gợi ý hành động",
      "Bạn thử đóng/mở lại AI hoặc kiểm tra kết nối dữ liệu Supabase.",
    ].join("\n");
  }

  const lower = question.toLowerCase();

  if (lower.includes("ngân sách") || lower.includes("budget")) {
    const riskyBudgets = context.budgets.alerts.filter(
      (item) => item.status !== "safe",
    );

    return [
      "Tổng quan",
      `Tháng ${context.month}, bạn đã dùng ${context.budgets.usedPercent}% tổng ngân sách (${context.budgets.totalSpentLabel} / ${context.budgets.totalLimitLabel}).`,
      "",
      "Phân tích chính",
      riskyBudgets.length > 0
        ? riskyBudgets
            .slice(0, 3)
            .map(
              (item) =>
                `• ${item.categoryName}: ${item.usedPercent}% ngân sách`,
            )
            .join("\n")
        : "Hiện chưa có ngân sách nào gần/vượt hạn mức.",
      "",
      "Gợi ý hành động",
      context.budgets.overLimitCount > 0
        ? "Ưu tiên dừng hoặc giảm chi ở nhóm đã vượt hạn mức trước."
        : "Tiếp tục theo dõi nhóm gần 80% để tránh vượt ngân sách cuối tháng.",
    ].join("\n");
  }

  if (
    lower.includes("cuối tháng") ||
    lower.includes("dòng tiền") ||
    lower.includes("cashflow")
  ) {
    return [
      "Tổng quan",
      `Dòng tiền ròng tháng ${context.month} hiện là ${context.cashflow.netCashFlowLabel}.`,
      "",
      "Phân tích chính",
      `Thu nhập: ${context.cashflow.incomeLabel}\nChi tiêu: ${context.cashflow.expenseLabel}\nTỷ lệ tiết kiệm: ${context.cashflow.savingRateLabel}`,
      "",
      "Gợi ý hành động",
      context.cashflow.netCashFlow >= 0
        ? "Dòng tiền đang dương. Có thể phân bổ phần dư cho quỹ khẩn cấp, tiết kiệm hoặc đầu tư."
        : "Dòng tiền đang âm. Nên kiểm tra lại top chi tiêu và ngân sách vượt hạn mức.",
    ].join("\n");
  }

  if (lower.includes("tiêu") || lower.includes("chi")) {
    return [
      "Tổng quan",
      `Tổng chi tiêu tháng ${context.month} là ${context.cashflow.expenseLabel}.`,
      "",
      "Top chi tiêu",
      context.spending.topCategories.length > 0
        ? context.spending.topCategories
            .slice(0, 5)
            .map(
              (item) =>
                `• ${item.categoryName}: ${item.amountLabel} (${item.percentOfExpense}%)`,
            )
            .join("\n")
        : "Chưa có giao dịch chi tiêu trong kỳ này.",
      "",
      "Gợi ý hành động",
      "Tập trung tối ưu nhóm chi tiêu lớn nhất trước vì đây là nơi tác động nhanh nhất đến dòng tiền.",
    ].join("\n");
  }

  if (lower.includes("mục tiêu") || lower.includes("goal")) {
    return [
      "Tổng quan",
      `Bạn có ${context.goals.total} mục tiêu. Tiến độ trung bình là ${context.goals.averageProgress}%.`,
      "",
      "Mục tiêu nổi bật",
      context.goals.items.length > 0
        ? context.goals.items
            .slice(0, 5)
            .map((item) => `• ${item.name}: ${item.progressPercent}%`)
            .join("\n")
        : "Chưa có mục tiêu nào.",
      "",
      "Gợi ý hành động",
      context.goals.nearDone > 0
        ? "Có mục tiêu gần hoàn thành. Nên ưu tiên nạp thêm để đóng mục tiêu sớm."
        : "Nên thiết lập mục tiêu có deadline và số tiền đóng góp hàng tháng.",
    ].join("\n");
  }

  return [
    "Tổng quan",
    `Tôi đã đọc dữ liệu thật tháng ${context.month}. Tài sản ròng hiện là ${context.snapshot.netWorthLabel}.`,
    "",
    "Phân tích nhanh",
    `• Thu nhập: ${context.cashflow.incomeLabel}\n• Chi tiêu: ${context.cashflow.expenseLabel}\n• Dòng tiền ròng: ${context.cashflow.netCashFlowLabel}\n• Điểm sức khỏe tài chính: ${context.snapshot.health.score}/100 (${context.snapshot.health.grade} - ${context.snapshot.health.label})`,
    "",
    "Gợi ý hành động",
    "Bạn có thể hỏi tiếp: ngân sách nào sắp vượt, tháng này tiêu nhiều nhất ở đâu, hoặc dòng tiền cuối tháng ra sao.",
  ].join("\n");
}
