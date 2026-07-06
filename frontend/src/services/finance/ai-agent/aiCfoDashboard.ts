import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export type AICfoDashboardSeverity = "success" | "info" | "warning" | "danger";

export type AICfoDashboardIcon =
  | "alert"
  | "cashflow"
  | "saving"
  | "budget"
  | "wallet"
  | "goal"
  | "debt"
  | "investment"
  | "shield";

export type AICfoDashboardItem = {
  id: string;
  title: string;
  body: string;
  severity: AICfoDashboardSeverity;
  icon: AICfoDashboardIcon;
  metricLabel?: string;
  metricValue?: string;
  ctaLabel?: string;
  ctaRoute?: string;
  question?: string;
  score: number;
};

export type AICfoDashboardBrief = {
  generatedAt: string;
  greeting: string;
  title: string;
  summary: string;
  tone: AICfoDashboardSeverity;
  healthScore: number;
  riskLabel: string;
  highlights: {
    label: string;
    value: string;
    tone: AICfoDashboardSeverity;
  }[];
  priorities: AICfoDashboardItem[];
  opportunities: AICfoDashboardItem[];
  nextBestAction: AICfoDashboardItem | null;
};

type DashboardSummaryInput = {
  netWorth: number;
  income: number;
  expense: number;
  monthlyExpense?: number;
  savingRate: number;
  debtRatio: number;
  liquidBalance?: number;
  totalDebt?: number;
  investmentAssets?: number;
  goalScore?: number;
};

