import type { AIFinanceRuleInsight } from "./aiFinanceRules";
import type { AIFinanceChatIntent } from "./aiChatTypes";

const SEVERITY_WEIGHT: Record<AIFinanceRuleInsight["severity"], number> = {
  danger: 400,
  warning: 300,
  info: 200,
  success: 100,
};

const INTENT_TERMS: Record<AIFinanceChatIntent, string[]> = {
  overview: [],
  unknown: [],
  budget: ["budget", "ngân sách", "ngan sach", "hạn mức", "han muc", "limit"],
  cashflow: [
    "cashflow",
    "cash flow",
    "dòng tiền",
    "dong tien",
    "tiết kiệm",
    "tiet kiem",
    "thu nhập",
    "thu nhap",
  ],
  spending: [
    "chi tiêu",
    "chi tieu",
    "giao dịch",
    "giao dich",
    "spending",
    "expense",
    "danh mục",
    "danh muc",
  ],
  goal: ["goal", "mục tiêu", "muc tieu", "tiến độ", "tien do"],
  wallet: [
    "wallet",
    "ví",
    "vi",
    "số dư",
    "so du",
    "balance",
    "thanh khoản",
    "thanh khoan",
  ],
  debt: ["debt", "nợ", "no", "vay", "loan"],
  investment: ["investment", "đầu tư", "dau tu", "portfolio"],
  health: ["health", "sức khỏe", "suc khoe", "điểm", "diem", "score"],
  alert: [
    "cảnh báo",
    "canh bao",
    "danger",
    "warning",
    "rủi ro",
    "rui ro",
    "vượt",
    "vuot",
    "âm",
    "am",
  ],
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function getIntentScore(
  insight: AIFinanceRuleInsight,
  intent: AIFinanceChatIntent,
) {
  if (intent === "overview" || intent === "unknown") return 0;

  const text = normalize(
    `${insight.id} ${insight.title} ${insight.description} ${insight.actionLabel ?? ""}`,
  );
  const terms = INTENT_TERMS[intent] ?? [];

  return terms.reduce((score, term) => {
    return score + (text.includes(normalize(term)) ? 40 : 0);
  }, 0);
}

function getScoreImpactWeight(insight: AIFinanceRuleInsight) {
  const scoreImpact = insight.scoreImpact ?? 0;
  if (scoreImpact < 0) return Math.abs(scoreImpact) * 2;
  return scoreImpact;
}

export function rankAIFinanceInsights(input: {
  insights: AIFinanceRuleInsight[];
  intent: AIFinanceChatIntent;
}): AIFinanceRuleInsight[] {
  return [...input.insights].sort((a, b) => {
    const scoreA =
      SEVERITY_WEIGHT[a.severity] +
      getIntentScore(a, input.intent) +
      getScoreImpactWeight(a);
    const scoreB =
      SEVERITY_WEIGHT[b.severity] +
      getIntentScore(b, input.intent) +
      getScoreImpactWeight(b);
    return scoreB - scoreA;
  });
}

export function selectAIFinanceInsights(input: {
  insights: AIFinanceRuleInsight[];
  intent: AIFinanceChatIntent;
  limit?: number;
}): AIFinanceRuleInsight[] {
  const limit = input.limit ?? 4;
  const ranked = rankAIFinanceInsights(input);

  if (
    input.intent === "overview" ||
    input.intent === "unknown" ||
    input.intent === "alert"
  ) {
    return ranked.slice(0, limit);
  }

  const matched = ranked.filter(
    (insight) => getIntentScore(insight, input.intent) > 0,
  );
  return (matched.length > 0 ? matched : ranked).slice(0, limit);
}
