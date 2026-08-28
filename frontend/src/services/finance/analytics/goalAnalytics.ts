/**
 * analytics/goalAnalytics.ts
 *
 * Goal achievement prediction based on historical saving rate.
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type { Category, Goal, SavingAccount, Transaction } from "@/src/types/finance";

import {
  calculateGoalFundingSnapshot,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import { groupByMonth, lastNMonths, mean } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalPrediction = {
  goalId: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  /** Amount still needed to reach the target (0 if completed). */
  remaining: number;
  /** 0–100 integer, capped at 100. */
  progressPercent: number;
  /**
   * Estimated equal share of the average monthly saving surplus
   * allocated to this goal. 0 when no positive saving exists.
   */
  monthlyContribution: number;
  /**
   * Whole months until the goal is reached at the current rate.
   * `null` means the goal is unachievable at the current saving rate.
   * `0` when already completed.
   */
  estimatedMonthsLeft: number | null;
  /** "YYYY-MM" projected completion month, or null. */
  projectedCompletionMonth: string | null;
  status: "on-track" | "at-risk" | "completed" | "no-data";
};

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Estimates when each goal will be reached given the average monthly
 * saving surplus split equally among all active (incomplete) goals.
 */
export function predictGoalAchievement(
  goals: Goal[],
  transactions: Transaction[],
  lookbackMonths = 3,
  categories: Category[] = [],
  savings: SavingAccount[] = [],
  goalFundingTransactions: Transaction[] = transactions,
): GoalPrediction[] {
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);

  const monthlySavings = months.map((m) => {
    const txs = byMonth.get(m) ?? [];
    return getTotalIncome(txs) - getTotalExpense(txs, categories);
  });

  const avgMonthlySaving = mean(monthlySavings);
  const fundingSnapshots = goals.map((goal) => ({
    goal,
    funding: calculateGoalFundingSnapshot({
      goal,
      transactions: goalFundingTransactions,
      savings,
    }),
  }));
  const activeGoals = fundingSnapshots.filter(
    ({ funding }) => funding.progressPercent < 100,
  );
  const monthlyPerGoal =
    activeGoals.length > 0 && avgMonthlySaving > 0
      ? avgMonthlySaving / activeGoals.length
      : 0;

  return fundingSnapshots.map(({ goal, funding }): GoalPrediction => {
    const currentAmount = funding.effectiveCurrentAmount;
    const remaining = funding.remainingAmount;
    const progressPercent = funding.progressPercent;

    if (progressPercent >= 100) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount,
        remaining: 0,
        progressPercent: 100,
        monthlyContribution: 0,
        estimatedMonthsLeft: 0,
        projectedCompletionMonth: null,
        status: "completed",
      };
    }

    if (monthlyPerGoal <= 0) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount,
        remaining,
        progressPercent,
        monthlyContribution: 0,
        estimatedMonthsLeft: null,
        projectedCompletionMonth: null,
        status: "no-data",
      };
    }

    const monthsLeft = Math.ceil(remaining / monthlyPerGoal);
    const now = new Date();
    const completion = new Date(
      now.getFullYear(),
      now.getMonth() + monthsLeft,
      1,
    );
    const projectedCompletionMonth = `${completion.getFullYear()}-${String(completion.getMonth() + 1).padStart(2, "0")}`;

    return {
      goalId: goal.id,
      goalName: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount,
      remaining,
      progressPercent,
      monthlyContribution: Math.round(monthlyPerGoal),
      estimatedMonthsLeft: monthsLeft,
      projectedCompletionMonth,
      status: monthsLeft <= 24 ? "on-track" : "at-risk",
    };
  });
}