type BuildAICfoDashboardBriefInput = {
  summary: DashboardSummaryInput;
  healthScore: number;
  riskLevel: string;
  emergencyMonths: number;
  wallets: Wallet[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  debts: Debt[];
  investments: Investment[];
  categories: Category[];
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

function formatPercent(value: number) {
  return `${Math.round(value || 0)}%`;
}

function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function getCategoryName(categories: Category[], categoryId: string) {
  return (
    categories.find((category) => category.id === categoryId)?.name ?? "Khác"
  );
}

function getExpenseByCategory(
  transactions: Transaction[],
  categories: Category[],
) {
  const expenseCategories = new Set(
    categories
      .filter((category) => category.type === "expense")
      .map((category) => category.id),
  );

  const byCategory = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (transaction.type !== "expense") return;

    const amount = Number(transaction.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const isExpenseCategory =
      expenseCategories.size === 0 ||
      expenseCategories.has(transaction.categoryId);

    if (!isExpenseCategory) return;

    byCategory.set(
      transaction.categoryId,
      (byCategory.get(transaction.categoryId) ?? 0) + amount,
    );
  });

  return byCategory;
}

function getBudgetAlerts(input: {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
}) {
  const expenseByCategory = getExpenseByCategory(
    input.transactions,
    input.categories,
  );

  return input.budgets
    .map((budget) => {
      const spent = expenseByCategory.get(budget.categoryId) ?? 0;
      const limit = Number(budget.limitAmount ?? 0);
      const usedPercent = limit > 0 ? Math.round((spent / limit) * 100) : 0;

      return {
        budget,
        categoryName: getCategoryName(input.categories, budget.categoryId),
        spent,
        limit,
        usedPercent,
        remaining: Math.max(limit - spent, 0),
      };
    })
    .filter((item) => item.limit > 0 && item.usedPercent >= 80)
    .sort((a, b) => b.usedPercent - a.usedPercent);
}

function getTopSpendingCategory(input: {
  transactions: Transaction[];
  categories: Category[];
}) {
  const byCategory = Array.from(
    getExpenseByCategory(input.transactions, input.categories).entries(),
  )
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: getCategoryName(input.categories, categoryId),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return byCategory[0] ?? null;
}

function addUnique(items: AICfoDashboardItem[], item: AICfoDashboardItem) {
  if (items.some((current) => current.id === item.id)) return;
  items.push(item);
}

function rankItems(items: AICfoDashboardItem[]) {
  const severityWeight: Record<AICfoDashboardSeverity, number> = {
    danger: 400,
    warning: 300,
    info: 200,
    success: 100,
  };

  return [...items].sort(
    (a, b) =>
      severityWeight[b.severity] +
      b.score -
      (severityWeight[a.severity] + a.score),
  );
}

function getBriefTone(input: {
  healthScore: number;
  netCashFlow: number;
  emergencyMonths: number;
  overBudgetCount: number;
}) {
  if (
    input.overBudgetCount > 0 ||
    input.netCashFlow < 0 ||
    input.healthScore < 45
  ) {
    return "danger";
  }

  if (input.healthScore < 65 || input.emergencyMonths < 3) {
    return "warning";
  }

  if (input.healthScore >= 75 && input.netCashFlow >= 0) {
    return "success";
  }

  return "info";
}

export function buildAICfoDashboardBrief(
  input: BuildAICfoDashboardBriefInput,
): AICfoDashboardBrief {
  const netCashFlow = input.summary.income - input.summary.expense;
  const budgetAlerts = getBudgetAlerts({
    budgets: input.budgets,
    transactions: input.transactions,
    categories: input.categories,
  });
  const overBudget = budgetAlerts.filter((item) => item.usedPercent > 100);
  const nearBudget = budgetAlerts.filter((item) => item.usedPercent <= 100);
  const topBudget = budgetAlerts[0] ?? null;
  const topSpending = getTopSpendingCategory({
    transactions: input.transactions,
    categories: input.categories,
  });

  const priorities: AICfoDashboardItem[] = [];
  const opportunities: AICfoDashboardItem[] = [];

  if (topBudget && topBudget.usedPercent > 100) {
    addUnique(priorities, {
      id: "over-budget",
      title: `${topBudget.categoryName} đang vượt ngân sách`,
      body: `Bạn đã dùng ${topBudget.usedPercent}% hạn mức (${formatVnd(topBudget.spent)} / ${formatVnd(topBudget.limit)}). Đây là điểm cần xử lý trước để tránh lệch kế hoạch tháng.`,
      severity: "danger",
      icon: "budget",
      metricLabel: "Đã dùng",
      metricValue: formatPercent(topBudget.usedPercent),
      ctaLabel: "Xem ngân sách",
      ctaRoute: "/budgets",
      question: `Vì sao ngân sách ${topBudget.categoryName} vượt và nên cắt khoản nào?`,
      score: 98,
    });
  } else if (topBudget) {
    addUnique(priorities, {
      id: "near-budget",
      title: `${topBudget.categoryName} gần chạm ngân sách`,
      body: `Nhóm này đã dùng ${topBudget.usedPercent}% hạn mức. Nếu còn nhiều ngày trong kỳ, nên giảm tốc chi tiêu nhóm này.`,
      severity: "warning",
      icon: "budget",
      metricLabel: "Đã dùng",
      metricValue: formatPercent(topBudget.usedPercent),
      ctaLabel: "Xem ngân sách",
      ctaRoute: "/budgets",
      question: `Tôi nên điều chỉnh ngân sách ${topBudget.categoryName} thế nào?`,
      score: 85,
    });
  }

  if (netCashFlow < 0) {
    addUnique(priorities, {
      id: "negative-cashflow",
      title: "Dòng tiền đang âm",
      body: `Chi tiêu đang cao hơn thu nhập ${formatVnd(Math.abs(netCashFlow))}. Nên kiểm tra ngay nhóm chi lớn và giao dịch bất thường.`,
      severity: "danger",
      icon: "cashflow",
      metricLabel: "Dòng tiền",
      metricValue: formatVnd(netCashFlow),
      ctaLabel: "Xem giao dịch",
      ctaRoute: "/transactions",
      question: "Những giao dịch nào làm dòng tiền tháng này bị âm?",
      score: 95,
    });
  } else if (input.summary.income > 0 && input.summary.savingRate < 10) {
    addUnique(priorities, {
      id: "low-saving-rate",
      title: "Tỷ lệ tiết kiệm còn thấp",
      body: `Bạn chỉ giữ lại khoảng ${formatPercent(input.summary.savingRate)} thu nhập. Mục tiêu tối thiểu nên là 10–20% nếu dòng tiền cho phép.`,
      severity: "warning",
      icon: "saving",
      metricLabel: "Tiết kiệm",
      metricValue: formatPercent(input.summary.savingRate),
      ctaLabel: "Tối ưu ngân sách",
      ctaRoute: "/budgets",
      question: "Tôi nên giảm nhóm chi nào để tăng tỷ lệ tiết kiệm?",
      score: 78,
    });
  }

  if (input.emergencyMonths < 3) {
    const monthlyExpense =
      input.summary.monthlyExpense || input.summary.expense || 0;
    const targetEmergency = monthlyExpense * 3;
    const currentLiquid = input.summary.liquidBalance ?? 0;
    const gap = Math.max(targetEmergency - currentLiquid, 0);

    addUnique(priorities, {
      id: "emergency-fund",
      title: "Quỹ khẩn cấp chưa đủ 3 tháng",
      body: `Hiện khoảng ${formatOneDecimal(input.emergencyMonths)} tháng chi tiêu. Nên ưu tiên bổ sung thêm ${formatVnd(gap)} để đạt mốc an toàn 3 tháng.`,
      severity: input.emergencyMonths < 1 ? "danger" : "warning",
      icon: "shield",
      metricLabel: "Quỹ khẩn cấp",
      metricValue: `${formatOneDecimal(input.emergencyMonths)} tháng`,
      ctaLabel: "Tạo mục tiêu",
      ctaRoute: "/goals",
      question: "Lập kế hoạch quỹ khẩn cấp 3 tháng cho tôi.",
      score: 82,
    });
  }

  if (input.summary.debtRatio > 40 || (input.summary.totalDebt ?? 0) > 0) {
    addUnique(priorities, {
      id: "debt-watch",
      title:
        input.summary.debtRatio > 40
          ? "Tỷ lệ nợ đang cao"
          : "Có khoản nợ cần theo dõi",
      body:
        input.summary.debtRatio > 40
          ? `Tỷ lệ nợ hiện là ${formatPercent(input.summary.debtRatio)}. Nên ưu tiên giảm nợ trước khi tăng đầu tư rủi ro.`
          : `Tổng nợ hiện là ${formatVnd(input.summary.totalDebt ?? 0)}. Hãy đảm bảo có lịch trả nợ rõ ràng.`,
      severity: input.summary.debtRatio > 40 ? "danger" : "warning",
      icon: "debt",
      metricLabel: "Tỷ lệ nợ",
      metricValue: formatPercent(input.summary.debtRatio),
      ctaLabel: "Xem nợ",
      ctaRoute: "/debts",
      question: "Tôi nên trả nợ theo thứ tự nào?",
      score: input.summary.debtRatio > 40 ? 88 : 62,
    });
  }

  if (input.goals.length > 0 && (input.summary.goalScore ?? 0) < 30) {
    addUnique(priorities, {
      id: "slow-goals",
      title: "Mục tiêu tài chính đang chậm",
      body: `${input.goals.length} mục tiêu hiện đạt trung bình ${formatPercent(input.summary.goalScore ?? 0)}. Nên chọn 1 mục tiêu ưu tiên và góp cố định mỗi tháng.`,
      severity: "warning",
      icon: "goal",
      metricLabel: "Tiến độ",
      metricValue: formatPercent(input.summary.goalScore ?? 0),
      ctaLabel: "Xem mục tiêu",
      ctaRoute: "/goals",
      question: "Mục tiêu nào nên ưu tiên trong tháng này?",
      score: 72,
    });
  }

  if (netCashFlow > 0 && input.summary.savingRate >= 20) {
    addUnique(opportunities, {
      id: "positive-cashflow",
      title: "Dòng tiền đang rất tốt",
      body: `Bạn đang dư ${formatVnd(netCashFlow)} trong kỳ này. Có thể chia phần dư cho quỹ khẩn cấp, mục tiêu lớn và đầu tư dài hạn.`,
      severity: "success",
      icon: "cashflow",
      metricLabel: "Dư kỳ này",
      metricValue: formatVnd(netCashFlow),
      ctaLabel: "Phân bổ mục tiêu",
      ctaRoute: "/goals",
      question: "Phân bổ dòng tiền dư tháng này thế nào là hợp lý?",
      score: 88,
    });
  }

  if (input.summary.savingRate >= 30) {
    addUnique(opportunities, {
      id: "strong-saving-rate",
      title: "Tỷ lệ tiết kiệm mạnh",
      body: `Tỷ lệ tiết kiệm đạt ${formatPercent(input.summary.savingRate)}. Đây là nền tốt để tăng tốc mục tiêu mua nhà, mua xe hoặc quỹ đầu tư.`,
      severity: "success",
      icon: "saving",
      metricLabel: "Tiết kiệm",
      metricValue: formatPercent(input.summary.savingRate),
      ctaLabel: "Xem báo cáo",
      ctaRoute: "/reports",
      question: "Tôi nên tận dụng tỷ lệ tiết kiệm cao này thế nào?",
      score: 74,
    });
  }

  if ((input.summary.totalDebt ?? 0) <= 0) {
    addUnique(opportunities, {
      id: "debt-free",
      title: "Không có nợ là lợi thế lớn",
      body: "Hồ sơ tài chính đang có nền an toàn. Nếu quỹ khẩn cấp đủ, bạn có thể tăng tỷ trọng tiết kiệm mục tiêu hoặc đầu tư.",
      severity: "success",
      icon: "shield",
      metricLabel: "Nợ",
      metricValue: formatVnd(0),
      ctaLabel: "Xem tài sản",
      ctaRoute: "/wallets",
      question: "Không có nợ thì tôi nên ưu tiên tích sản thế nào?",
      score: 65,
    });
  }

  if (topSpending) {
    addUnique(opportunities, {
      id: "top-spending",
      title: `${topSpending.categoryName} là nhóm chi lớn nhất`,
      body: `Nhóm này chi ${formatVnd(topSpending.amount)} trong kỳ. Đây là nơi dễ tìm cơ hội tối ưu nếu muốn giảm chi tiêu.`,
      severity:
        topBudget && topBudget.categoryName === topSpending.categoryName
          ? "warning"
          : "info",
      icon: "budget",
      metricLabel: "Chi lớn nhất",
      metricValue: formatVnd(topSpending.amount),
      ctaLabel: "Xem giao dịch",
      ctaRoute: "/transactions",
      question: `Phân tích chi tiêu nhóm ${topSpending.categoryName} cho tôi.`,
      score: 58,
    });
  }

  const rankedPriorities = rankItems(priorities).slice(0, 3);
  const rankedOpportunities = rankItems(opportunities).slice(0, 3);
  const nextBestAction = rankedPriorities[0] ?? rankedOpportunities[0] ?? null;

  const tone = getBriefTone({
    healthScore: input.healthScore,
    netCashFlow,
    emergencyMonths: input.emergencyMonths,
    overBudgetCount: overBudget.length,
  });

  const summary =
    tone === "danger"
      ? "Có vài điểm cần xử lý ngay để giữ kế hoạch tài chính không bị lệch."
      : tone === "warning"
        ? "Tài chính nhìn chung ổn, nhưng vẫn có một vài điểm cần theo dõi kỹ."
        : tone === "success"
          ? "Tài chính đang đi đúng hướng. Đây là thời điểm tốt để phân bổ phần dư có kỷ luật."
          : "AI đã tổng hợp những điểm đáng chú ý nhất từ dữ liệu hiện tại.";

  return {
    generatedAt: new Date().toISOString(),
    greeting: getGreeting(),
    title: "AI CFO Brief",
    summary,
    tone,
    healthScore: input.healthScore,
    riskLabel: input.riskLevel,
    highlights: [
      {
        label: "Dòng tiền",
        value: formatVnd(netCashFlow),
        tone: netCashFlow >= 0 ? "success" : "danger",
      },
      {
        label: "Tiết kiệm",
        value: formatPercent(input.summary.savingRate),
        tone:
          input.summary.savingRate >= 30
            ? "success"
            : input.summary.savingRate >= 10
              ? "warning"
              : "danger",
      },
      {
        label: "Ngân sách cảnh báo",
        value: String(budgetAlerts.length),
        tone:
          overBudget.length > 0
            ? "danger"
            : nearBudget.length > 0
              ? "warning"
              : "success",
      },
      {
        label: "Quỹ khẩn cấp",
        value: `${formatOneDecimal(input.emergencyMonths)} tháng`,
        tone:
          input.emergencyMonths >= 6
            ? "success"
            : input.emergencyMonths >= 3
              ? "info"
              : "warning",
      },
    ],
    priorities: rankedPriorities,
    opportunities: rankedOpportunities,
    nextBestAction,
  };
}
