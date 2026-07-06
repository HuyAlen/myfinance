import {
  buildAIFinanceOpenAISystemPrompt,
  buildAIFinanceOpenAIUserPrompt,
} from "./aiPromptBuilder";
import {
  extractResponsesApiText,
  normalizeOpenAIFinanceMarkdownAnswer,
} from "./aiResponseParser";
import type {
  AIFinanceChatApiResponse,
  AIFinanceOpenAIInput,
} from "./aiPromptTypes";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PROMPT_PREVIEW_LIMIT = 1800;

type ResponsesApiUsagePayload = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type ResponsesApiPayload = {
  id?: string;
  usage?: ResponsesApiUsagePayload;
};

function getResponseId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const responseId = (payload as ResponsesApiPayload).id;
  return typeof responseId === "string" ? responseId : undefined;
}

function getResponsesApiUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;

  const usage = (payload as ResponsesApiPayload).usage;
  if (!usage || typeof usage !== "object") return undefined;

  const promptTokens = usage.input_tokens ?? usage.inputTokens;
  const completionTokens = usage.output_tokens ?? usage.outputTokens;
  const totalTokens = usage.total_tokens ?? usage.totalTokens;

  if (
    typeof promptTokens !== "number" &&
    typeof completionTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function truncatePromptPreview(value: string) {
  if (value.length <= PROMPT_PREVIEW_LIMIT) return value;
  return `${value.slice(0, PROMPT_PREVIEW_LIMIT)}\n... truncated ${value.length - PROMPT_PREVIEW_LIMIT} chars`;
}

function estimateNativeConfidence(input: AIFinanceOpenAIInput, answer: string) {
  if (!input.context) return 0.45;
  if (!answer.trim()) return 0.35;

  const hasFinanceData =
    input.context.counts.transactions > 0 ||
    input.context.counts.wallets > 0 ||
    input.context.counts.budgets > 0 ||
    input.context.counts.goals > 0 ||
    input.context.counts.debts > 0 ||
    input.context.counts.investments > 0;

  if (!hasFinanceData) return 0.55;
  if (input.insights.length > 0) return 0.9;
  return 0.82;
}

function buildNativeActions(input: AIFinanceOpenAIInput) {
  const actionByIntent = {
    budget: { type: "open_budgets", label: "Mở ngân sách" },
    spending: { type: "open_transactions", label: "Xem giao dịch" },
    cashflow: { type: "open_transactions", label: "Xem dòng tiền" },
    goal: { type: "open_goals", label: "Mở mục tiêu" },
  } as const;

  if (input.intent in actionByIntent) {
    return [actionByIntent[input.intent as keyof typeof actionByIntent]];
  }

  const firstInsight = input.insights[0];
  if (firstInsight?.actionLabel) {
    return [{ type: "none", label: firstInsight.actionLabel }];
  }

  return [];
}

export async function askOpenAIFinanceAI(
  input: AIFinanceOpenAIInput,
): Promise<AIFinanceChatApiResponse> {
  const apiKey = input.settings.apiKey.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from AI Settings.");
  }

  const systemPrompt = buildAIFinanceOpenAISystemPrompt(input);
  const userPrompt = buildAIFinanceOpenAIUserPrompt(input);

  const body: Record<string, unknown> = {
    model: input.settings.model,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_output_tokens: input.settings.maxTokens,
  };

  if (!input.settings.model.toLowerCase().startsWith("gpt-5")) {
    body.temperature = input.settings.temperature;
  }

  const startedAt = Date.now();

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed (${response.status}). ${errorText.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as unknown;
  const latencyMs = Date.now() - startedAt;
  const rawText = extractResponsesApiText(payload);
  if (!rawText) {
    throw new Error("OpenAI response is empty.");
  }

  const answer = normalizeOpenAIFinanceMarkdownAnswer(rawText);
  const responseId = getResponseId(payload);

  return {
    answer,
    source: "openai",
    confidence: estimateNativeConfidence(input, answer),
    fallbackUsed: false,
    model: input.settings.model,
    generatedAt: new Date().toISOString(),
    actions: buildNativeActions(input),
    latencyMs,
    usage: getResponsesApiUsage(payload),
    responseId,
    promptDebug: {
      provider: "openai",
      model: input.settings.model,
      intent: input.intent,
      temperature: input.settings.model.toLowerCase().startsWith("gpt-5")
        ? undefined
        : input.settings.temperature,
      maxTokens: input.settings.maxTokens,
      contextSent: input.settings.sendFinanceContext,
      ruleInsightsSent: input.settings.sendRuleInsights,
      insightCount: input.insights.length,
      searchResultCount: input.searchResults?.results.length ?? 0,
      noFabrication: input.settings.noFabrication,
      systemPromptPreview: truncatePromptPreview(systemPrompt),
      userPromptPreview: truncatePromptPreview(userPrompt),
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      responseId,
    },
  };
}
