/**
 * analytics/fireCalculator.ts
 *
 * FIRE (Financial Independence, Retire Early) Calculator — Sprint 17.3.
 *
 * Calculates:
 *  - Current net worth (wallets + investments − debts)
 *  - Annual expenses & FIRE target (expenses / SWR)
 *  - Estimated years to FIRE via compound growth formula
 *  - FIRE Progress Score (0–100) and milestone projections
 *  - AI recommendation text
 *
 * Defaults: SWR = 4% (Trinity Study), Annual Return = 7% (real historical)
 * Input: plain data arrays. No side effects. Unit-test-ready.
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

import { groupByMonth, lastNMonths, mean } from "./shared";
import type { InsightData } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Historical average real return of a diversified stock portfolio. */
const DEFAULT_ANNUAL_RETURN = 0.07;

/** Trinity Study safe withdrawal rate — 4% per year of portfolio. */
const DEFAULT_SWR = 0.04;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FireStatus =
  | "very-early"
  | "early"
  | "mid"
  | "near"
  | "close"
  | "achieved";

/**
 * A point on the FIRE timeline.
 * Represents when the portfolio crosses a threshold (25 / 50 / 75 / 100 % of
 * the FIRE target).
 */
export type FireMilestone = {
  /** Display label — "25%", "50%", "75%", or "FIRE!" */
  label: string;
  /** Threshold as 0–100 integer. */
  targetPercent: number;
  /** Years from today until this milestone is reached. null = unachievable. */
  yearsFromNow: number | null;
  /** Projected net worth when the milestone is crossed (VND). */
  projectedNetWorth: number;
  /** True when the current net worth already exceeds this milestone. */
  achieved: boolean;
};

export type FireAnalysis = {
  /** Net worth = wallet balances + investment values − debt balances. */
  netWorth: number;
  /** Average annual expenses derived from the transaction lookback window. */
  annualExpenses: number;
  /** FIRE target = annualExpenses / safeWithdrawalRate. */
  fireTarget: number;
  /** Amount still needed: max(0, fireTarget − netWorth). */
  gap: number;
  /** Net worth as a % of the FIRE target (0–100, capped). */
  progressPercent: number;
  /** FIRE Progress Score — same as progressPercent (0–100). */
  score: number;
  /** Average monthly contribution (saving surplus) used for projections. */
  monthlyContribution: number;
  /**
   * Estimated years until the portfolio reaches the FIRE target at the
   * current contribution rate and expected return.
   * null when unachievable (negative cash flow, zero contribution + zero return).
   */
  estimatedYearsToFire: number | null;
  /** Assumed annual investment return (default 0.07 = 7%). */
  annualReturn: number;
  /** Safe withdrawal rate used to compute the FIRE target (default 0.04 = 4%). */
  safeWithdrawalRate: number;
  status: FireStatus;
  /** Vietnamese label matching the status. */
  statusLabel: string;
  /** Four milestone projections (25 / 50 / 75 / 100 % of FIRE target). */
  milestones: FireMilestone[];
  /** Pre-formed AI insight ready to be injected into the advisor insights list. */
  insight: InsightData;
};

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Compound future value of a portfolio with regular monthly contributions.
 * FV = W*(1+r)^n + C*((1+r)^n − 1)/r
 */
function projectWealth(
  W: number,
  C: number,
  r: number,
  months: number,
): number {
  if (months <= 0) return W;
  if (r === 0) return W + C * months;
  const factor = Math.pow(1 + r, months);
  return W * factor + (C * (factor - 1)) / r;
}

/**
 * Whole months until the portfolio reaches target T, given:
 *  W = current net worth
 *  C = monthly contribution (>= 0; if negative, treated as 0)
 *  r = monthly return rate (>= 0)
 *  T = target amount
 *
 * Formula (r > 0, C >= 0):
 *  n = ln((T + C/r) / (W + C/r)) / ln(1+r)
 *
 * Returns null when T is not reachable.
 */
