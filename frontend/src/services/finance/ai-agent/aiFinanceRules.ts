import type { AIFinanceContext, AIFinanceTone } from "./aiFinanceContext";

export type AIFinanceRuleSeverity = "success" | "info" | "warning" | "danger";

export type AIFinanceRuleInsight = {
  id: string;
  title: string;
  description: string;
  severity: AIFinanceRuleSeverity;
  actionLabel?: string;
  scoreImpact?: number;
};

function severityFromTone(tone: AIFinanceTone): AIFinanceRuleSeverity {
  switch (tone) {
    case "good":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "info";
  }
}

function createInsight(input: AIFinanceRuleInsight): AIFinanceRuleInsight {
  return input;
}

export function buildAIFinanceRuleInsights(
  context: AIFinanceContext | null,
): AIFinanceRuleInsight[] {
  if (!context) return [];

  const insights: AIFinanceRuleInsight[] = [];

  if (context.counts.transactions === 0) {
    insights.push(
      createInsight({
        id: "no-transactions",
        title: "Chưa có giao dịch trong kỳ",
        description:
          "AI cần thêm giao dịch thu/chi để phân tích thói quen tài chính chính xác hơn.",
        severity: "info",
        actionLabel: "Thêm giao dịch",
      }),
    );
  }

  if (context.cashflow.netCashFlow < 0) {
    insights.push(
      createInsight({
        id: "negative-cashflow",
        title: "Dòng tiền đang âm",
        description: `Chi tiêu đang cao hơn thu nhập ${context.cashflow.netCashFlowLabel}. Nên kiểm tra nhóm chi lớn và ngân sách vượt hạn mức.`,
        severity: "danger",
        actionLabel: "Xem top chi tiêu",
        scoreImpact: -20,
      }),
    );
  } else if (context.cashflow.income > 0 && context.cashflow.savingRate >= 30) {
    insights.push(
      createInsight({
        id: "strong-saving-rate",
        title: "Tỷ lệ tiết kiệm tốt",
        description: `Bạn đang giữ lại khoảng ${context.cashflow.savingRateLabel} thu nhập trong kỳ này. Đây là tín hiệu tốt cho mục tiêu dài hạn.`,
        severity: "success",
        actionLabel: "Phân bổ phần dư",
        scoreImpact: 12,
      }),
    );
  } else if (context.cashflow.income > 0 && context.cashflow.savingRate < 10) {
    insights.push(
      createInsight({
        id: "low-saving-rate",
        title: "Tỷ lệ tiết kiệm còn thấp",
        description: `Tỷ lệ tiết kiệm hiện là ${context.cashflow.savingRateLabel}. Nên đặt mục tiêu tối thiểu 10–20% thu nhập nếu dòng tiền cho phép.`,
        severity: "warning",
        actionLabel: "Tối ưu ngân sách",
        scoreImpact: -8,
      }),
    );
  }

  const overBudgets = context.budgets.alerts.filter(
    (budget) => budget.status === "over_limit",
  );
  const nearBudgets = context.budgets.alerts.filter(
    (budget) => budget.status === "near_limit",
  );

  if (overBudgets.length > 0) {
    const top = overBudgets[0];
    insights.push(
      createInsight({
        id: "budget-over-limit",
        title: "Có ngân sách đã vượt hạn mức",
        description: `${top.categoryName} đã dùng ${top.usedPercent}% ngân sách (${top.spentAmount.toLocaleString("vi-VN")}đ / ${top.limitAmount.toLocaleString("vi-VN")}đ).`,
        severity: "danger",
        actionLabel: "Giảm chi nhóm này",
        scoreImpact: -15,
      }),
    );
  } else if (nearBudgets.length > 0) {
    const top = nearBudgets[0];
    insights.push(
      createInsight({
        id: "budget-near-limit",
        title: "Có ngân sách gần chạm giới hạn",
        description: `${top.categoryName} đã dùng ${top.usedPercent}% ngân sách. Nên kiểm soát trước khi vượt hạn mức.`,
        severity: "warning",
        actionLabel: "Theo dõi ngân sách",
        scoreImpact: -7,
      }),
    );
  }

  if (context.counts.budgets === 0 && context.cashflow.expense > 0) {
    insights.push(
      createInsight({
        id: "missing-budget",
        title: "Chưa có ngân sách cho kỳ này",
        description:
          "Bạn đã có chi tiêu nhưng chưa thiết lập ngân sách tháng. AI sẽ phân tích tốt hơn nếu có hạn mức theo danh mục.",
        severity: "warning",
        actionLabel: "Tạo ngân sách",
        scoreImpact: -6,
      }),
    );
  }

  const topCategory = context.spending.topCategories[0];
  if (topCategory && topCategory.percentOfExpense >= 45) {
    insights.push(
      createInsight({
        id: "concentrated-spending",
        title: "Chi tiêu tập trung vào một nhóm lớn",
        description: `${topCategory.categoryName} chiếm ${topCategory.percentOfExpense}% tổng chi tiêu (${topCategory.amountLabel}). Đây là nhóm nên tối ưu đầu tiên.`,
        severity: topCategory.percentOfExpense >= 60 ? "warning" : "info",
        actionLabel: "Phân tích nhóm chi",
        scoreImpact: topCategory.percentOfExpense >= 60 ? -8 : -3,
      }),
    );
  }

  if (context.spending.largestTransaction) {
    const largest = context.spending.largestTransaction;
    const pct =
      context.cashflow.expense > 0
        ? Math.round((largest.amount / context.cashflow.expense) * 100)
        : 0;

    if (pct >= 30) {
      insights.push(
        createInsight({
          id: "large-single-expense",
          title: "Một giao dịch chiếm tỷ trọng lớn",
          description: `${largest.categoryName} có giao dịch ${largest.amountLabel}, chiếm khoảng ${pct}% tổng chi tiêu kỳ này.`,
          severity: "info",
          actionLabel: "Kiểm tra giao dịch",
          scoreImpact: -4,
        }),
      );
    }
  }

  if (context.goals.total === 0) {
    insights.push(
      createInsight({
        id: "no-goals",
        title: "Chưa có mục tiêu tài chính",
        description:
          "Nên tạo ít nhất một mục tiêu như quỹ khẩn cấp, mua nhà, mua xe hoặc vốn đầu tư để AI theo dõi tiến độ.",
        severity: "info",
        actionLabel: "Tạo mục tiêu",
      }),
    );
  } else if (context.goals.nearDone > 0) {
    insights.push(
      createInsight({
        id: "goal-near-done",
        title: "Có mục tiêu gần hoàn thành",
        description: `${context.goals.nearDone} mục tiêu đã đạt trên 75%. Có thể ưu tiên nạp thêm để hoàn thành sớm.`,
        severity: "success",
        actionLabel: "Xem mục tiêu",
        scoreImpact: 8,
      }),
    );
  }

  if (context.snapshot.healthScore < 55) {
    insights.push(
      createInsight({
        id: "low-health-score",
        title: "Sức khỏe tài chính cần cải thiện",
        description: `Điểm hiện tại là ${context.snapshot.healthScore}/100. Ưu tiên dòng tiền dương, giảm nợ và kiểm soát ngân sách.`,
        severity: "danger",
        actionLabel: "Xem kế hoạch cải thiện",
        scoreImpact: -12,
      }),
    );
  } else if (context.snapshot.healthScore >= 80) {
    insights.push(
      createInsight({
        id: "healthy-finance",
        title: "Sức khỏe tài chính đang tốt",
        description: `Điểm hiện tại là ${context.snapshot.healthScore}/100. Có thể bắt đầu tối ưu đầu tư, mục tiêu dài hạn hoặc tăng quỹ dự phòng.`,
        severity: "success",
        actionLabel: "Tối ưu tiếp",
        scoreImpact: 10,
      }),
    );
  } else {
    insights.push(
      createInsight({
        id: "medium-health-score",
        title: "Tài chính ở mức cần theo dõi",
        description: `Điểm hiện tại là ${context.snapshot.healthScore}/100. Nên duy trì dòng tiền dương và tránh vượt ngân sách.`,
        severity: severityFromTone(context.snapshot.healthTone),
        actionLabel: "Theo dõi hằng tuần",
      }),
    );
  }

  return insights
    .sort((a, b) => (a.scoreImpact ?? 0) - (b.scoreImpact ?? 0))
    .slice(0, 6);
}

export function buildAIFinanceRuleSummary(insights: AIFinanceRuleInsight[]) {
  if (insights.length === 0) {
    return "Chưa có đủ dữ liệu để tạo insight tự động.";
  }

  const danger = insights.filter((item) => item.severity === "danger").length;
  const warning = insights.filter((item) => item.severity === "warning").length;
  const success = insights.filter((item) => item.severity === "success").length;

  if (danger > 0) {
    return `Có ${danger} cảnh báo quan trọng cần xử lý trước.`;
  }

  if (warning > 0) {
    return `Có ${warning} điểm cần theo dõi trong kỳ này.`;
  }

  if (success > 0) {
    return "Tình hình tài chính đang có tín hiệu tích cực.";
  }

  return "AI đã tạo insight từ dữ liệu hiện tại.";
}
