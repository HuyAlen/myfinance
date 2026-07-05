import {
  buildAIFinanceOpenAISystemPrompt,
  buildAIFinanceOpenAIUserPrompt,
} from "./aiPromptBuilder";
import {
  composeOpenAIFinanceAnswer,
  extractResponsesApiText,
  parseAIFinanceOpenAIJson,
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

function buildJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      overview: { type: "array", items: { type: "string" } },
      analysis: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      dataLimitations: { type: "array", items: { type: "string" } },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            label: { type: "string" },
          },
          required: ["type", "label"],
        },
      },
    },
    required: [
      "overview",
      "analysis",
      "suggestions",
      "confidence",
      "dataLimitations",
      "actions",
    ],
  };
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
    text: {
      format: {
        type: "json_schema",
        name: "myfinance_ai_chat_response",
        strict: true,
        schema: buildJsonSchema(),
      },
    },
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

  const parsed = parseAIFinanceOpenAIJson(rawText);

  const responseId = getResponseId(payload);

  return {
    answer: composeOpenAIFinanceAnswer(parsed),
    source: "openai",
    confidence: parsed.confidence,
    fallbackUsed: false,
    model: input.settings.model,
    generatedAt: new Date().toISOString(),
    actions: parsed.actions,
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
      noFabrication: input.settings.noFabrication,
      systemPromptPreview: truncatePromptPreview(systemPrompt),
      userPromptPreview: truncatePromptPreview(userPrompt),
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      responseId,
    },
  };
}
