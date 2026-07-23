import type { Investment } from "@/src/types/finance";
import {
  ALL_INVESTMENT_TYPES,
  INVESTMENT_TYPE_CONFIG,
} from "./investmentConstants";
import type {
  EnrichedInvestment,
  InvestmentTypeBreakdown,
  PortfolioHealthScores,
  PortfolioInsight,
  PortfolioSummary,
} from "./investmentTypes";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculatePortfolioSummary(
  investments: Investment[],
): PortfolioSummary {
  const investedAmount = investments.reduce(
    (sum, item) => sum + item.investedAmount,
    0,
  );
  const currentValue = investments.reduce(
    (sum, item) => sum + item.currentValue,
    0,
  );
  const profitLoss = currentValue - investedAmount;
  const returnPercent =
    investedAmount > 0 ? round1((profitLoss / investedAmount) * 100) : 0;
  return { investedAmount, currentValue, profitLoss, returnPercent };
}

export function calculateTypeBreakdown(
  investments: Investment[],
  totalCurrentValue: number,
): InvestmentTypeBreakdown[] {
  return ALL_INVESTMENT_TYPES.map((type) => {
    const items = investments.filter((item) => item.type === type);
    const invested = items.reduce((sum, item) => sum + item.investedAmount, 0);
    const current = items.reduce((sum, item) => sum + item.currentValue, 0);
    const pl = current - invested;
    return {
      type,
      ...INVESTMENT_TYPE_CONFIG[type],
      count: items.length,
      invested,
      current,
      pl,
      plPct: invested > 0 ? round1((pl / invested) * 100) : 0,
      allocPct: totalCurrentValue > 0 ? (current / totalCurrentValue) * 100 : 0,
    };
  }).filter((group) => group.count > 0);
}

export function enrichInvestments(
  investments: Investment[],
  totalCurrentValue: number,
): EnrichedInvestment[] {
  return investments.map((investment) => {
    const pl = investment.currentValue - investment.investedAmount;
    const plPct =
      investment.investedAmount > 0
        ? round1((pl / investment.investedAmount) * 100)
        : 0;
    return {
      ...investment,
      pl,
      plPct,
      allocPct:
        totalCurrentValue > 0
          ? (investment.currentValue / totalCurrentValue) * 100
          : 0,
      performanceState: pl > 0 ? "profit" : pl < 0 ? "loss" : "break_even",
      status: plPct >= 10 ? "strong" : pl >= 0 ? "stable" : "under",
    };
  });
}

function grade(score: number) {
  if (score >= 80) return { label: "Xuất sắc", color: "text-indigo-600" };
  if (score >= 60) return { label: "Tốt", color: "text-blue-600" };
  if (score >= 40) return { label: "Cảnh báo", color: "text-amber-600" };
  return { label: "Rủi ro cao", color: "text-rose-500" };
}

export function calculatePortfolioHealth(
  breakdown: InvestmentTypeBreakdown[],
  summary: PortfolioSummary,
  investmentCount: number,
): PortfolioHealthScores {
  const typeCount = breakdown.length;
  const maxAlloc =
    breakdown.length > 0
      ? Math.max(...breakdown.map((group) => group.allocPct))
      : 0;
  const diversification =
    typeCount >= 4
      ? 90
      : typeCount === 3
        ? 70
        : typeCount === 2
          ? 50
          : typeCount === 1
            ? 25
            : 0;
  const concentration =
    maxAlloc < 35 ? 90 : maxAlloc < 50 ? 70 : maxAlloc < 70 ? 45 : 20;
  const roi = summary.returnPercent;
  const performance =
    roi > 15
      ? 95
      : roi > 8
        ? 80
        : roi > 3
          ? 65
          : roi > 0
            ? 50
            : roi > -5
              ? 30
              : 15;
  const overall =
    investmentCount === 0
      ? 0
      : Math.round((diversification + concentration + performance) / 3);

  return {
    diversification,
    concentration,
    performance,
    overall,
    diversificationGrade: grade(diversification),
    concentrationGrade: grade(concentration),
    performanceGrade: grade(performance),
    overallGrade: grade(overall),
  };
}