function monthsUntilTarget(
  W: number,
  C: number,
  r: number,
  T: number,
): number | null {
  const contribution = Math.max(0, C); // treat negative saving as 0

  if (W >= T) return 0;

  if (r === 0) {
    if (contribution <= 0) return null;
    return Math.ceil((T - W) / contribution);
  }

  if (contribution === 0) {
    // Pure compound growth: n = ln(T/W) / ln(1+r)
    if (W <= 0) return null;
    const months = Math.log(T / W) / Math.log(1 + r);
    if (!isFinite(months) || months <= 0) return null;
    return Math.ceil(months);
  }

  // General case: n = ln((T + C/r) / (W + C/r)) / ln(1+r)
  const Cr = contribution / r;
  const numerator = T + Cr;
  const denominator = W + Cr;

  if (denominator <= 0 || numerator <= 0) return null;

  const ratio = numerator / denominator;
  if (ratio <= 1) return null;

  const months = Math.log(ratio) / Math.log(1 + r);
  if (!isFinite(months) || months <= 0) return null;

  return Math.ceil(months);
}

function statusFromPercent(pct: number): { status: FireStatus; label: string } {
  if (pct >= 100) return { status: "achieved", label: "Đã đạt FIRE!" };
  if (pct >= 75) return { status: "close", label: "Gần đến FIRE" };
  if (pct >= 50) return { status: "near", label: "Nửa chặng đường" };
  if (pct >= 25) return { status: "mid", label: "Đang tăng tốc" };
  if (pct >= 10) return { status: "early", label: "Mới bắt đầu" };
  return { status: "very-early", label: "Khởi động" };
}

