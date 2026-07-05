import { NextResponse } from "next/server";

import { buildAIFinanceChatResponse } from "@/src/services/finance/ai-agent/aiFinanceChatEngine";
import { buildAIFinanceRuleInsights } from "@/src/services/finance/ai-agent/aiFinanceRules";
import { detectAIFinanceChatIntent } from "@/src/services/finance/ai-agent/aiIntentDetector";
import { askOpenAIFinanceAI } from "@/src/services/finance/ai-agent/aiOpenAIAdapter";
import { normalizeAIFinanceSettings } from "@/src/services/finance/ai-agent/aiSettings";
import type { AIFinanceChatApiRequest } from "@/src/services/finance/ai-agent/aiPromptTypes";

export const runtime = "nodejs";

function buildLocalResponse(input: AIFinanceChatApiRequest, reason?: string) {
  const local = buildAIFinanceChatResponse({
    question: input.question,
    context: input.context,
    maxInsights: input.maxInsights ?? 4,
  });

  return {
    answer: local.answer,
    source: reason ? "fallback" : "local",
    confidence: local.hasEnoughData ? 0.78 : 0.45,
    fallbackUsed: Boolean(reason),
    fallbackReason: reason,
    generatedAt: new Date().toISOString(),
    actions: [],
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<AIFinanceChatApiRequest>;
    const question = String(payload.question ?? "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    const settings = normalizeAIFinanceSettings(payload.settings);
    const input: AIFinanceChatApiRequest = {
      question,
      context: payload.context ?? null,
      settings,
      maxInsights: payload.maxInsights ?? 4,
    };

    if (settings.provider === "local") {
      return NextResponse.json(buildLocalResponse(input));
    }

    if (!settings.apiKey) {
      return NextResponse.json(
        buildLocalResponse(input, "Chưa cấu hình OpenAI API Key."),
      );
    }

    const insights = settings.sendRuleInsights
      ? buildAIFinanceRuleInsights(input.context)
      : [];
    const intent = detectAIFinanceChatIntent(question);

    try {
      const result = await askOpenAIFinanceAI({
        question,
        context: settings.sendFinanceContext ? input.context : null,
        insights,
        intent,
        settings,
      });

      return NextResponse.json(result);
    } catch (error) {
      if (!settings.fallbackLocal) {
        throw error;
      }

      return NextResponse.json(
        buildLocalResponse(
          input,
          error instanceof Error
            ? error.message
            : "OpenAI không phản hồi, đã dùng Local AI.",
        ),
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý yêu cầu AI Finance.",
      },
      { status: 500 },
    );
  }
}
