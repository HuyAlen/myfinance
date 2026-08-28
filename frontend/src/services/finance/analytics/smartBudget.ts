/**
 * analytics/smartBudget.ts
 *
 * Smart Budget AI — Sprint 17.5.
 *
 * Analyses actual spending vs. budgets, detects violations and trends,
 * and generates recommended budget limits and budget-native insights.
 *
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type { Budget, Category, Transaction } from "@/src/types/finance";

import {
  calculateBudgetSpending,

} from "@/src/services/finance/financeCalculations";

import { lastNMonths, linearRegression, mean } from "./shared";
import type { InsightData } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BudgetStatus =
  | "over" // spending exceeded budget
  | "near" // spending ≥ 85% of budget
  | "on-track" // spending < 85% of budget
  | "no-budget" // no budget set for this category
  | "no-spend"; // budget set but zero spending

export type SpendingTrend = "increasing" | "stable" | "decreasing";

/** Per-category analysis — actual spend vs. budget vs. trend. */
export type CategoryBudgetAnalysis = {
  categoryId: string;
  categoryName: string;
  /** Budget limit for the current month. 0 if no budget set. */
  budgetLimit: number;
  /** Actual spending in the current month. */
  actualSpend: number;
  /** actualSpend − budgetLimit. Positive = over budget. */
  variance: number;
  /** (actualSpend / budgetLimit × 100). 0 if no budget. */
  usagePercent: number;
  /** 3-month spending trend derived from linear regression slope. */
  trend: SpendingTrend;
  /** Month-over-month growth rate (positive = rising). */
  trendRate: number;
  status: BudgetStatus;
};

/** A budget that was exceeded in the current month. */
export type BudgetViolation = {
  categoryId: string;
  categoryName: string;
  budgetLimit: number;
  actualSpend: number;
  overage: number; // actualSpend − budgetLimit
  overagePercent: number; // (overage / budgetLimit) × 100
};

/** AI-generated recommended budget limit for a category. */
export type RecommendedBudget = {
  categoryId: string;
  categoryName: string;
  currentLimit: number; // existing budget limit (0 if none)
  recommended: number; // suggested new limit
  reasoning: string; // Vietnamese explanation
};

