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

  const body: Record<string, unknown> = {
    model: input.settings.model,
    input: [
      {
        role: "system",
        content: buildAIFinanceOpenAISystemPrompt(input),
      },
      {
        role: "user",
        content: buildAIFinanceOpenAIUserPrompt(input),
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
  const rawText = extractResponsesApiText(payload);
  if (!rawText) {
    throw new Error("OpenAI response is empty.");
  }

  const parsed = parseAIFinanceOpenAIJson(rawText);

  return {
    answer: composeOpenAIFinanceAnswer(parsed),
    source: "openai",
    confidence: parsed.confidence,
    fallbackUsed: false,
    model: input.settings.model,
    generatedAt: new Date().toISOString(),
    actions: parsed.actions,
  };
}
