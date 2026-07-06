import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";
import { compactSmartFinanceSearch } from "./aiFinanceSearch";
import type { AIFinanceOpenAIInput } from "./aiPromptTypes";

function compactContext(context: AIFinanceContext | null) {
  if (!context) return null;

  return {
    generatedAt: context.generatedAt,
    month: context.month,
    range: context.range,
    counts: context.counts,
    snapshot: context.snapshot,
    cashflow: context.cashflow,
    budgets: context.budgets,
    spending: {
      topCategories: context.spending.topCategories.slice(0, 10),
      largestTransaction: context.spending.largestTransaction,
    },
    goals: context.goals,
  };
}

function compactInsights(insights: AIFinanceRuleInsight[]) {
  return insights.map((insight) => ({
    id: insight.id,
    title: insight.title,
    description: insight.description,
    severity: insight.severity,
    actionLabel: insight.actionLabel,
    scoreImpact: insight.scoreImpact,
  }));
}

function compactConversation(input: AIFinanceOpenAIInput) {
  return (input.conversation ?? []).slice(-8).map((message) => ({
    role: message.role,
    content:
      message.content.length > 900
        ? `${message.content.slice(0, 900)}...`
        : message.content,
  }));
}

export function buildAIFinanceOpenAISystemPrompt(input: AIFinanceOpenAIInput) {
  return [
    "You are MyFinance AI, a personal finance copilot inside the MyFinance app.",
    "Answer in Vietnamese.",
    "Write like ChatGPT: natural, direct, helpful, and specific to the user's question.",
    "Do not force every answer into a fixed 3-section template such as Tổng quan / Phân tích / Gợi ý.",
    "Use Markdown when useful, but keep it polished: short paragraphs first, bullets only for important lists, and tables only for clear comparisons.",
    "Prefer a ChatGPT-style answer: 1 short opening insight, then concise details. Avoid dumping every metric as a bullet list.",
    "Use bold sparingly for key numbers, category names, and decisions.",
    "Avoid starting every answer with headings. Use headings only when the answer is long enough to need structure.",
    "Do not output raw markdown-looking clutter such as many consecutive lines beginning with dash and bold labels unless a list is truly the clearest format.",
    "Use exact numbers and labels from Finance Context, Smart Finance Search, and Rule Insights only.",
    "Financial health values are authoritative: use financeContext.snapshot.health.score, grade, label, risk, and factor scores exactly as provided.",
    "Never recalculate, reinterpret, downgrade, or override the financial health score. If Dashboard says 72/100 Grade B Tốt, answer 72/100 Grade B Tốt.",
    "Never fabricate balances, income, expenses, budgets, goals, transactions, categories, dates, percentages, or account names.",
    "If a number or data point is missing, say that the data is not available instead of estimating.",
    "If Smart Finance Search results are provided, answer directly from those results first, then add context if helpful.",
    "For search questions such as when/where/how much, cite the matched transaction dates, notes, categories, wallets, and amounts from Smart Finance Search.",
    "If Smart Finance Search has no matches, say that no matching record was found in the available data and suggest a clearer keyword/date/category.",
    "If the user asks a simple question, answer briefly. If they ask for analysis, give deeper reasoning.",
    "Do not provide legal, tax, medical, or investment guarantees.",
    "Return plain Markdown text only. Do not return JSON. Do not wrap the answer in code fences.",
    input.settings.noFabrication
      ? "Strict no-fabrication mode is ON. Do not infer numeric facts beyond the supplied data."
      : "No-fabrication mode is OFF, but you must still avoid inventing specific financial data.",
  ].join("\n");
}

export function buildAIFinanceOpenAIUserPrompt(input: AIFinanceOpenAIInput) {
  const contextPayload = input.settings.sendFinanceContext
    ? compactContext(input.context)
    : null;
  const insightsPayload = input.settings.sendRuleInsights
    ? compactInsights(input.insights)
    : [];
  const conversationPayload = compactConversation(input);
  const searchPayload = compactSmartFinanceSearch(input.searchResults ?? null);

  return [
    `Câu hỏi của người dùng: ${input.question}`,
    `Intent đã phát hiện: ${input.intent}`,
    "",
    "Dữ liệu tài chính được phép dùng:",
    "```json",
    JSON.stringify(
      {
        financeContext: contextPayload,
        ruleInsights: insightsPayload,
        smartFinanceSearch: searchPayload,
        recentConversation: conversationPayload,
      },
      null,
      2,
    ),
    "```",
    "",
    "Yêu cầu trả lời:",
    "- Trả lời đúng trọng tâm câu hỏi, như một trợ lý ChatGPT đang tư vấn trực tiếp.",
    "- Nếu smartFinanceSearch có dữ liệu, dùng nó làm bằng chứng chính cho câu hỏi dạng tìm kiếm giao dịch/ngân sách/ví/mục tiêu.",
    "- Nếu recentConversation có dữ liệu, hãy dùng để giữ mạch hội thoại, nhưng ưu tiên câu hỏi mới nhất.",
    "- Mở đầu bằng 1-2 câu nhận định ngắn, không mở đầu bằng danh sách dài.",
    "- Chỉ dùng số liệu có trong dữ liệu trên.",
    "- Với điểm sức khỏe tài chính, luôn dùng financeContext.snapshot.health. Không tự tính lại từ thu nhập/chi tiêu/ngân sách.",
    "- Với câu hỏi tìm kiếm, trả lời thẳng kết quả: tìm thấy gì, ngày nào, ví/danh mục nào, số tiền bao nhiêu, tổng cộng bao nhiêu.",
    "- Nếu có cảnh báo/rule insight liên quan, hãy nhắc rõ nhưng không lặp máy móc.",
    "- Không dùng template cố định nếu không cần.",
    "- Không trả JSON.",
    "- Hạn chế bullet thô dạng `- **Tên:** giá trị`. Nếu cần liệt kê, nhóm thành các ý đọc tự nhiên.",
  ].join("\n");
}
