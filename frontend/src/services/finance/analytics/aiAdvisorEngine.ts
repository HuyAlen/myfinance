/**
 * analytics/aiAdvisorEngine.ts
 *
 * Orchestrates all financial analytics modules and produces a single
 * AdvisorResult that the UI can consume without containing any logic.
 *
 * Design principles:
 *  - Pure function: same inputs → same outputs.
 *  - No React imports, no JSX, no side effects.
 *  - Icon intent expressed as `InsightIconType` strings; the UI maps
 *    them to actual React nodes so this module stays test-friendly.
 */

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

import {
  formatVND,
  getDebtRatio,
  getGoalScore,
  getSavingRate,
  getSpendingByCategory,
  getTotalAssets,
  getTotalDebt,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import { computeHealthScoreV2, type HealthScoreV2 } from "./healthScore";
import { computeRiskScore, type RiskScore } from "./riskAnalytics";
import {
  detectSpendingAnomalies,
  type SpendingAnomaly,
} from "./spendingAnalytics";
import {
  computeMonthlyForecast,
  type MonthlyForecast,
} from "./forecastAnalytics";
import { predictGoalAchievement, type GoalPrediction } from "./goalAnalytics";
import {
  computeEmergencyFund,
  type EmergencyFundAnalysis,
} from "./emergencyFund";
import { computeFireAnalysis, type FireAnalysis } from "./fireCalculator";
import { computeSmartBudget, type SmartBudgetAnalysis } from "./smartBudget";
import {
  computeFinancialForecast,
  type FinancialForecast,
} from "./forecastEngine";
import {
  type InsightData,
  type InsightIconType,
  type InsightTone,
} from "./types";

// Re-export insight types for consumers that import from this module.
export type { InsightData, InsightIconType, InsightTone };

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Breakdown of a spending category used in the summary section. */
export type SpendingCategoryBreakdown = {
  name: string;
  value: number;
  percent: number;
};

/** High-level financial metrics derived from raw data. */
export type AdvisorMetrics = {
  totalAssets: number;
  totalDebt: number;
  income: number;
  expense: number;
  saving: number;
  /** Saving rate as a percentage (0–100). */
  savingRate: number;
  /** Debt ratio as a percentage (0–100). */
  debtRatio: number;
  /** Average goal completion percentage (0–100). */
  goalScore: number;
  /** V1 rule-based health score (kept for backward compatibility). */
  healthScore: number;
  spendingByCategory: SpendingCategoryBreakdown[];
  topSpending: SpendingCategoryBreakdown | undefined;
};

/** Complete output of the AI advisor — everything the UI needs to render. */
export type AdvisorResult = AdvisorMetrics & {
  insights: InsightData[];
  actionItems: string[];
  healthV2: HealthScoreV2;
  riskScore: RiskScore;
  emergencyFund: EmergencyFundAnalysis;
  fire: FireAnalysis;
  smartBudget: SmartBudgetAnalysis;
  financialForecast: FinancialForecast;
  anomalies: SpendingAnomaly[];
  /** @deprecated Use financialForecast instead. Kept for backward compat. */
  forecast: MonthlyForecast;
  goalPredictions: GoalPrediction[];
};

/** All raw data needed to run the advisor. */
export type AdvisorInput = {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  debts: Debt[];
  goals: Goal[];
  investments: Investment[];
  budgets: Budget[];
};

// ─── Private Helpers ──────────────────────────────────────────────────────────

function computeMetrics(input: AdvisorInput): AdvisorMetrics {
  const { wallets, debts, transactions, categories, goals } = input;

  const totalAssets = getTotalAssets(wallets);
  const totalDebt = getTotalDebt(debts);
  const income = getTotalIncome(transactions);
  const expense = getTotalExpense(transactions);
  const saving = income - expense;
  const savingRate = getSavingRate(income, expense);
  const debtRatio = getDebtRatio(totalDebt, totalAssets);
  const goalScore = getGoalScore(goals);
  const spendingByCategory = getSpendingByCategory(transactions, categories);
  const topSpending = spendingByCategory[0];

  // V1 rule-based health score (kept for backward compat — V2 is preferred)
  let healthScore = 50;
  if (saving > 0) healthScore += 15;
  if (savingRate >= 20) healthScore += 15;
  if (savingRate >= 40) healthScore += 10;
  if (debtRatio <= 40) healthScore += 10;
  if (goalScore >= 50) healthScore += 10;
  healthScore = Math.min(healthScore, 100);

  return {
    totalAssets,
    totalDebt,
    income,
    expense,
    saving,
    savingRate,
    debtRatio,
    goalScore,
    healthScore,
    spendingByCategory,
    topSpending,
  };
}

function generateInsights(metrics: AdvisorMetrics): InsightData[] {
  const insights: InsightData[] = [];

  // ── Cash flow ─────────────────────────────────────────────────────────────
  if (metrics.saving >= 0) {
    insights.push({
      key: "cash-flow-positive",
      title: "Dòng tiền đang tích cực",
      text: `Bạn đang dư ${formatVND(metrics.saving)} sau khi trừ chi tiêu. Đây là tín hiệu tốt để tăng tiết kiệm hoặc đầu tư.`,
      tone: "good",
      iconType: "trending-up",
    });
  } else {
    insights.push({
      key: "cash-flow-negative",
      title: "Dòng tiền đang âm",
      text: `Bạn đang chi vượt thu ${formatVND(Math.abs(metrics.saving))}. Nên rà soát các khoản chi lớn trong tháng.`,
      tone: "danger",
      iconType: "trending-down",
    });
  }

  // ── Saving rate ───────────────────────────────────────────────────────────
  if (metrics.savingRate >= 40) {
    insights.push({
      key: "saving-high",
      title: "Tỷ lệ tiết kiệm rất tốt",
      text: `Tỷ lệ tiết kiệm hiện tại là ${metrics.savingRate}%. Đây là mức rất mạnh để xây dựng tài sản dài hạn.`,
      tone: "good",
      iconType: "piggy-bank",
    });
  } else if (metrics.savingRate >= 20) {
    insights.push({
      key: "saving-ok",
      title: "Tỷ lệ tiết kiệm ổn",
      text: `Tỷ lệ tiết kiệm hiện tại là ${metrics.savingRate}%. Bạn có thể đặt mục tiêu nâng lên 30-40%.`,
      tone: "info",
      iconType: "piggy-bank",
    });
  } else {
    insights.push({
      key: "saving-low",
      title: "Tỷ lệ tiết kiệm còn thấp",
      text: `Tỷ lệ tiết kiệm hiện tại là ${metrics.savingRate}%. Nên tối ưu chi tiêu để đạt tối thiểu 20%.`,
      tone: "warning",
      iconType: "alert-triangle",
    });
  }

  // ── Debt ratio ────────────────────────────────────────────────────────────
  if (metrics.debtRatio <= 30) {
    insights.push({
      key: "debt-safe",
      title: "Mức nợ an toàn",
      text: `Tỷ lệ nợ hiện tại là ${metrics.debtRatio}%, đang ở vùng khá an toàn so với tổng tài sản.`,
      tone: "good",
      iconType: "shield-check",
    });
  } else if (metrics.debtRatio <= 50) {
    insights.push({
      key: "debt-warning",
      title: "Cần theo dõi tỷ lệ nợ",
      text: `Tỷ lệ nợ hiện tại là ${metrics.debtRatio}%. Bạn nên tránh tăng thêm nợ trong thời gian tới.`,
      tone: "warning",
      iconType: "shield-check",
    });
  } else {
    insights.push({
      key: "debt-high",
      title: "Tỷ lệ nợ cao",
      text: `Tỷ lệ nợ hiện tại là ${metrics.debtRatio}%. Nên ưu tiên kế hoạch trả nợ trước khi tăng đầu tư.`,
      tone: "danger",
      iconType: "alert-triangle",
    });
  }

  // ── Top spending category ─────────────────────────────────────────────────
  if (metrics.topSpending) {
    insights.push({
      key: "top-spending",
      title: `Danh mục chi lớn nhất: ${metrics.topSpending.name}`,
      text: `${metrics.topSpending.name} chiếm ${metrics.topSpending.percent}% tổng chi, tương đương ${formatVND(metrics.topSpending.value)}. Đây là nơi nên kiểm tra đầu tiên nếu muốn giảm chi phí.`,
      tone: metrics.topSpending.percent >= 30 ? "warning" : "info",
      iconType: "lightbulb",
    });
  }

  // ── Goal progress ─────────────────────────────────────────────────────────
  if (metrics.goalScore >= 60) {
    insights.push({
      key: "goal-good",
      title: "Mục tiêu đang tiến triển tốt",
      text: `Tiến độ mục tiêu trung bình là ${metrics.goalScore}%. Nếu duy trì tốc độ này, bạn đang đi đúng hướng.`,
      tone: "good",
      iconType: "target",
    });
  } else {
    insights.push({
      key: "goal-poor",
      title: "Mục tiêu cần được ưu tiên hơn",
      text: `Tiến độ mục tiêu trung bình là ${metrics.goalScore}%. Hãy cân nhắc tự động trích một phần thu nhập cho mục tiêu.`,
      tone: "warning",
      iconType: "target",
    });
  }

  return insights;
}

function generateInsightsWithEmergency(
  metrics: AdvisorMetrics,
  emergency: EmergencyFundAnalysis,
  fire: FireAnalysis,
  budget: SmartBudgetAnalysis,
  forecast: FinancialForecast,
): InsightData[] {
  const base = generateInsights(metrics);
  // Insert emergency fund insight at index 2, FIRE insight at index 3
  const insertAt = Math.min(2, base.length);
  return [
    ...base.slice(0, insertAt),
    emergency.insight,
    fire.insight,
    ...base.slice(insertAt),
    ...budget.insights,
    forecast.insight,
  ];
}

function generateActionItems(metrics: AdvisorMetrics): string[] {
  const items: string[] = [];

  if (metrics.savingRate < 20) {
    items.push("Giảm 5-10% chi tiêu ở danh mục lớn nhất trong tháng.");
    items.push("Tạo ngân sách cố định cho ăn uống, mua sắm và giải trí.");
  }

  if (metrics.debtRatio > 40) {
    items.push("Ưu tiên trả bớt nợ trước khi tăng đầu tư.");
  }

  if (metrics.goalScore < 60) {
    items.push("Tăng khoản đóng góp cho mục tiêu tài chính thêm 5% thu nhập.");
  }

  if (metrics.saving > 0) {
    items.push("Chuyển một phần dòng tiền dư sang quỹ khẩn cấp hoặc đầu tư.");
  }

  if (items.length === 0) {
    items.push("Duy trì thói quen hiện tại và kiểm tra báo cáo mỗi tuần.");
  }

  return items;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Single entry-point for the AI advisor.
 *
 * Runs all analytics modules in one call and returns a flat `AdvisorResult`
 * that the UI can destructure without containing any financial logic.
 *
 * @example
 * ```typescript
 * const advisor = runAdvisor({ wallets, categories, transactions, debts, goals, investments, budgets });
 * // advisor.healthV2.total, advisor.insights, advisor.anomalies, …
 * ```
 */
export function runAdvisor(input: AdvisorInput): AdvisorResult {
  const {
    wallets,
    categories,
    transactions,
    debts,
    goals,
    investments,
    budgets,
  } = input;

  const metrics = computeMetrics(input);
  const emergency = computeEmergencyFund(wallets, transactions);
  const fire = computeFireAnalysis(wallets, debts, investments, transactions);
  const smartBudget = computeSmartBudget(transactions, categories, budgets);
  const financialForecast = computeFinancialForecast(
    wallets,
    debts,
    investments,
    transactions,
  );

  return {
    ...metrics,
    insights: generateInsightsWithEmergency(
      metrics,
      emergency,
      fire,
      smartBudget,
      financialForecast,
    ),
    actionItems: generateActionItems(metrics),
    healthV2: computeHealthScoreV2(
      wallets,
      debts,
      goals,
      investments,
      transactions,
      budgets,
      categories,
    ),
    riskScore: computeRiskScore(
      wallets,
      debts,
      goals,
      transactions,
      investments,
    ),
    emergencyFund: emergency,
    fire,
    smartBudget,
    financialForecast,
    anomalies: detectSpendingAnomalies(transactions, categories),
    forecast: computeMonthlyForecast(transactions),
    goalPredictions: predictGoalAchievement(goals, transactions),
  };
}
