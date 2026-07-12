import { NextResponse } from "next/server";

import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import {
  getAISettings,
  resolveStoredAIKey,
} from "@/src/services/finance/ai-agent/server/aiSettingsRepository";
import { buildServerFinanceContext } from "@/src/services/finance/ai-agent/server/aiFinanceContext.server";
import {
  buildLocalFinanceAnswer,
  type ConversationMessage,
} from "@/src/services/finance/ai-agent/server/aiProviderRuntime.server";
import {
  buildConversationTitle,
  createAIConversation,
  saveAIMessage,
} from "@/src/services/finance/ai-agent/server/aiConversationRepository";
import { recordAIUsage } from "@/src/services/finance/ai-agent/server/aiUsageRepository";
import { runAIFinanceDynamicPlanner } from "@/src/services/finance/ai-agent/planner/aiDynamicPlanner.server";
import { toAIFinancePlannerResponse } from "@/src/services/finance/ai-agent/planner/aiPlannerResponse.server";
import { buildAIFinanceRelevantContext } from "@/src/services/finance/ai-agent/context/aiRelevantContext.server";
import { buildContextAwarePlannerQuestion } from "@/src/services/finance/ai-agent/context/aiContextPrompt.server";

export const runtime = "nodejs";

type StreamRequestPayload = {
  question?: unknown;
  conversationId?: unknown;
  conversation?: unknown;
  debug?: unknown;
};

function encodeSse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is ConversationMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as ConversationMessage).role === "user" ||
          (item as ConversationMessage).role === "assistant") &&
        typeof (item as ConversationMessage).content === "string",
    )
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 3000),
    }));
}

function buildAgentQuestion(
  question: string,
  conversation: ConversationMessage[],
) {
  if (conversation.length === 0) return question;

  const history = conversation
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join("\n");

  return [
    "RECENT_CONVERSATION:",
    history,
    "",
    "CURRENT_USER_QUESTION:",
    question,
  ].join("\n");
}

