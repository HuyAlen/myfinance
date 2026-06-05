/**
 * analytics/shared.ts
 *
 * Pure math/date utilities shared across all analytics modules.
 * No domain types — no imports from finance layer. Unit-test-ready.
 */

import type { Transaction } from "@/src/types/finance";

// ─── Statistics ───────────────────────────────────────────────────────────────

/** Arithmetic mean. Returns 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation. Returns 0 when fewer than 2 values. */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Classifies a series as low/medium/high confidence based on its
 * coefficient of variation (stddev / mean).
 */
export function confidenceLevel(values: number[]): "low" | "medium" | "high" {
  if (values.length < 3) return "low";
  const m = mean(values);
  const cv = m > 0 ? stddev(values) / m : 1;
  if (cv < 0.15) return "high";
  if (cv < 0.35) return "medium";
  return "low";
}

// ─── Time Utilities ───────────────────────────────────────────────────────────

/**
 * Returns the last N calendar months as "YYYY-MM" strings.
 * Index 0 = the most recent month (i.e. newest-first order).
 */
export function lastNMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${year}-${month}`);
  }
  return result;
}

// ─── Linear Regression ────────────────────────────────────────────────────────

/**
 * Ordinary least squares for y = slope * x + intercept.
 * Input: ordered array of y-values (x = index 0, 1, 2, …).
 */
export function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
} {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;

  return { slope, intercept };
}

// ─── Transaction Grouping ─────────────────────────────────────────────────────

/**
 * Groups transactions by their "YYYY-MM" month key.
 * The transaction's `date` field is expected to be an ISO date string.
 */
export function groupByMonth(
  transactions: Transaction[],
): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = t.date.slice(0, 7);
    const existing = map.get(key) ?? [];
    existing.push(t);
    map.set(key, existing);
  }
  return map;
}
