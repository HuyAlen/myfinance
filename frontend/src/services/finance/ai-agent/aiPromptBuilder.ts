import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";
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
      topCategories: context.spending.topCategories.slice(0, 8),
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

export function buildAIFinanceOpenAISystemPrompt(input: AIFinanceOpenAIInput) {
  return [
    "You are MyFinance AI, a personal finance copilot.",
    "Answer in Vietnamese, concise and practical.",
    "Use the exact numbers and labels from the provided Finance Context and Rule Insights only.",
    "Never fabricate balances, income, expenses, budgets, goals, transactions, categories, dates, or percentages.",
    "If data is missing, clearly say the data is not available instead of estimating.",
    "Do not provide legal, tax, or investment guarantees.",
    "Return only valid JSON matching the requested schema.",
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

  return JSON.stringify(
    {
      task: "Answer the user's finance question using the provided data.",
      outputLanguage: "vi-VN",
      requiredTone: "professional, direct, helpful, not verbose",
      requiredFormat: {
        overview: "1-3 bullet strings",
        analysis: "2-5 bullet strings",
        suggestions: "2-5 action-oriented bullet strings",
        confidence: "number from 0 to 1",
        dataLimitations: "array of missing/limited data notes",
        actions:
          "optional action chips for future AI-7; use [] if no action is appropriate",
      },
      question: input.question,
      detectedIntent: input.intent,
      financeContext: contextPayload,
      ruleInsights: insightsPayload,
      guardrails: [
        "Do not invent any numbers.",
        "Do not claim transactions or budgets exist if not present in Finance Context.",
        "If the question asks for an action that cannot be performed yet, suggest the next step instead.",
        "Keep every suggestion grounded in the supplied context and insights.",
      ],
    },
    null,
    2,
  );
}
