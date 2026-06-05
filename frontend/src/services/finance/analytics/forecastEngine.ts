/**
 * analytics/forecastEngine.ts
 *
 * Sprint 17.6 — Financial Forecast Engine.
 *
 * Generates three probabilistic scenarios (best / expected / worst) for the
 * upcoming month using OLS regression + standard-deviation bands over the
 * historical transaction series.
 *
 * Also produces:
 *  - End-of-month cash balance projection
 *  - Net-worth growth estimate
 *  - Forecast confidence score (0–100)
 *  - A pre-formed InsightData token for the AI insights list
 *
 * Pure function — no side effects, no React. Unit-test-ready.
 */

import type {
  Debt,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

import {
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import {
  groupByMonth,
  lastNMonths,
  linearRegression,
  mean,
  stddev,
} from "./shared";
import type { InsightData } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ForecastScenarioKey = "best" | "expected" | "worst";

/** One probabilistic scenario for the next month. */
export type ForecastScenario = {
  scenarioKey: ForecastScenarioKey;
  /** Vietnamese display label. */
  label: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedSaving: number;
  /**
   * Projected liquid-cash balance at end of month.
   * = current liquid balance (cash + bank + ewallet wallets) + projectedSaving
   */
  endOfMonthBalance: number;
  /**
   * Projected saving as a percentage of current net worth.
   * Null when net worth ≤ 0 (no meaningful ratio).
   */
  netWorthGrowthPercent: number | null;
};

/** Full multi-scenario forecast result. */
export type FinancialForecast = {
  /** "YYYY-MM" of the projected month. */
  forecastMonth: string;
  /** Sum of all liquid wallet balances right now (cash + bank + ewallet). */
  currentLiquidBalance: number;
  /** Net worth = wallet balances + investment market values − total debts. */
  currentNetWorth: number;
  best: ForecastScenario;
  expected: ForecastScenario;
  worst: ForecastScenario;
  /**
   * Overall forecast confidence score 0–100.
   *
   * Factors:
   *   0–40  Income stability (lower CoV = higher score)
   *   0–40  Expense stability (lower CoV = higher score)
   *   0–20  Data volume (more historical months = more confident)
   */
  confidenceScore: number;
  /** Vietnamese label for the confidence score band. */
  confidenceLabel: "Thấp" | "Trung bình" | "Cao";
  /** Coefficient of variation of the income series (0–1). */
  incomeVolatility: number;
  /** Coefficient of variation of the expense series (0–1). */
  expenseVolatility: number;
  /** Pre-formed insight for injection into the AI insights pipeline. */
  insight: InsightData;
};

// ─── Private helpers ──────────────────────────────────────────────────────────

function fmtVND(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + " đ";
}

/**
 * Composite confidence score.
 *
 * Income component (0–40):  max(0, 1 − CV_income/0.5) × 40
 * Expense component (0–40): max(0, 1 − CV_expense/0.5) × 40
 * Volume component (0–20):  min(20, N/6 × 20)
 */
function computeConfidenceScore(
  incomeSeries: number[],
  expenseSeries: number[],
): number {
  const incomeCV =
    mean(incomeSeries) > 0 ? stddev(incomeSeries) / mean(incomeSeries) : 1;
  const expenseCV =
    mean(expenseSeries) > 0 ? stddev(expenseSeries) / mean(expenseSeries) : 1;

  const incomeComponent = Math.max(0, 1 - incomeCV / 0.5) * 40;
  const expenseComponent = Math.max(0, 1 - expenseCV / 0.5) * 40;
  const volumeComponent = Math.min(20, (incomeSeries.length / 6) * 20);

  return Math.round(
    Math.min(100, incomeComponent + expenseComponent + volumeComponent),
  );
}

function makeScenario(
  key: ForecastScenarioKey,
  label: string,
  projectedIncome: number,
  projectedExpense: number,
  liquidBalance: number,
  netWorth: number,
): ForecastScenario {
  const projectedSaving = projectedIncome - projectedExpense;
  const endOfMonthBalance = Math.max(0, liquidBalance + projectedSaving);
  const netWorthGrowthPercent =
    netWorth > 0
      ? Math.round((projectedSaving / netWorth) * 100 * 10) / 10
      : null;
  return {
    scenarioKey: key,
    label,
    projectedIncome: Math.max(0, Math.round(projectedIncome)),
    projectedExpense: Math.max(0, Math.round(projectedExpense)),
    projectedSaving: Math.round(projectedSaving),
    endOfMonthBalance: Math.round(endOfMonthBalance),
    netWorthGrowthPercent,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes a three-scenario financial forecast for the next calendar month.
 *
 * @param wallets       All wallets (used for liquid balance + net worth).
 * @param debts         All debts (used for net worth calculation).
 * @param investments   All investments (used for net worth calculation).
 * @param transactions  All transactions (used for historical series).
 * @param lookbackMonths  Number of past months to build the model (default 6).
 */
export function computeFinancialForecast(
  wallets: Wallet[],
  debts: Debt[],
  investments: Investment[],
  transactions: Transaction[],
  lookbackMonths = 6,
): FinancialForecast {
  // ── Balance sheet snapshot ───────────────────────────────────────────────
  const liquidTypes = new Set<string>(["cash", "bank", "ewallet"]);
  const currentLiquidBalance = wallets
    .filter((w) => liquidTypes.has(w.type))
    .reduce((s, w) => s + w.balance, 0);

  const totalWalletBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const totalInvestmentValue = investments.reduce(
    (s, inv) => s + inv.currentValue,
    0,
  );
  const totalDebt = debts.reduce((s, d) => s + d.remainingAmount, 0);
  const currentNetWorth = totalWalletBalance + totalInvestmentValue - totalDebt;

  // ── Historical series (oldest → newest for correct regression direction) ──
  const months = lastNMonths(lookbackMonths).reverse();
  const byMonth = groupByMonth(transactions);

  const incomeSeries = months.map((m) => getTotalIncome(byMonth.get(m) ?? []));
  const expenseSeries = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );

  // ── OLS regression projections ────────────────────────────────────────────
  const incomeReg = linearRegression(incomeSeries);
  const expenseReg = linearRegression(expenseSeries);
  const nextX = months.length;

  const baseIncome = Math.max(0, incomeReg.slope * nextX + incomeReg.intercept);
  const baseExpense = Math.max(
    0,
    expenseReg.slope * nextX + expenseReg.intercept,
  );

  // ── Volatility bands (±0.5 × stddev) ─────────────────────────────────────
  const incomeSD = stddev(incomeSeries);
  const expenseSD = stddev(expenseSeries);
  const BAND = 0.5; // half-sigma band

  const bestIncome = baseIncome + BAND * incomeSD;
  const bestExpense = Math.max(0, baseExpense - BAND * expenseSD);

  const worstIncome = Math.max(0, baseIncome - BAND * incomeSD);
  const worstExpense = baseExpense + BAND * expenseSD;

  // ── Confidence score ──────────────────────────────────────────────────────
  const confidenceScore = computeConfidenceScore(incomeSeries, expenseSeries);
  const confidenceLabel: FinancialForecast["confidenceLabel"] =
    confidenceScore >= 70
      ? "Cao"
      : confidenceScore >= 40
        ? "Trung bình"
        : "Thấp";

  const incomeVolatility =
    mean(incomeSeries) > 0
      ? Math.round((stddev(incomeSeries) / mean(incomeSeries)) * 100) / 100
      : 1;
  const expenseVolatility =
    mean(expenseSeries) > 0
      ? Math.round((stddev(expenseSeries) / mean(expenseSeries)) * 100) / 100
      : 1;

  // ── Forecast month ────────────────────────────────────────────────────────
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const forecastMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

  // ── Three scenarios ───────────────────────────────────────────────────────
  const expected = makeScenario(
    "expected",
    "Kỳ vọng",
    baseIncome,
    baseExpense,
    currentLiquidBalance,
    currentNetWorth,
  );
  const best = makeScenario(
    "best",
    "Lạc quan",
    bestIncome,
    bestExpense,
    currentLiquidBalance,
    currentNetWorth,
  );
  const worst = makeScenario(
    "worst",
    "Thận trọng",
    worstIncome,
    worstExpense,
    currentLiquidBalance,
    currentNetWorth,
  );

  // ── Pre-formed insight ────────────────────────────────────────────────────
  let insight: InsightData;
  if (expected.projectedSaving >= 0) {
    insight = {
      key: "forecast-positive",
      title: `Dự báo tháng ${forecastMonth}: tích cực`,
      text:
        `Tiết kiệm dự kiến ${fmtVND(expected.projectedSaving)} — số dư cuối tháng ước tính ${fmtVND(expected.endOfMonthBalance)}.` +
        (confidenceScore >= 70
          ? ` Độ tin cậy dự báo cao (${confidenceScore}/100).`
          : ` Độ tin cậy dự báo ${confidenceLabel.toLowerCase()} (${confidenceScore}/100) — dữ liệu lịch sử chưa đủ ổn định.`),
      tone: confidenceScore >= 50 ? "good" : "info",
      iconType: "trending-up",
    };
  } else {
    insight = {
      key: "forecast-negative",
      title: `Dự báo tháng ${forecastMonth}: cần chú ý`,
      text: `Chi vượt thu dự kiến ${fmtVND(Math.abs(expected.projectedSaving))}. Kịch bản thận trọng: số dư cuối tháng ${fmtVND(worst.endOfMonthBalance)}.`,
      tone: "warning",
      iconType: "trending-down",
    };
  }

  return {
    forecastMonth,
    currentLiquidBalance: Math.round(currentLiquidBalance),
    currentNetWorth: Math.round(currentNetWorth),
    best,
    expected,
    worst,
    confidenceScore,
    confidenceLabel,
    incomeVolatility,
    expenseVolatility,
    insight,
  };
}
