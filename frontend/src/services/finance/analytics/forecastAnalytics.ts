/**
 * analytics/forecastAnalytics.ts
 *
 * Monthly income / expense / saving forecast via linear regression.
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type { Transaction } from "@/src/types/finance";

import {
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import {
  confidenceLevel,
  groupByMonth,
  lastNMonths,
  linearRegression,
} from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthlyForecast = {
  /** "YYYY-MM" of the projected month (always the next calendar month). */
  forecastMonth: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedSaving: number;
  /** Statistical confidence derived from income series CoV. */
  incomeConfidence: "low" | "medium" | "high";
  /** Statistical confidence derived from expense series CoV. */
  expenseConfidence: "low" | "medium" | "high";
};

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Projects income, expense, and saving for the next calendar month
 * using ordinary least squares regression over the last N months
 * (oldest → newest ordering for correct slope direction).
 */
export function computeMonthlyForecast(
  transactions: Transaction[],
  lookbackMonths = 6,
): MonthlyForecast {
  // Reverse so index 0 = oldest (correct x-axis direction for regression)
  const months = lastNMonths(lookbackMonths).reverse();
  const byMonth = groupByMonth(transactions);

  const incomeValues = months.map((m) => getTotalIncome(byMonth.get(m) ?? []));
  const expenseValues = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );

  const incomeReg = linearRegression(incomeValues);
  const expenseReg = linearRegression(expenseValues);

  // Project one step beyond the last observed index
  const nextX = months.length;
  const projectedIncome = Math.max(
    0,
    Math.round(incomeReg.slope * nextX + incomeReg.intercept),
  );
  const projectedExpense = Math.max(
    0,
    Math.round(expenseReg.slope * nextX + expenseReg.intercept),
  );

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const forecastMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

  return {
    forecastMonth,
    projectedIncome,
    projectedExpense,
    projectedSaving: projectedIncome - projectedExpense,
    incomeConfidence: confidenceLevel(incomeValues),
    expenseConfidence: confidenceLevel(expenseValues),
  };
}