/** Vietnamese number format helper (no React dependency). */
function fmtVND(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + " đ";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes a full FIRE analysis from raw financial data.
 *
 * @param wallets        All user wallets (balances included in net worth).
 * @param debts          All debts (subtracted from net worth).
 * @param investments    All investment positions (added to net worth).
 * @param transactions   Historical transactions used to derive avg expenses
 *                       and avg saving surplus (monthly contribution).
 * @param lookbackMonths Months of transaction history to average (default 6).
 * @param annualReturn   Expected annual investment return (default 0.07 = 7%).
 * @param swr            Safe withdrawal rate (default 0.04 = 4%).
 */
export function computeFireAnalysis(
  wallets: Wallet[],
  debts: Debt[],
  investments: Investment[],
  transactions: Transaction[],
  lookbackMonths = 6,
  annualReturn = DEFAULT_ANNUAL_RETURN,
  swr = DEFAULT_SWR,
): FireAnalysis {
  // ── Derive net worth ───────────────────────────────────────────────────────
  const walletTotal = wallets.reduce((s, w) => s + w.balance, 0);
  const investmentTotal = investments.reduce((s, i) => s + i.currentValue, 0);
  const debtTotal = debts.reduce((s, d) => s + d.remainingAmount, 0);
  const netWorth = walletTotal + investmentTotal - debtTotal;

  // ── Derive avg monthly income, expense, contribution ──────────────────────
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);

  const monthlyExpenses = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );
  const monthlyIncomes = months.map((m) =>
    getTotalIncome(byMonth.get(m) ?? []),
  );

  const avgMonthlyExpense = mean(monthlyExpenses);
  const avgMonthlyIncome = mean(monthlyIncomes);
  const monthlyContribution = avgMonthlyIncome - avgMonthlyExpense; // can be negative

  const annualExpenses = Math.round(avgMonthlyExpense * 12);

  // ── FIRE target & gap ──────────────────────────────────────────────────────
  const fireTarget = swr > 0 ? Math.round(annualExpenses / swr) : 0;
  const gap = Math.max(0, fireTarget - netWorth);

  const rawPercent = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const score = progressPercent;

  // ── Time to FIRE ───────────────────────────────────────────────────────────
  const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;

  const monthsToFire =
    fireTarget > 0
      ? monthsUntilTarget(
          netWorth,
          monthlyContribution,
          monthlyRate,
          fireTarget,
        )
      : 0;

  const estimatedYearsToFire =
    monthsToFire !== null && monthsToFire !== null
      ? Math.round((monthsToFire / 12) * 10) / 10
      : null;

  // ── Status ────────────────────────────────────────────────────────────────
  const { status, label: statusLabel } = statusFromPercent(progressPercent);

  // ── Milestones ────────────────────────────────────────────────────────────
  const milestones: FireMilestone[] = [25, 50, 75, 100].map(
    (pct): FireMilestone => {
      const milestoneTarget = (pct / 100) * fireTarget;
      if (netWorth >= milestoneTarget) {
        return {
          label: pct === 100 ? "FIRE!" : `${pct}%`,
          targetPercent: pct,
          yearsFromNow: 0,
          projectedNetWorth: Math.round(netWorth),
          achieved: true,
        };
      }
      const ms = monthsUntilTarget(
        netWorth,
        monthlyContribution,
        monthlyRate,
        milestoneTarget,
      );
      return {
        label: pct === 100 ? "FIRE!" : `${pct}%`,
        targetPercent: pct,
        yearsFromNow: ms !== null ? Math.round((ms / 12) * 10) / 10 : null,
        projectedNetWorth:
          ms !== null
            ? Math.round(
                projectWealth(
                  netWorth,
                  Math.max(0, monthlyContribution),
                  monthlyRate,
                  ms,
                ),
              )
            : Math.round(milestoneTarget),
        achieved: false,
      };
    },
  );

  // ── AI insight text ───────────────────────────────────────────────────────
  let insightTitle: string;
  let insightText: string;
  let insightTone: InsightData["tone"];

  if (status === "achieved") {
    insightTitle = "Bạn đã đạt FIRE!";
    insightText = `Tài sản ròng ${fmtVND(netWorth)} đã vượt mục tiêu FIRE ${fmtVND(fireTarget)}. Với tỷ lệ rút ${(swr * 100).toFixed(0)}%/năm, bạn có thể rút ${fmtVND(fireTarget * swr)}/năm mà không cạn vốn.`;
    insightTone = "good";
  } else if (estimatedYearsToFire !== null && estimatedYearsToFire <= 5) {
    insightTitle = "Sắp đạt FIRE — chỉ còn vài năm!";
    insightText = `Bạn đã đạt ${progressPercent}% mục tiêu FIRE (${fmtVND(netWorth)}/${fmtVND(fireTarget)}). Ước tính còn khoảng ${estimatedYearsToFire} năm. Duy trì đầu tư ${fmtVND(Math.max(0, monthlyContribution))}/tháng để về đích đúng hạn.`;
    insightTone = "good";
  } else if (estimatedYearsToFire !== null) {
    insightTitle = `Hành trình FIRE: ${progressPercent}% hoàn thành`;
    insightText = `Tài sản ròng hiện tại ${fmtVND(netWorth)} / mục tiêu ${fmtVND(fireTarget)}. Ước tính ${estimatedYearsToFire} năm với lợi suất ${(annualReturn * 100).toFixed(0)}%/năm và đóng góp ${fmtVND(Math.max(0, monthlyContribution))}/tháng. Tăng tiết kiệm sẽ rút ngắn đáng kể thời gian.`;
    insightTone = progressPercent >= 25 ? "info" : "warning";
  } else {
    insightTitle = "Bắt đầu hành trình FIRE";
    insightText = `Mục tiêu FIRE: ${fmtVND(fireTarget)} (${Math.round(1 / swr)}× chi tiêu năm). Hiện chưa có tiết kiệm đầu tư hàng tháng — hãy tăng đầu tư để bắt đầu tích lũy tài sản.`;
    insightTone = "warning";
  }

  return {
    netWorth: Math.round(netWorth),
    annualExpenses,
    fireTarget,
    gap,
    progressPercent,
    score,
    monthlyContribution: Math.round(monthlyContribution),
    estimatedYearsToFire,
    annualReturn,
    safeWithdrawalRate: swr,
    status,
    statusLabel,
    milestones,
    insight: {
      key: "fire-progress",
      title: insightTitle,
      text: insightText,
      tone: insightTone,
      iconType: "flame",
    },
  };
}