export function buildPortfolioInsights(
  investments: Investment[],
  breakdown: InvestmentTypeBreakdown[],
  enriched: EnrichedInvestment[],
  summary: PortfolioSummary,
): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];
  const maxAlloc =
    breakdown.length > 0
      ? Math.max(...breakdown.map((group) => group.allocPct))
      : 0;
  const top = breakdown.find((group) => group.allocPct === maxAlloc);
  const underperformers = enriched.filter((item) => item.plPct < -10);
  const winners = enriched.filter((item) => item.plPct >= 15);
  const hasGold = breakdown.some((group) => group.type === "gold");
  const hasFund = breakdown.some((group) => group.type === "fund");

  if (maxAlloc > 60 && top)
    insights.push({
      tone: "warning",
      title: `Rủi ro tập trung cao · ${top.label}`,
      body: `${top.label} chiếm tới ${Math.round(maxAlloc)}% danh mục. Cân nhắc phân bổ lại để giảm rủi ro tập trung.`,
    });
  if (breakdown.length === 1)
    insights.push({
      tone: "warning",
      title: "Thiếu đa dạng hoá",
      body: "Danh mục chỉ có 1 loại tài sản. Phân bổ vào 2–3 loại khác nhau sẽ giảm rủi ro tổng thể đáng kể.",
    });
  if (underperformers.length > 0)
    insights.push({
      tone: "warning",
      title: `${underperformers.length} tài sản kém hiệu quả`,
      body: `${underperformers
        .slice(0, 3)
        .map((item) => item.name)
        .join(
          ", ",
        )} đang giảm trên 10%. Hãy rà soát lại luận điểm đầu tư, mức chịu rủi ro và kế hoạch quản lý vị thế.`,
    });
  if (summary.returnPercent > 10)
    insights.push({
      tone: "good",
      title: "Danh mục đang tăng trưởng tốt!",
      body: `ROI tổng thể đạt ${summary.returnPercent}%. Đây là số liệu theo dõi hiệu suất hiện tại và không bảo đảm kết quả trong tương lai.`,
    });
  if (winners.length > 0)
    insights.push({
      tone: "good",
      title: `${winners.length} tài sản sinh lời tốt`,
      body: `${winners
        .slice(0, 3)
        .map((item) => item.name)
        .join(
          ", ",
        )} đang có ROI ≥ 15%. Hãy đối chiếu với mục tiêu, thời hạn và mức chịu rủi ro đã đặt ra.`,
    });
  if (!hasGold && investments.length >= 3)
    insights.push({
      tone: "info",
      title: "Danh mục chưa có nhóm vàng",
      body: "Bạn có thể đánh giá vai trò, chi phí và rủi ro của nhóm tài sản này trước khi thay đổi phân bổ.",
    });
  if (!hasFund && investments.length >= 3)
    insights.push({
      tone: "info",
      title: "Danh mục chưa có nhóm quỹ đầu tư",
      body: "Hãy so sánh mục tiêu, phí quản lý, thanh khoản và mức độ phù hợp trước khi thay đổi phân bổ.",
    });
  if (summary.returnPercent < 0)
    insights.push({
      tone: "warning",
      title: "Danh mục đang lỗ tổng thể",
      body: `ROI hiện tại: ${summary.returnPercent}%. Hãy rà soát lại mục tiêu, thời hạn nắm giữ và giới hạn rủi ro trước khi đưa ra quyết định.`,
    });
  if (breakdown.length >= 4 && summary.returnPercent >= 5)
    insights.push({
      tone: "good",
      title: "Danh mục đa dạng & sinh lời",
      body: `${breakdown.length} loại tài sản, ROI ${summary.returnPercent}%. Portfolio của bạn được phân bổ tốt và đang tăng trưởng.`,
    });
  return insights.slice(0, 6);
}
