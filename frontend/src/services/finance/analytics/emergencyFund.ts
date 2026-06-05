/**
 * analytics/emergencyFund.ts
 *
 * Emergency Fund Intelligence — Sprint 17.2.
 * Calculates how well the user's liquid reserves cover monthly expenses,
 * produces a 0–100 score, coverage status, and AI-ready recommendation text.
 *
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type { Transaction, Wallet } from "@/src/types/finance";

import { getTotalExpense } from "@/src/services/finance/financeCalculations";

import { groupByMonth, lastNMonths, mean } from "./shared";
import type { InsightData } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmergencyFundStatus = "critical" | "low" | "good" | "excellent";

export type EmergencyFundAnalysis = {
  /** Rolling average monthly expense over the lookback window (VND). */
  monthlyAvgExpense: number;
  /** Total balance in cash + bank wallets (liquid reserves). */
  liquidCash: number;
  /** How many months of expenses the liquid reserves cover (1 decimal). */
  monthsCovered: number;
  /** Target months to cover (standard = 6). */
  targetMonths: number;
  /** Target emergency fund amount = monthlyAvgExpense × targetMonths (VND). */
  targetAmount: number;
  /** Amount still needed to reach the target. 0 if already at/above target. */
  shortfall: number;
  /**
   * Recommended monthly saving to fill the shortfall within 12 months.
   * 0 if no shortfall exists.
   */
  recommendedMonthlyContribution: number;
  /** 0–100 score. Higher = better emergency preparedness. */
  score: number;
  status: EmergencyFundStatus;
  /** Vietnamese label for the status. */
  statusLabel: string;
  /** Pre-formed AI insight ready to be injected into the advisor insights list. */
  insight: InsightData;
};

// ─── Score & Status Mapping ───────────────────────────────────────────────────

/**
 * Maps months-covered to a 0–100 score using piecewise linear interpolation:
 *
 * 0 months  →   0
 * 1 month   →  16
 * 3 months  →  51
 * 6 months  → 100
 */
function scoreFromMonths(months: number): number {
  if (months <= 0) return 0;
  if (months >= 6) return 100;
  if (months >= 3) {
    // Interpolate 51 → 100 over [3, 6]
    return Math.round(51 + ((months - 3) / 3) * 49);
  }
  if (months >= 1) {
    // Interpolate 16 → 51 over [1, 3]
    return Math.round(16 + ((months - 1) / 2) * 35);
  }
  // Interpolate 0 → 16 over [0, 1]
  return Math.round(months * 16);
}

function statusFromMonths(months: number): {
  status: EmergencyFundStatus;
  label: string;
} {
  if (months >= 6) return { status: "excellent", label: "Xuất sắc" };
  if (months >= 3) return { status: "good", label: "Tốt" };
  if (months >= 1) return { status: "low", label: "Còn thấp" };
  return { status: "critical", label: "Nguy hiểm" };
}

// ─── Formatting helper (Vietnamese number format, no full import) ─────────────

function fmtVND(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + " đ";
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Analyses the emergency fund readiness.
 *
 * @param wallets   All user wallets; only cash + bank types count as liquid.
 * @param transactions  All transactions used to derive avg monthly expense.
 * @param lookbackMonths  Number of past months used for expense averaging (default 6).
 * @param targetMonths  Target months of coverage (default 6, rule-of-thumb standard).
 */
export function computeEmergencyFund(
  wallets: Wallet[],
  transactions: Transaction[],
  lookbackMonths = 6,
  targetMonths = 6,
): EmergencyFundAnalysis {
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);

  // Average monthly expense across the lookback window
  const monthlyExpenses = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );
  const monthlyAvgExpense = mean(monthlyExpenses);

  // Liquid reserves = cash + bank wallets only
  const liquidCash = wallets
    .filter((w) => w.type === "cash" || w.type === "bank")
    .reduce((s, w) => s + w.balance, 0);

  const monthsCoveredRaw =
    monthlyAvgExpense > 0 ? liquidCash / monthlyAvgExpense : targetMonths;
  const monthsCovered = Math.round(Math.min(monthsCoveredRaw, 99) * 10) / 10;

  const targetAmount = monthlyAvgExpense * targetMonths;
  const shortfall = Math.max(0, targetAmount - liquidCash);
  const recommendedMonthlyContribution =
    shortfall > 0 ? Math.ceil(shortfall / 12) : 0;

  const score = scoreFromMonths(monthsCoveredRaw);
  const { status, label: statusLabel } = statusFromMonths(monthsCoveredRaw);

  // ── Generate AI insight ────────────────────────────────────────────────────
  let insightTitle: string;
  let insightText: string;
  let insightTone: InsightData["tone"];

  if (status === "excellent") {
    insightTitle = "Quỹ khẩn cấp xuất sắc";
    insightText = `Bạn có ${fmtVND(liquidCash)} dự phòng, đủ cho ${monthsCovered} tháng chi tiêu (mục tiêu 6 tháng). Quỹ khẩn cấp của bạn đang rất vững chắc.`;
    insightTone = "good";
  } else if (status === "good") {
    insightTitle = "Quỹ khẩn cấp ở mức tốt";
    insightText = `Bạn có ${fmtVND(liquidCash)} dự phòng (${monthsCovered} tháng). Cần thêm ${fmtVND(shortfall)} để đạt mục tiêu 6 tháng. Nên đóng góp khoảng ${fmtVND(recommendedMonthlyContribution)}/tháng.`;
    insightTone = "info";
  } else if (status === "low") {
    insightTitle = "Quỹ khẩn cấp còn thấp";
    insightText = `Bạn chỉ có ${monthsCovered} tháng dự phòng (${fmtVND(liquidCash)}). Cần tích lũy thêm ${fmtVND(shortfall)} — tương đương ${fmtVND(recommendedMonthlyContribution)}/tháng trong 12 tháng tới.`;
    insightTone = "warning";
  } else {
    insightTitle = "Quỹ khẩn cấp ở mức nguy hiểm";
    insightText = `Chỉ có ${fmtVND(liquidCash)} dự phòng (dưới 1 tháng chi tiêu). Ưu tiên xây quỹ khẩn cấp ngay: đặt mục tiêu ${fmtVND(recommendedMonthlyContribution)}/tháng để an toàn trong 1 năm.`;
    insightTone = "danger";
  }

  return {
    monthlyAvgExpense: Math.round(monthlyAvgExpense),
    liquidCash: Math.round(liquidCash),
    monthsCovered,
    targetMonths,
    targetAmount: Math.round(targetAmount),
    shortfall: Math.round(shortfall),
    recommendedMonthlyContribution,
    score,
    status,
    statusLabel,
    insight: {
      key: "emergency-fund",
      title: insightTitle,
      text: insightText,
      tone: insightTone,
      iconType: "piggy-bank",
    },
  };
}