export type SmartBudgetAnalysis = {
  /** Budget adherence score 0–100. */
  adherenceScore: number;
  /** Current month key "YYYY-MM". */
  currentMonth: string;
  /** Per-category breakdown (expense categories only). */
  categoryAnalysis: CategoryBudgetAnalysis[];
  /** Budgets exceeded in the current month. Sorted by overage% descending. */
  violations: BudgetViolation[];
  /** Categories with increasing 3-month spend trend. */
  overspendingTrend: CategoryBudgetAnalysis[];
  /** AI-recommended budget limits per category. */
  recommendedBudgets: RecommendedBudget[];
  /** Pre-formed insights for injection into the advisor insights list. */
  insights: InsightData[];
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Round to nearest 10,000 VND. */
function round10k(value: number): number {
  return Math.round(value / 10_000) * 10_000;
}

/** Vietnamese format (no React dep). */
function fmtVND(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + " đ";
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Full Smart Budget analysis.
 *
 * @param transactions  All transactions.
 * @param categories    All categories (expense types used).
 * @param budgets       Configured budget limits.
 * @param lookbackMonths  Months used for trend/average (default 3).
 */
export function computeSmartBudget(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  lookbackMonths = 3,
): SmartBudgetAnalysis {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = lastNMonths(lookbackMonths + 1); // +1 so current month is always included
  const expenseCategories = categories.filter((c) => c.type === "expense");

  // ── Per-category analysis ─────────────────────────────────────────────────
  const categoryAnalysis: CategoryBudgetAnalysis[] = expenseCategories.map(
    (cat): CategoryBudgetAnalysis => {
      // Budget for current month
      const budget = budgets.find(
        (b) => b.categoryId === cat.id && b.month === currentMonth,
      );
      const budgetLimit = budget?.limitAmount ?? 0;

      // Spending in current month — canonical Budget Spending Engine, so a
      // category's spend is computed identically here and on BudgetsPage.
      const actualSpend = calculateBudgetSpending({
        budget: budget ?? {
          id: cat.id,
          categoryId: cat.id,
          month: currentMonth,
          limitAmount: budgetLimit,
        },
        transactions,
        categories,
      }).spent;

      // 3-month historical spending for trend
      const lookbackSpend = months.slice(0, lookbackMonths).map((month) =>
        calculateBudgetSpending({
          budget: {
            id: `${cat.id}-${month}-history`,
            categoryId: cat.id,
            month,
            limitAmount: 0,
          },
          transactions,
          categories,
        }).spent,
      );

      // Trend from linear regression slope
      const reg = linearRegression(lookbackSpend.reverse()); // oldest→newest
      const trendRate =
        mean(lookbackSpend) > 0 ? (reg.slope / mean(lookbackSpend)) * 100 : 0;
      const trend: SpendingTrend =
        trendRate > 8 ? "increasing" : trendRate < -8 ? "decreasing" : "stable";

      const usagePercent =
        budgetLimit > 0 ? Math.round((actualSpend / budgetLimit) * 100) : 0;
      const variance = actualSpend - budgetLimit;

      let status: BudgetStatus;
      if (budgetLimit === 0) {
        status = actualSpend === 0 ? "no-spend" : "no-budget";
      } else if (actualSpend > budgetLimit) {
        status = "over";
      } else if (actualSpend >= budgetLimit * 0.85) {
        status = "near";
      } else if (actualSpend === 0) {
        status = "no-spend";
      } else {
        status = "on-track";
      }

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        budgetLimit,
        actualSpend,
        variance,
        usagePercent,
        trend,
        trendRate: Math.round(trendRate),
        status,
      };
    },
  );

  // ── Violations ────────────────────────────────────────────────────────────
  const violations: BudgetViolation[] = categoryAnalysis
    .filter((c) => c.status === "over" && c.budgetLimit > 0)
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      budgetLimit: c.budgetLimit,
      actualSpend: c.actualSpend,
      overage: c.actualSpend - c.budgetLimit,
      overagePercent: Math.round(
        ((c.actualSpend - c.budgetLimit) / c.budgetLimit) * 100,
      ),
    }))
    .sort((a, b) => b.overagePercent - a.overagePercent);

  // ── Trending up ───────────────────────────────────────────────────────────
  const overspendingTrend = categoryAnalysis
    .filter((c) => c.trend === "increasing" && c.actualSpend > 0)
    .sort((a, b) => b.trendRate - a.trendRate);

  // ── Recommended budgets ───────────────────────────────────────────────────
  const recommendedBudgets: RecommendedBudget[] = categoryAnalysis
    .filter((c) => c.actualSpend > 0)
    .map((c): RecommendedBudget => {
      // Base: 3-month average spend + 10% buffer
      const lookbackAvg = mean(
        months.slice(0, lookbackMonths).map((month) =>
          calculateBudgetSpending({
            budget: {
              id: `${c.categoryId}-${month}-recommendation`,
              categoryId: c.categoryId,
              month,
              limitAmount: 0,
            },
            transactions,
            categories,
          }).spent,
        ),
      );
      const base = Math.max(lookbackAvg * 1.1, c.actualSpend);
      const recommended = round10k(base);

      let reasoning: string;
      if (c.status === "over") {
        reasoning = `Vượt ngân sách ${c.usagePercent}%. Đề xuất điều chỉnh lên ${fmtVND(recommended)} dựa trên chi tiêu thực tế.`;
      } else if (c.trend === "increasing") {
        reasoning = `Chi tiêu tăng ${c.trendRate}%/tháng. Đề xuất ${fmtVND(recommended)} để phù hợp xu hướng.`;
      } else if (c.budgetLimit === 0) {
        reasoning = `Chưa có ngân sách. Đề xuất ${fmtVND(recommended)} dựa trên chi tiêu 3 tháng gần nhất.`;
      } else {
        reasoning = `Chi tiêu ổn định. Duy trì ngân sách ${fmtVND(recommended)} là hợp lý.`;
      }

      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        currentLimit: c.budgetLimit,
        recommended,
        reasoning,
      };
    })
    .sort((a, b) => {
      // Sort: violations first, then trending, then rest
      const aVio = violations.some((v) => v.categoryId === a.categoryId);
      const bVio = violations.some((v) => v.categoryId === b.categoryId);
      if (aVio !== bVio) return aVio ? -1 : 1;
      return b.recommended - a.recommended;
    })
    .slice(0, 6);

  // ── Adherence score ───────────────────────────────────────────────────────
  const budgetedCategories = categoryAnalysis.filter((c) => c.budgetLimit > 0);
  const adherentCount = budgetedCategories.filter(
    (c) => c.status !== "over",
  ).length;
  const adherenceScore =
    budgetedCategories.length > 0
      ? Math.round((adherentCount / budgetedCategories.length) * 100)
      : 50;

  // ── Insights ──────────────────────────────────────────────────────────────
  const insightsOut: InsightData[] = [];

  if (violations.length > 0) {
    const top = violations[0];
    insightsOut.push({
      key: "budget-violation",
      title: `Vượt ngân sách: ${top.categoryName}`,
      text:
        `${top.categoryName} đã chi ${fmtVND(top.actualSpend)}, vượt ngân sách ${fmtVND(top.budgetLimit)} (${top.overagePercent > 0 ? "+" : ""}${top.overagePercent}%).` +
        (violations.length > 1
          ? ` Còn ${violations.length - 1} danh mục khác cũng vượt ngân sách.`
          : ""),
      tone: "danger",
      iconType: "bar-chart",
    });
  }

  if (overspendingTrend.length > 0 && violations.length === 0) {
    const top = overspendingTrend[0];
    insightsOut.push({
      key: "budget-trend-rising",
      title: `Chi tiêu đang tăng: ${top.categoryName}`,
      text: `${top.categoryName} tăng ~${top.trendRate}%/tháng trong 3 tháng gần nhất. Nên xem lại ngân sách cho danh mục này.`,
      tone: "warning",
      iconType: "trending-up",
    });
  }

  if (adherenceScore >= 90) {
    insightsOut.push({
      key: "budget-adherence-great",
      title: "Tuân thủ ngân sách xuất sắc",
      text: `${adherenceScore}% danh mục đang trong ngân sách. Bạn đang quản lý chi tiêu rất hiệu quả.`,
      tone: "good",
      iconType: "wallet",
    });
  }

  return {
    adherenceScore,
    currentMonth,
    categoryAnalysis,
    violations,
    overspendingTrend,
    recommendedBudgets,
    insights: insightsOut,
  };
}
