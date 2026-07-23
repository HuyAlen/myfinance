/**
 * analytics/healthScore.ts
 *
 * 10-factor weighted financial health score (0–100, higher = healthier).
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  ForexCashTransaction,
  Transaction,
  Wallet,
} from "@/src/types/finance";

import {
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import { groupByMonth, lastNMonths, mean, stddev } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthScoreFactor = {
  label: string;
  /** 0–10 score for this factor. */
  score: number;
  /** Weight applied when computing the weighted total. */
  weight: number;
  /** Human-readable note explaining the score. */
  note: string;
};

export type HealthScoreV2 = {
  /** Weighted score mapped to 0–100. */
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** Vietnamese label matching the grade. */
  label: string;
  factors: HealthScoreFactor[];
};

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Computes a 10-factor weighted health score:
 *
 * | # | Factor                   | Weight |
 * |---|--------------------------|--------|
 * | 1 | Saving rate              | 15     |
 * | 2 | Cash flow direction      | 10     |
 * | 3 | Debt ratio               | 15     |
 * | 4 | Emergency fund           | 10     |
 * | 5 | Goal progress            | 10     |
 * | 6 | Spending concentration   |  5     |
 * | 7 | Income stability         | 10     |
 * | 8 | Debt service coverage    | 10     |
 * | 9 | Investment ratio         | 10     |
 * |10 | Budget adherence         |  5     |
 */
