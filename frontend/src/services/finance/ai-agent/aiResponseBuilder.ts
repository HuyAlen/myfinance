import { formatVND } from "@/src/services/finance/financeCalculations";
import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";
import { buildAIFinanceRuleSummary } from "./aiFinanceRules";
import type {
  AIFinanceChatIntent,
  AIFinanceChatResponseParts,
} from "./aiChatTypes";

function asBulletLines(items: Array<string | false | null | undefined>) {
  const validItems = items.filter((item): item is string =>
    Boolean(item && item.trim()),
  );
  if (validItems.length === 0)
    return ["Chưa có dữ liệu phù hợp để phân tích phần này."];
  return validItems.map((item) => `• ${item}`);
}

function formatWalletBalance(balance: unknown) {
  return typeof balance === "number" ? formatVND(balance) : "Chưa có số dư";
}

function buildBudgetResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  const riskyBudgets = context.budgets.alerts.filter(
    (item) => item.status !== "safe",
  );
  const topBudgets = (
    riskyBudgets.length > 0 ? riskyBudgets : context.budgets.alerts
  ).slice(0, 3);

  return {
    overview: [
      `Tháng ${context.month}, bạn đã dùng ${context.budgets.usedPercent}% tổng ngân sách (${context.budgets.totalSpentLabel} / ${context.budgets.totalLimitLabel}).`,
    ],
    analysis: asBulletLines([
      `Còn lại: ${context.budgets.totalRemainingLabel}`,
      `Ngân sách gần hạn mức: ${context.budgets.nearLimitCount}`,
      `Ngân sách đã vượt hạn mức: ${context.budgets.overLimitCount}`,
      ...topBudgets.map(
        (item) =>
          `${item.categoryName}: ${item.usedPercent}% (${formatVND(item.spentAmount)} / ${formatVND(item.limitAmount)})`,
      ),
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.budgets.overLimitCount > 0
        ? "Dừng hoặc giảm chi ngay ở nhóm đã vượt hạn mức trước."
        : "Theo dõi các nhóm trên 80% để tránh vượt ngân sách cuối tháng.",
      context.counts.budgets === 0
        ? "Tạo ngân sách tháng theo danh mục để AI cảnh báo chính xác hơn."
        : "Có thể điều chỉnh hạn mức dựa trên top chi tiêu thực tế của tháng này.",
    ]),
  };
}

function buildCashflowResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [
      `Dòng tiền ròng tháng ${context.month} là ${context.cashflow.netCashFlowLabel}.`,
    ],
    analysis: asBulletLines([
      `Thu nhập: ${context.cashflow.incomeLabel}`,
      `Chi tiêu: ${context.cashflow.expenseLabel}`,
      `Tỷ lệ tiết kiệm: ${context.cashflow.savingRateLabel}`,
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.cashflow.netCashFlow >= 0
        ? "Phân bổ phần dư cho quỹ khẩn cấp, mục tiêu ưu tiên hoặc đầu tư."
        : "Rà soát top chi tiêu và ngân sách vượt hạn mức để kéo dòng tiền về dương.",
      context.cashflow.income <= 0
        ? "Chưa thấy thu nhập trong kỳ; hãy nhập giao dịch thu nhập để AI tính tỷ lệ tiết kiệm chính xác."
        : "Giữ mục tiêu tiết kiệm tối thiểu 10–20% thu nhập nếu dòng tiền cho phép.",
    ]),
  };
}

function buildSpendingResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [
      `Tổng chi tiêu tháng ${context.month} là ${context.cashflow.expenseLabel}.`,
    ],
    analysis: asBulletLines([
      ...context.spending.topCategories
        .slice(0, 5)
        .map(
          (item) =>
            `${item.categoryName}: ${item.amountLabel} (${item.percentOfExpense}% tổng chi)`,
        ),
      context.spending.largestTransaction
        ? `Giao dịch lớn nhất: ${context.spending.largestTransaction.amountLabel} - ${context.spending.largestTransaction.categoryName}`
        : "",
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      "Tối ưu nhóm chi lớn nhất trước vì tác động nhanh nhất đến dòng tiền.",
      context.spending.largestTransaction
        ? "Kiểm tra giao dịch lớn nhất để đảm bảo đúng danh mục và đúng ví."
        : "Nhập thêm giao dịch chi tiêu để AI nhận diện nhóm chi bất thường.",
    ]),
  };
}

function buildGoalResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [
      `Bạn có ${context.goals.total} mục tiêu. Tiến độ trung bình là ${context.goals.averageProgress}%.`,
    ],
    analysis: asBulletLines([
      ...context.goals.items
        .slice(0, 5)
        .map(
          (item) =>
            `${item.name}: ${item.progressPercent}% (${formatVND(item.currentAmount)} / ${formatVND(item.targetAmount)})`,
        ),
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.goals.total === 0
        ? "Tạo ít nhất một mục tiêu như quỹ khẩn cấp, mua nhà, mua xe hoặc vốn đầu tư."
        : "Ưu tiên mục tiêu gần hoàn thành hoặc mục tiêu có deadline gần nhất.",
      "Đặt số tiền đóng góp hằng tháng để AI theo dõi tiến độ chậm hay nhanh.",
    ]),
  };
}

function buildWalletResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  const wallets = [...context.raw.wallets]
    .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
    .slice(0, 5);

  return {
    overview: [
      `Tổng tài sản thanh khoản hiện là ${context.snapshot.liquidBalanceLabel}.`,
    ],
    analysis: asBulletLines([
      `Số ví đang theo dõi: ${context.counts.wallets}`,
      ...wallets.map(
        (wallet) => `${wallet.name}: ${formatWalletBalance(wallet.balance)}`,
      ),
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      "Theo dõi ví có số dư thấp để tránh thiếu tiền cho hóa đơn hoặc chi cố định.",
      "Nên tách ví chi tiêu, ví dự phòng và ví mục tiêu để kiểm soát dòng tiền rõ hơn.",
    ]),
  };
}

function buildDebtResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [`Tổng nợ hiện tại là ${context.snapshot.totalDebtLabel}.`],
    analysis: asBulletLines([
      `Tài sản ròng: ${context.snapshot.netWorthLabel}`,
      `Tổng tài sản: ${context.snapshot.totalAssetsLabel}`,
      `Số khoản nợ: ${context.counts.debts}`,
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.snapshot.totalDebt > 0
        ? "Ưu tiên trả khoản nợ lãi cao trước, sau đó tối ưu lịch trả nợ định kỳ."
        : "Hiện chưa ghi nhận nợ; tiếp tục duy trì tỷ lệ nợ thấp.",
      "Không tăng chi cố định nếu dòng tiền tháng còn yếu.",
    ]),
  };
}

function buildInvestmentResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [
      `Tài sản đầu tư hiện là ${context.snapshot.investmentAssetsLabel}.`,
    ],
    analysis: asBulletLines([
      `Số khoản đầu tư: ${context.counts.investments}`,
      `Tổng tài sản: ${context.snapshot.totalAssetsLabel}`,
      `Tài sản thanh khoản: ${context.snapshot.liquidBalanceLabel}`,
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.cashflow.netCashFlow > 0
        ? "Có thể phân bổ một phần dòng tiền dương vào đầu tư sau khi đủ quỹ khẩn cấp."
        : "Chưa nên tăng đầu tư khi dòng tiền đang âm; ưu tiên ổn định thu chi trước.",
      "Không dùng tiền hóa đơn hoặc quỹ khẩn cấp để đầu tư rủi ro cao.",
    ]),
  };
}

function buildOverviewResponse(
  context: AIFinanceContext,
  insights: AIFinanceRuleInsight[],
): AIFinanceChatResponseParts {
  return {
    overview: [
      `Tháng ${context.month}, tài sản ròng là ${context.snapshot.netWorthLabel}, điểm sức khỏe tài chính ${context.snapshot.healthScore}/100.`,
    ],
    analysis: asBulletLines([
      `Thu nhập: ${context.cashflow.incomeLabel}`,
      `Chi tiêu: ${context.cashflow.expenseLabel}`,
      `Dòng tiền ròng: ${context.cashflow.netCashFlowLabel}`,
      `Tỷ lệ tiết kiệm: ${context.cashflow.savingRateLabel}`,
      buildAIFinanceRuleSummary(insights),
      ...insights.map((item) => item.description),
    ]),
    suggestions: asBulletLines([
      context.cashflow.netCashFlow < 0
        ? "Ưu tiên xử lý dòng tiền âm trước mọi mục tiêu khác."
        : "Duy trì dòng tiền dương và phân bổ phần dư theo mục tiêu ưu tiên.",
      context.budgets.overLimitCount > 0
        ? "Kiểm tra ngân sách đã vượt hạn mức trong tháng này."
        : "Tiếp tục theo dõi ngân sách và top chi tiêu hằng tuần.",
    ]),
  };
}

function buildFallbackResponse(): AIFinanceChatResponseParts {
  return {
    overview: ["Tôi chưa đọc được dữ liệu tài chính hiện tại trong app."],
    analysis: [
      "Không có Finance Context nên AI chưa thể kết luận bằng số liệu thật.",
      "Tôi sẽ không tự bịa thu nhập, chi tiêu, ngân sách hoặc số dư.",
    ],
    suggestions: [
      "Kiểm tra lại buildAIFinanceContext(), dữ liệu local/Supabase và thử mở lại AI Drawer.",
    ],
  };
}

export function buildAIFinanceResponseParts(input: {
  context: AIFinanceContext | null;
  intent: AIFinanceChatIntent;
  insights: AIFinanceRuleInsight[];
}): AIFinanceChatResponseParts {
  if (!input.context) return buildFallbackResponse();

  switch (input.intent) {
    case "budget":
      return buildBudgetResponse(input.context, input.insights);
    case "cashflow":
      return buildCashflowResponse(input.context, input.insights);
    case "spending":
      return buildSpendingResponse(input.context, input.insights);
    case "goal":
      return buildGoalResponse(input.context, input.insights);
    case "wallet":
      return buildWalletResponse(input.context, input.insights);
    case "debt":
      return buildDebtResponse(input.context, input.insights);
    case "investment":
      return buildInvestmentResponse(input.context, input.insights);
    case "health":
    case "alert":
    case "overview":
    case "unknown":
    default:
      return buildOverviewResponse(input.context, input.insights);
  }
}

export function composeAIFinanceAnswer(parts: AIFinanceChatResponseParts) {
  return [
    "Tổng quan",
    ...parts.overview,
    "",
    "Phân tích",
    ...parts.analysis,
    "",
    "Gợi ý",
    ...parts.suggestions,
  ].join("\n");
}