function splitAnswer(answer: string) {
  return answer.match(/.{1,12}(?:\s|$)|\n/g) ?? [answer];
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureConversation(input: {
  supabase: Awaited<ReturnType<typeof requireAIUser>>["supabase"];
  userId: string;
  conversationId?: string;
  question: string;
}) {
  if (input.conversationId) {
    return input.conversationId;
  }

  const created = await createAIConversation(
    input.supabase,
    input.userId,
    buildConversationTitle(input.question),
  );

  return created.id;
}

function streamCompletedResult(result: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const answer = typeof result.answer === "string" ? result.answer : "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (result.plannerDebug) {
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "planner_meta",
              debug: result.plannerDebug,
            }),
          ),
        );
      }

      for (const chunk of splitAnswer(answer)) {
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "delta",
              content: chunk,
            }),
          ),
        );

        await sleep(32);
      }

      controller.enqueue(
        encoder.encode(
          encodeSse({
            type: "meta",
            response: result,
          }),
        ),
      );

      controller.close();
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
  const startedAt = Date.now();

  try {
    const { supabase, user } = await requireAIUser(request);
    const payload = (await request.json()) as StreamRequestPayload;
    const debugEnabled =
      process.env.NODE_ENV === "development" || payload.debug === true;

    const question =
      typeof payload.question === "string" ? payload.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    if (question.length > 6000) {
      return NextResponse.json(
        { error: "Question is too long." },
        { status: 400 },
      );
    }

    const conversationId =
      typeof payload.conversationId === "string" &&
      payload.conversationId.trim()
        ? payload.conversationId.trim()
        : undefined;

    const conversation = normalizeConversation(payload.conversation);

    const { settings } = await getAISettings(supabase, user.id);

    const activeConversationId = await ensureConversation({
      supabase,
      userId: user.id,
      conversationId,
      question,
    });

    await saveAIMessage({
      supabase,
      userId: user.id,
      conversationId: activeConversationId,
      role: "user",
      content: question,
      status: "completed",
    });

    if (settings.provider === "local") {
      const context = await buildServerFinanceContext(supabase, user.id);
      const result = buildLocalFinanceAnswer(question, context);

      await saveAIMessage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        role: "assistant",
        content: result.answer,
        provider: "local",
        model: result.model,
        status: "completed",
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "local",
        model: result.model,
        requestType: "dynamic_planner_stream",
        latencyMs: Date.now() - startedAt,
        status: "completed",
      });

      return streamCompletedResult({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        pendingActions: [],
        plannerDebug: debugEnabled
          ? {
              enabled: true,
              plannerStatus: "fallback",
              model: result.model,
              plannerAttempt: 0,
              selectedTools: [],
              timing: { totalMs: Date.now() - startedAt },
              validationErrors: [],
              retryErrors: [],
              fallbackReason: "Local provider is active.",
            }
          : undefined,
      });
    }

    const apiKey = await resolveStoredAIKey(supabase, user.id);

    if (!apiKey) {
      const context = await buildServerFinanceContext(supabase, user.id);
      const result = buildLocalFinanceAnswer(
        question,
        context,
        "Chưa cấu hình OpenAI API Key; đã dùng Local AI.",
      );

      await saveAIMessage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        role: "assistant",
        content: result.answer,
        provider: "fallback",
        model: result.model,
        status: "completed",
        metadata: {
          fallbackReason: result.fallbackReason,
        },
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "fallback",
        model: result.model,
        requestType: "dynamic_planner_stream",
        latencyMs: Date.now() - startedAt,
        status: "completed",
        errorCode: "AI_API_KEY_MISSING",
      });

      return streamCompletedResult({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        pendingActions: [],
        plannerDebug: debugEnabled
          ? {
              enabled: true,
              plannerStatus: "fallback",
              model: result.model,
              plannerAttempt: 0,
              selectedTools: [],
              timing: { totalMs: Date.now() - startedAt },
              validationErrors: [],
              retryErrors: [],
              fallbackReason: "OpenAI API key is not configured.",
            }
          : undefined,
      });
    }

    try {
      const relevantContext = await buildAIFinanceRelevantContext({
        context: {
          userId: user.id,
          supabase,
        },
        question: buildAgentQuestion(question, conversation),
      });

      const planningContext = buildContextAwarePlannerQuestion({
        question: buildAgentQuestion(question, conversation),
        context: relevantContext,
      });

      const plannerResult = await runAIFinanceDynamicPlanner({
        apiKey,
        model: settings.model,
        question: buildAgentQuestion(question, conversation),
        planningContext,
        context: {
          userId: user.id,
          supabase,
        },
        conversationId: activeConversationId,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTokens,
        debug: debugEnabled,
        debugIntent: [
          relevantContext.intent.action,
          relevantContext.capabilityResolution.primary,
          ...relevantContext.dataRequirement.capabilities,
        ].join(":"),
        reasoningCapabilities: relevantContext.dataRequirement.capabilities,
        reasoningOperations: relevantContext.dataRequirement.operations,
      });

      const plannerResponse = toAIFinancePlannerResponse(plannerResult);

      const plannerInputTokens = plannerResult.plannerUsage?.inputTokens ?? 0;
      const plannerOutputTokens = plannerResult.plannerUsage?.outputTokens ?? 0;
      const synthesisInputTokens =
        plannerResult.synthesisUsage?.inputTokens ?? 0;
      const synthesisOutputTokens =
        plannerResult.synthesisUsage?.outputTokens ?? 0;

      const inputTokens = plannerInputTokens + synthesisInputTokens;
      const outputTokens = plannerOutputTokens + synthesisOutputTokens;
      const totalTokens = inputTokens + outputTokens;

      const result = {
        answer: plannerResponse.answer,
        source: "openai" as const,
        model: settings.model,
        fallbackUsed: false,
        generatedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens,
        },
        conversationId: activeConversationId,
        agentMode: plannerResponse.agentMode,
        plan: plannerResponse.plan,
        planResults: plannerResponse.planResults,
        pendingActions: plannerResponse.pendingActions,
        reasoning: plannerResponse.reasoning,
        plannerDebug: plannerResponse.plannerDebug,
        context: {
          intent: relevantContext.intent,
          capabilityResolution: relevantContext.capabilityResolution,
          dataRequirement: relevantContext.dataRequirement,
          diagnostics: relevantContext.diagnostics,
        },
      };

      await saveAIMessage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        role: "assistant",
        content: result.answer,
        provider: "openai",
        model: settings.model,
        status: "completed",
        metadata: {
          agentMode: result.agentMode,
          plan: result.plan,
          planResults: result.planResults,
          pendingActions: result.pendingActions,
          reasoning: result.reasoning,
          contextDiagnostics: relevantContext.diagnostics,
          capabilityResolution: relevantContext.capabilityResolution,
          dataRequirement: relevantContext.dataRequirement,
          usage: result.usage,
          ...(result.plannerDebug ? { plannerDebug: result.plannerDebug } : {}),
        },
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "openai",
        model: settings.model,
        requestType: "dynamic_planner_stream",
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs: result.latencyMs,
        status: "completed",
      });

      return streamCompletedResult(result);
    } catch (error) {
      if (!settings.fallbackLocal) {
        await recordAIUsage({
          supabase,
          userId: user.id,
          conversationId: activeConversationId,
          provider: "openai",
          model: settings.model,
          requestType: "dynamic_planner_stream",
          latencyMs: Date.now() - startedAt,
          status: "error",
          errorCode: "AI_AGENT_FAILED",
        });

        throw error;
      }

      const reason =
        error instanceof Error
          ? error.message
          : "OpenAI Agent không phản hồi; đã dùng Local AI.";

      const context = await buildServerFinanceContext(supabase, user.id);
      const result = buildLocalFinanceAnswer(question, context, reason);

      await saveAIMessage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        role: "assistant",
        content: result.answer,
        provider: "fallback",
        model: result.model,
        status: "completed",
        metadata: {
          fallbackReason: reason,
        },
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "fallback",
        model: result.model,
        requestType: "dynamic_planner_stream",
        latencyMs: Date.now() - startedAt,
        status: "completed",
        errorCode: "AI_AGENT_FALLBACK",
      });

      return streamCompletedResult({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        pendingActions: [],
        plannerDebug: debugEnabled
          ? {
              enabled: true,
              plannerStatus: "fallback",
              model: result.model,
              plannerAttempt:
                typeof (
                  error as { plannerDebugFailure?: { plannerAttempt?: number } }
                ).plannerDebugFailure?.plannerAttempt === "number"
                  ? (
                      error as {
                        plannerDebugFailure: { plannerAttempt: number };
                      }
                    ).plannerDebugFailure.plannerAttempt
                  : 0,
              selectedTools: [],
              timing: {
                totalMs: Date.now() - startedAt,
                planningMs: (
                  error as { plannerDebugFailure?: { planningMs?: number } }
                ).plannerDebugFailure?.planningMs,
              },
              validationErrors:
                (
                  error as {
                    plannerDebugFailure?: { validationErrors?: string[] };
                  }
                ).plannerDebugFailure?.validationErrors ?? [],
              retryErrors:
                (error as { plannerDebugFailure?: { retryErrors?: string[] } })
                  .plannerDebugFailure?.retryErrors ?? [],
              fallbackReason: reason.slice(0, 300),
            }
          : undefined,
      });
    }
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý AI Finance stream.",
      },
      { status },
    );
  }
}