export function computeHealthScoreV2(
  wallets: Wallet[],
  debts: Debt[],
  goals: Goal[],
  investments: Investment[],
  transactions: Transaction[],
  budgets: Budget[],
  categories: Category[],
  lookbackMonths = 3,
  forexCashTransactions: ForexCashTransaction[] = [],
): HealthScoreV2 {
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);

  const monthlyIncome = months.map((m) => getTotalIncome(byMonth.get(m) ?? []));
  const monthlyExpense = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );
  const avgIncome = mean(monthlyIncome);
  const avgExpense = mean(monthlyExpense);
  const avgSaving = avgIncome - avgExpense;

  const walletAssets = wallets.reduce((s, w) => s + w.balance, 0);
  const forexCashBalance = forexCashTransactions.reduce((sum, transaction) => {
    const amount = Math.max(0, Number(transaction.amount) || 0);
    return sum + (transaction.type === "deposit" ? amount : -amount);
  }, 0);
  const totalDebt = debts.reduce((s, d) => s + d.remainingAmount, 0);
  const investmentValue = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalAssets = walletAssets + investmentValue + forexCashBalance;
  const liquidCash = wallets
    .filter((w) => w.type === "cash" || w.type === "bank")
    .reduce((s, w) => s + w.balance, 0);

  const factors: HealthScoreFactor[] = [];

  // ── 1. Saving rate ────────────────────────────────────────────────────────
  const savingRate = avgIncome > 0 ? avgSaving / avgIncome : 0;
  factors.push({
    label: "Tỷ lệ tiết kiệm",
    weight: 15,
    score:
      savingRate >= 0.4
        ? 10
        : savingRate >= 0.3
          ? 8
          : savingRate >= 0.2
            ? 6
            : savingRate >= 0.1
              ? 4
              : savingRate > 0
                ? 2
                : 0,
    note: `${Math.round(savingRate * 100)}% (mục tiêu ≥ 20%)`,
  });

  // ── 2. Cash flow direction ────────────────────────────────────────────────
  factors.push({
    label: "Dòng tiền",
    weight: 10,
    score: avgSaving > 0 ? 10 : avgSaving === 0 ? 5 : 0,
    note:
      avgSaving > 0
        ? "Dương — tốt"
        : avgSaving === 0
          ? "Hòa vốn"
          : "Âm — rủi ro",
  });

  // ── 3. Debt ratio (total debt / total assets) ─────────────────────────────
  const debtRatio =
    totalAssets > 0 ? totalDebt / totalAssets : totalDebt > 0 ? 1 : 0;
  factors.push({
    label: "Tỷ lệ nợ",
    weight: 15,
    score:
      debtRatio === 0
        ? 10
        : debtRatio <= 0.2
          ? 9
          : debtRatio <= 0.3
            ? 7
            : debtRatio <= 0.4
              ? 5
              : debtRatio <= 0.6
                ? 3
                : 1,
    note: `${Math.round(debtRatio * 100)}% (mục tiêu < 30%)`,
  });

  // ── 4. Emergency fund (liquid cash ÷ avg monthly expense) ────────────────
  const emergencyMonths = avgExpense > 0 ? liquidCash / avgExpense : 3;
  factors.push({
    label: "Quỹ khẩn cấp",
    weight: 10,
    score:
      emergencyMonths >= 6
        ? 10
        : emergencyMonths >= 3
          ? 7
          : emergencyMonths >= 1
            ? 4
            : 1,
    note: `${Math.round(emergencyMonths * 10) / 10} tháng chi tiêu (mục tiêu ≥ 3)`,
  });

  // ── 5. Goal progress ──────────────────────────────────────────────────────
  const goalProgressAvg =
    goals.length === 0
      ? 50
      : Math.round(
          goals.reduce(
            (s, g) =>
              s + Math.min((g.currentAmount / g.targetAmount) * 100, 100),
            0,
          ) / goals.length,
        );
  factors.push({
    label: "Tiến độ mục tiêu",
    weight: 10,
    score:
      goalProgressAvg >= 80
        ? 10
        : goalProgressAvg >= 60
          ? 8
          : goalProgressAvg >= 40
            ? 6
            : goalProgressAvg >= 20
              ? 4
              : 2,
    note: `Trung bình ${goalProgressAvg}%`,
  });

  // ── 6. Spending concentration (largest category share) ───────────────────
  const catExpenses = categories
    .filter((c) => c.type === "expense")
    .map((c) => ({
      amount: transactions
        .filter((t) => t.type === "expense" && t.categoryId === c.id)
        .reduce((s, t) => s + t.amount, 0),
    }));
  const totalExp = catExpenses.reduce((s, c) => s + c.amount, 0);
  const topCatShare =
    totalExp > 0 && catExpenses.length > 0
      ? Math.max(...catExpenses.map((c) => c.amount)) / totalExp
      : 0;
  factors.push({
    label: "Phân tán chi tiêu",
    weight: 5,
    score:
      topCatShare <= 0.25
        ? 10
        : topCatShare <= 0.4
          ? 7
          : topCatShare <= 0.6
            ? 4
            : 2,
    note: `Danh mục lớn nhất chiếm ${Math.round(topCatShare * 100)}%`,
  });

  // ── 7. Income stability (low coefficient of variation = stable) ───────────
  const incomeCov = avgIncome > 0 ? stddev(monthlyIncome) / avgIncome : 1;
  factors.push({
    label: "Ổn định thu nhập",
    weight: 10,
    score:
      incomeCov < 0.05
        ? 10
        : incomeCov < 0.15
          ? 8
          : incomeCov < 0.25
            ? 5
            : incomeCov < 0.4
              ? 3
              : 1,
    note:
      incomeCov < 0.15
        ? "Rất ổn định"
        : incomeCov < 0.35
          ? "Khá ổn định"
          : "Biến động nhiều",
  });

  // ── 8. Debt service coverage (monthly saving ÷ est. monthly obligation) ───
  const totalMonthlyDebtObligation = debts.reduce(
    (s, d) => s + d.remainingAmount / 24,
    0,
  );
  const dscr =
    totalMonthlyDebtObligation > 0
      ? avgSaving / totalMonthlyDebtObligation
      : 10;
  factors.push({
    label: "Khả năng trả nợ",
    weight: 10,
    score:
      dscr >= 3
        ? 10
        : dscr >= 2
          ? 8
          : dscr >= 1.2
            ? 6
            : dscr >= 1
              ? 4
              : dscr > 0
                ? 2
                : 0,
    note:
      totalMonthlyDebtObligation === 0
        ? "Không có nợ"
        : `Hệ số ${Math.round(dscr * 10) / 10}x (mục tiêu ≥ 1.2)`,
  });

  // ── 9. Investment ratio (investment value ÷ total assets) ─────────────────
  const investmentRatio = totalAssets > 0 ? investmentValue / totalAssets : 0;
  factors.push({
    label: "Tỷ lệ đầu tư",
    weight: 10,
    score:
      investmentRatio >= 0.3
        ? 10
        : investmentRatio >= 0.2
          ? 8
          : investmentRatio >= 0.1
            ? 5
            : investmentRatio > 0
              ? 3
              : 1,
    note: `${Math.round(investmentRatio * 100)}% tài sản đang đầu tư (mục tiêu ≥ 20%)`,
  });

  // ── 10. Budget adherence ──────────────────────────────────────────────────
  if (budgets.length > 0) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const adherentCount = budgets.filter((b) => {
      const spent = transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            t.categoryId === b.categoryId &&
            t.date.startsWith(
              b.month === currentMonth ? currentMonth : b.month,
            ),
        )
        .reduce((s, t) => s + t.amount, 0);
      return spent <= b.limitAmount;
    }).length;
    factors.push({
      label: "Tuân thủ ngân sách",
      weight: 5,
      score: Math.round((adherentCount / budgets.length) * 10),
      note: `${adherentCount}/${budgets.length} danh mục trong ngân sách`,
    });
  } else {
    factors.push({
      label: "Tuân thủ ngân sách",
      weight: 5,
      score: 5,
      note: "Chưa thiết lập ngân sách",
    });
  }

  // ── Weighted total ────────────────────────────────────────────────────────
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = factors.reduce(
    (s, f) => s + (f.score / 10) * f.weight,
    0,
  );
  const total = Math.round((weightedScore / totalWeight) * 100);

  const grade: HealthScoreV2["grade"] =
    total >= 85
      ? "A"
      : total >= 70
        ? "B"
        : total >= 55
          ? "C"
          : total >= 40
            ? "D"
            : "F";

  return {
    total,
    grade,
    label:
      grade === "A"
        ? "Xuất sắc"
        : grade === "B"
          ? "Tốt"
          : grade === "C"
            ? "Trung bình"
            : grade === "D"
              ? "Cần cải thiện"
              : "Rủi ro cao",
    factors,
  };
}
