/**
 * analytics/spendingAnalytics.ts
 *
 * Spending anomaly detection.
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type { Category, Transaction } from "@/src/types/finance";

import { groupByMonth, lastNMonths, mean, stddev } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpendingAnomaly = {
  /** ID of the category that triggered the anomaly. */
  categoryId: string;
  categoryName: string;
  /** "YYYY-MM" of the anomalous month. */
  month: string;
  /** Actual spend in that month. */
  amount: number;
  /** Rolling average spend across the lookback window. */
  averageAmount: number;
  /** ((amount - average) / average) * 100, rounded. */
  deviationPercent: number;
  /** "high" when deviationPercent ≥ 80, otherwise "moderate". */
  severity: "moderate" | "high";
};

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Detects months where a category's spend was statistically anomalous
 * relative to its rolling average over the lookback window.
 *
 * Threshold: amount > mean + 1.5 × sample-stddev.
 * Categories with fewer than 2 active months are excluded.
 *
 * @returns Anomalies sorted by deviationPercent descending.
 */
export function detectSpendingAnomalies(
  transactions: Transaction[],
  categories: Category[],
  lookbackMonths = 6,
): SpendingAnomaly[] {
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);
  const anomalies: SpendingAnomaly[] = [];

  for (const category of categories.filter((c) => c.type === "expense")) {
    const monthlySpend = months.map((m) => {
      const txs = byMonth.get(m) ?? [];
      return txs
        .filter((t) => t.type === "expense" && t.categoryId === category.id)
        .reduce((s, t) => s + t.amount, 0);
    });

    // Require at least 2 months with actual spend for a meaningful baseline
    if (monthlySpend.filter((v) => v > 0).length < 2) continue;

    const avg = mean(monthlySpend);
    const sd = stddev(monthlySpend);
    const threshold = avg + 1.5 * sd;

    for (let i = 0; i < months.length; i++) {
      const amount = monthlySpend[i];
      if (amount > threshold && amount > 0) {
        const deviationPercent =
          avg > 0 ? Math.round(((amount - avg) / avg) * 100) : 0;
        anomalies.push({
          categoryId: category.id,
          categoryName: category.name,
          month: months[i],
          amount,
          averageAmount: Math.round(avg),
          deviationPercent,
          severity: deviationPercent >= 80 ? "high" : "moderate",
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.deviationPercent - a.deviationPercent);
}
