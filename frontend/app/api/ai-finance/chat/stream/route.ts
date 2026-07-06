import { NextResponse } from "next/server";

import {
  buildAIFinanceOpenAISystemPrompt,
  buildAIFinanceOpenAIUserPrompt,
} from "@/src/services/finance/ai-agent/aiPromptBuilder";
import { buildAIFinanceRuleInsights } from "@/src/services/finance/ai-agent/aiFinanceRules";
import { buildSmartFinanceSearch } from "@/src/services/finance/ai-agent/aiFinanceSearch";
import { detectAIFinanceChatIntent } from "@/src/services/finance/ai-agent/aiIntentDetector";
import type {
  AIFinanceChatApiRequest,
  AIFinanceChatApiResponse,
  AIFinanceOpenAIInput,
} from "@/src/services/finance/ai-agent/aiPromptTypes";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PROMPT_PREVIEW_LIMIT = 1800;

type StreamRequest = AIFinanceChatApiRequest & {
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

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

type OpenAIStreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  response?: unknown;
  error?: {
    message?: string;
  };
};

function truncatePromptPreview(value: string) {
  if (value.length <= PROMPT_PREVIEW_LIMIT) return value;
  return `${value.slice(0, PROMPT_PREVIEW_LIMIT)}\n... truncated ${value.length - PROMPT_PREVIEW_LIMIT} chars`;
}

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

function normalizeAnswer(value: string) {
  return value
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function encodeSse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function parseOpenAIEvent(raw: string): OpenAIStreamEvent | null {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!dataLine) return null;

  const data = dataLine.slice(5).trim();
  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data) as OpenAIStreamEvent;
  } catch {
    return null;
  }
}

function extractDelta(event: OpenAIStreamEvent) {
  if (event.type === "response.output_text.delta") {
    return event.delta ?? "";
  }

  if (event.type === "response.refusal.delta") {
    return event.delta ?? "";
  }

  if (typeof event.delta === "string") return event.delta;
  if (typeof event.text === "string") return event.text;
  return "";
}

async function streamOpenAIToClient(input: AIFinanceOpenAIInput) {
  const apiKey = input.settings.apiKey.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is missing from AI Settings." },
      { status: 400 },
    );
  }

  const systemPrompt = buildAIFinanceOpenAISystemPrompt(input);
  const userPrompt = buildAIFinanceOpenAIUserPrompt(input);
  const startedAt = Date.now();

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
    stream: true,
  };

  if (!input.settings.model.toLowerCase().startsWith("gpt-5")) {
    body.temperature = input.settings.temperature;
  }

  const openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!openAIResponse.ok || !openAIResponse.body) {
    const errorText = await openAIResponse.text().catch(() => "");
    return NextResponse.json(
      {
        error: `OpenAI request failed (${openAIResponse.status}). ${errorText.slice(0, 500)}`,
      },
      { status: openAIResponse.status || 500 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";
  let completedPayload: unknown = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = openAIResponse.body!.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const rawEvent of events) {
            const event = parseOpenAIEvent(rawEvent);
            if (!event) continue;

            if (event.type === "response.error" || event.type === "error") {
              controller.enqueue(
                encoder.encode(
                  encodeSse({
                    type: "error",
                    message: event.error?.message ?? "OpenAI stream error.",
                  }),
                ),
              );
              continue;
            }

            if (event.type === "response.completed") {
              completedPayload = event.response;
              continue;
            }

            const delta = extractDelta(event);
            if (!delta) continue;

            fullAnswer += delta;
            controller.enqueue(
              encoder.encode(
                encodeSse({
                  type: "delta",
                  content: delta,
                }),
              ),
            );
          }
        }

        const answer = normalizeAnswer(fullAnswer);
        const responseId = getResponseId(completedPayload);
        const finalResponse: AIFinanceChatApiResponse = {
          answer,
          source: "openai",
          confidence: estimateNativeConfidence(input, answer),
          fallbackUsed: false,
          model: input.settings.model,
          generatedAt: new Date().toISOString(),
          actions: buildNativeActions(input),
          latencyMs: Date.now() - startedAt,
          usage: getResponsesApiUsage(completedPayload),
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

        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "meta",
              response: finalResponse,
            }),
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Không thể stream phản hồi AI.",
            }),
          ),
        );
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as StreamRequest;
    const question = payload.question?.trim();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    const settings = payload.settings;
    if (!settings) {
      return NextResponse.json(
        { error: "AI settings are required." },
        { status: 400 },
      );
    }

    const insights = buildAIFinanceRuleInsights(payload.context).slice(
      0,
      payload.maxInsights ?? 4,
    );
    const intent = detectAIFinanceChatIntent(question);
    const searchResults = buildSmartFinanceSearch({
      question,
      context: payload.context,
      limit: 12,
    });

    const input: AIFinanceOpenAIInput = {
      question,
      context: payload.context,
      insights,
      intent,
      settings,
      searchResults: payload.searchResults ?? searchResults,
      conversation: payload.conversation ?? [],
    };

    return streamOpenAIToClient(input);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý yêu cầu AI streaming.",
      },
      { status: 500 },
    );
  }
}
