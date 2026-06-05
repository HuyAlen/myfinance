/**
 * analytics/riskAnalytics.ts
 *
 * Sprint 17.7 — Financial Risk Engine.
 *
 * Computes a composite risk score (0–100) across four named dimensions:
 *   1. Debt Risk        — exposure + debt-service burden
 *   2. Liquidity Risk   — cash buffer adequacy
 *   3. Spending Risk    — expense volatility + overspend frequency
 *   4. Investment Risk  — concentration + diversification gap
 *
 * Also preserves the original 5-factor `factors` array for backward
 * compatibility with existing UI consumers.
 *
 * Input: plain data arrays. No side effects. Unit-test-ready.
 */

import type {
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

import {
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import { groupByMonth, lastNMonths, mean, stddev } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Risk severity level — lower is safer. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskFactor = {
  label: string;
  /** 0–20 per factor (higher = more risk). */
  riskScore: number;
  note: string;
};

/** One of the four named risk dimensions (0–100 each). */
export type RiskDimension = {
  key: "debt" | "liquidity" | "spending" | "investment";
  /** Vietnamese display label. */
  label: string;
  /** 0–100 — higher = more risk in this dimension. */
  score: number;
  level: RiskLevel;
  /** Key signals that drove this dimension's score. */
  factors: string[];
  /** Single AI recommendation in Vietnamese. */
  recommendation: string;
};

export type RiskScore = {
  /**
   * Weighted composite of four dimensions (0–100). Lower is better.
   *
   * Weights: debt 35% | liquidity 30% | spending 25% | investment 10%
   */
  total: number;
  level: RiskLevel;
  /** Vietnamese label matching the level. */
  label: string;
  /** Legacy 5-factor array — preserved for backward-compat UI. */
  factors: RiskFactor[];
  /** Four named risk dimensions — new in Sprint 17.7. */
  dimensions: RiskDimension[];
  /** Merged AI recommendations across all dimensions with elevated risk. */
  recommendations: string[];
};

// ─── Private helpers ──────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function levelFor(score: number): RiskLevel {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

function labelFor(level: RiskLevel): string {
  return {
    low: "Thấp",
    medium: "Trung bình",
    high: "Cao",
    critical: "Nguy hiểm",
  }[level];
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Computes a composite risk score across four named dimensions.
 *
 * @param wallets         All wallets.
 * @param debts           All debts.
 * @param goals           All financial goals.
 * @param transactions    All transactions.
 * @param investments     All investments (optional — defaults to []).
 * @param lookbackMonths  Historical window for trend metrics (default 3).
 */
export function computeRiskScore(
  wallets: Wallet[],
  debts: Debt[],
  goals: Goal[],
  transactions: Transaction[],
  investments: Investment[] = [],
  lookbackMonths = 3,
): RiskScore {
  const months = lastNMonths(lookbackMonths);
  const byMonth = groupByMonth(transactions);

  const monthlyIncome = months.map((m) => getTotalIncome(byMonth.get(m) ?? []));
  const monthlyExpense = months.map((m) =>
    getTotalExpense(byMonth.get(m) ?? []),
  );
  const avgIncome = mean(monthlyIncome);
  const avgExpense = mean(monthlyExpense);

  const totalWalletBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const totalInvestmentValue = investments.reduce(
    (s, inv) => s + inv.currentValue,
    0,
  );
  const totalAssets = totalWalletBalance + totalInvestmentValue;
  const totalDebt = debts.reduce((s, d) => s + d.remainingAmount, 0);
  const liquidCash = wallets
    .filter(
      (w) => w.type === "cash" || w.type === "bank" || w.type === "ewallet",
    )
    .reduce((s, w) => s + w.balance, 0);

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 1 — Debt Risk
  // ══════════════════════════════════════════════════════════════════════════
  const debtRatio =
    totalAssets > 0 ? totalDebt / totalAssets : totalDebt > 0 ? 1 : 0;
  // Monthly debt obligation proxy: assume 2% of remaining debt per month
  const estimatedMonthlyDebtService = totalDebt * 0.02;
  const debtServiceBurden =
    avgIncome > 0 ? estimatedMonthlyDebtService / avgIncome : 0;

  const debtBaseScore = clamp(debtRatio * 80 + debtServiceBurden * 100 * 0.2);
  const debtFactors: string[] = [
    `Tỷ lệ nợ / tài sản: ${Math.round(debtRatio * 100)}%`,
  ];
  if (debtServiceBurden > 0)
    debtFactors.push(
      `Gánh nặng trả nợ ước tính: ${Math.round(debtServiceBurden * 100)}% thu nhập`,
    );

  const debtDimension: RiskDimension = {
    key: "debt",
    label: "Rủi ro nợ",
    score: Math.round(debtBaseScore),
    level: levelFor(debtBaseScore),
    factors: debtFactors,
    recommendation:
      debtBaseScore > 75
        ? "Tình trạng nợ nghiêm trọng. Ưu tiên trả bớt nợ lãi suất cao ngay lập tức và tránh vay thêm."
        : debtBaseScore > 50
          ? "Nợ đang ở mức đáng lo. Hãy lập kế hoạch trả nợ trong 12–18 tháng tới."
          : debtBaseScore > 25
            ? "Mức nợ chấp nhận được. Tiếp tục trả đúng hạn và không tăng thêm nợ."
            : "Mức nợ tốt. Duy trì kỷ luật tài chính hiện tại.",
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 2 — Liquidity Risk
  // ══════════════════════════════════════════════════════════════════════════
  const cashBufferMonths = avgExpense > 0 ? liquidCash / avgExpense : 6;
  // 0 months = 100 risk, 6 months = 0 risk (linear between)
  const liquidityBaseScore = clamp(
    (1 - Math.min(cashBufferMonths, 6) / 6) * 100,
  );
  const liquidityFactors = [
    `Tiền mặt/ngân hàng: ${new Intl.NumberFormat("vi-VN").format(Math.round(liquidCash))} đ`,
    `Dự phòng: ${Math.round(cashBufferMonths * 10) / 10} tháng (mục tiêu ≥ 6)`,
  ];

  const liquidityDimension: RiskDimension = {
    key: "liquidity",
    label: "Rủi ro thanh khoản",
    score: Math.round(liquidityBaseScore),
    level: levelFor(liquidityBaseScore),
    factors: liquidityFactors,
    recommendation:
      liquidityBaseScore > 75
        ? "Quỹ dự phòng nguy hiểm thấp. Dừng đầu tư mới và tập trung tích lũy ít nhất 3 tháng chi phí trước."
        : liquidityBaseScore > 50
          ? "Quỹ dự phòng chưa đủ. Đặt mục tiêu tiết kiệm thêm để đạt 3–6 tháng chi phí."
          : liquidityBaseScore > 25
            ? "Thanh khoản ở mức trung bình. Cố gắng nâng dự phòng lên 6 tháng chi phí."
            : "Thanh khoản tốt. Tiếp tục duy trì quỹ dự phòng hiện tại.",
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 3 — Spending Risk
  // ══════════════════════════════════════════════════════════════════════════
  const expenseCov = avgExpense > 0 ? stddev(monthlyExpense) / avgExpense : 0;
  // Count months where expenses exceeded income
  const overspendMonths = monthlyIncome.filter(
    (inc, i) => inc > 0 && monthlyExpense[i] > inc,
  ).length;
  const overspendFreq =
    monthlyIncome.filter((inc) => inc > 0).length > 0
      ? overspendMonths / monthlyIncome.filter((inc) => inc > 0).length
      : 0;

  const spendingBaseScore = clamp(expenseCov * 50 * 2 + overspendFreq * 50);
  const spendingFactors = [
    `Biến động chi tiêu (CoV): ${Math.round(expenseCov * 100)}%`,
    `Tháng vượt thu: ${overspendMonths}/${months.length}`,
  ];

  const spendingDimension: RiskDimension = {
    key: "spending",
    label: "Rủi ro chi tiêu",
    score: Math.round(spendingBaseScore),
    level: levelFor(spendingBaseScore),
    factors: spendingFactors,
    recommendation:
      spendingBaseScore > 75
        ? "Chi tiêu bất ổn và thường xuyên vượt thu nhập. Thiết lập ngân sách nghiêm ngặt và cắt giảm chi phí không thiết yếu ngay."
        : spendingBaseScore > 50
          ? "Chi tiêu có xu hướng khó kiểm soát. Phân loại chi tiêu và đặt giới hạn cho từng danh mục."
          : spendingBaseScore > 25
            ? "Chi tiêu tương đối ổn định nhưng cần theo dõi sát hơn. Xem lại các danh mục chi lớn mỗi tháng."
            : "Chi tiêu được kiểm soát tốt. Duy trì thói quen ngân sách hiện tại.",
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 4 — Investment Risk
  // ══════════════════════════════════════════════════════════════════════════
  const netWorth = totalAssets - totalDebt;
  // Concentration: what % of net worth is in investments
  const investmentConcentration =
    netWorth > 0 ? clamp((totalInvestmentValue / netWorth) * 100) : 0;
  // Diversification: number of unique investment types
  const investmentTypes = new Set(investments.map((inv) => inv.type)).size;
  const diversificationScore =
    investments.length === 0
      ? 0 // no investments = no investment risk
      : investmentTypes >= 4
        ? 0
        : investmentTypes === 3
          ? 15
          : investmentTypes === 2
            ? 30
            : 50; // only 1 type = concentrated

  // Risk rises with concentration, but if no investments risk = 0
  const concentrationRisk =
    investments.length === 0
      ? 0
      : investmentConcentration > 80
        ? 60
        : investmentConcentration > 60
          ? 40
          : investmentConcentration > 40
            ? 20
            : 10;

  const investmentBaseScore = clamp(
    (concentrationRisk + diversificationScore) / 2,
  );
  const investmentFactors: string[] = [];
  if (investments.length === 0) {
    investmentFactors.push("Chưa có khoản đầu tư nào");
  } else {
    investmentFactors.push(
      `Tỷ trọng đầu tư trong tài sản ròng: ${Math.round(investmentConcentration)}%`,
    );
    investmentFactors.push(
      `Số loại tài sản đầu tư: ${investmentTypes} (đa dạng hóa ${investmentTypes >= 3 ? "tốt" : "chưa đủ"})`,
    );
  }

  const investmentDimension: RiskDimension = {
    key: "investment",
    label: "Rủi ro đầu tư",
    score: Math.round(investmentBaseScore),
    level: levelFor(investmentBaseScore),
    factors: investmentFactors,
    recommendation:
      investments.length === 0
        ? "Chưa có đầu tư. Khi quỹ dự phòng đủ 6 tháng, cân nhắc đầu tư dài hạn vào quỹ chỉ số hoặc cổ phiếu đa dạng."
        : investmentBaseScore > 50
          ? "Danh mục đầu tư tập trung rủi ro cao. Đa dạng hóa thêm loại tài sản và xem xét phân bổ lại."
          : investmentBaseScore > 25
            ? "Danh mục đầu tư khá tốt. Tiếp tục đa dạng hóa và theo dõi hiệu suất định kỳ."
            : "Danh mục đầu tư được phân bổ tốt. Duy trì chiến lược hiện tại.",
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COMPOSITE SCORE (weighted average)
  // Weights: debt 35% | liquidity 30% | spending 25% | investment 10%
  // ══════════════════════════════════════════════════════════════════════════
  const dimensions: RiskDimension[] = [
    debtDimension,
    liquidityDimension,
    spendingDimension,
    investmentDimension,
  ];

  const compositeTotal = clamp(
    Math.round(
      debtDimension.score * 0.35 +
        liquidityDimension.score * 0.3 +
        spendingDimension.score * 0.25 +
        investmentDimension.score * 0.1,
    ),
  );
  const compositeLevel = levelFor(compositeTotal);

  // ── Recommendations: collect from dimensions with elevated risk ───────────
  const recommendations = dimensions
    .filter((d) => d.level !== "low")
    .sort((a, b) => b.score - a.score)
    .map((d) => d.recommendation);

  // ── Legacy 5-factor array (backward compat) ───────────────────────────────
  const debtRatioScore: RiskFactor = {
    label: "Rủi ro nợ",
    riskScore:
      debtRatio >= 0.7
        ? 20
        : debtRatio >= 0.5
          ? 15
          : debtRatio >= 0.3
            ? 8
            : debtRatio >= 0.1
              ? 4
              : 0,
    note: `Tỷ lệ nợ ${Math.round(debtRatio * 100)}%`,
  };

  const incomeCov = avgIncome > 0 ? stddev(monthlyIncome) / avgIncome : 1;
  const incomeVolatilityFactor: RiskFactor = {
    label: "Biến động thu nhập",
    riskScore:
      incomeCov >= 0.5
        ? 20
        : incomeCov >= 0.3
          ? 13
          : incomeCov >= 0.15
            ? 7
            : incomeCov >= 0.05
              ? 3
              : 0,
    note: `Hệ số biến động ${Math.round(incomeCov * 100)}%`,
  };

  const expenseVolatilityFactor: RiskFactor = {
    label: "Biến động chi tiêu",
    riskScore:
      expenseCov >= 0.5
        ? 20
        : expenseCov >= 0.3
          ? 13
          : expenseCov >= 0.15
            ? 7
            : expenseCov >= 0.05
              ? 3
              : 0,
    note: `Hệ số biến động ${Math.round(expenseCov * 100)}%`,
  };

  const avgGoalProgress =
    goals.length === 0
      ? 50
      : goals.reduce(
          (s, g) => s + Math.min((g.currentAmount / g.targetAmount) * 100, 100),
          0,
        ) / goals.length;
  const goalGapFactor: RiskFactor = {
    label: "Khoảng cách mục tiêu",
    riskScore:
      goals.length === 0
        ? 5
        : avgGoalProgress >= 80
          ? 0
          : avgGoalProgress >= 60
            ? 5
            : avgGoalProgress >= 40
              ? 10
              : avgGoalProgress >= 20
                ? 15
                : 20,
    note:
      goals.length === 0
        ? "Chưa đặt mục tiêu"
        : `Tiến độ trung bình ${Math.round(avgGoalProgress)}%`,
  };

  const cashBufferFactor: RiskFactor = {
    label: "Dự phòng tiền mặt",
    riskScore:
      cashBufferMonths >= 6
        ? 0
        : cashBufferMonths >= 3
          ? 5
          : cashBufferMonths >= 1
            ? 12
            : 20,
    note: `${Math.round(cashBufferMonths * 10) / 10} tháng dự phòng (mục tiêu ≥ 3)`,
  };

  const factors: RiskFactor[] = [
    debtRatioScore,
    incomeVolatilityFactor,
    expenseVolatilityFactor,
    goalGapFactor,
    cashBufferFactor,
  ];

  return {
    total: compositeTotal,
    level: compositeLevel,
    label: labelFor(compositeLevel),
    factors,
    dimensions,
    recommendations,
  };
}
