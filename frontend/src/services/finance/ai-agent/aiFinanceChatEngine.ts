import { buildAIFinanceRuleInsights } from "./aiFinanceRules";
import {
  detectAIFinanceChatIntent,
  getAIFinanceIntentScores,
} from "./aiIntentDetector";
import { selectAIFinanceInsights } from "./aiInsightSelector";
import {
  buildAIFinanceResponseParts,
  composeAIFinanceAnswer,
} from "./aiResponseBuilder";
import type {
  AIFinanceChatEngine,
  AIFinanceChatResponse,
  BuildAIFinanceChatResponseInput,
} from "./aiChatTypes";

function hasEnoughFinanceData(
  context: BuildAIFinanceChatResponseInput["context"],
) {
  if (!context) return false;
  return (
    context.counts.transactions > 0 ||
    context.counts.wallets > 0 ||
    context.counts.budgets > 0 ||
    context.counts.goals > 0 ||
    context.counts.debts > 0 ||
    context.counts.investments > 0
  );
}

export function buildAIFinanceChatResponse(
  input: BuildAIFinanceChatResponseInput,
): AIFinanceChatResponse {
  const intent = detectAIFinanceChatIntent(input.question);
  const intentScores = getAIFinanceIntentScores(input.question);
  const allInsights = input.context
    ? buildAIFinanceRuleInsights(input.context)
    : [];
  const selectedInsights = selectAIFinanceInsights({
    insights: allInsights,
    intent,
    limit: input.maxInsights ?? 4,
  });
  const parts = buildAIFinanceResponseParts({
    context: input.context,
    intent,
    insights: selectedInsights,
  });

  return {
    answer: composeAIFinanceAnswer(parts),
    intent,
    intentScores,
    selectedInsights,
    generatedAt: new Date().toISOString(),
    hasEnoughData: hasEnoughFinanceData(input.context),
  };
}

export function createAIFinanceChatEngine(): AIFinanceChatEngine {
  return {
    ask: buildAIFinanceChatResponse,
  };
}

export const aiFinanceChatEngine = createAIFinanceChatEngine();
