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
import {
  buildPendingActionContinuationContext,
  pendingActionContinuationAnswer,
  resolveAIPendingActionContinuation,
} from "@/src/services/finance/ai-agent/pending-action";

export const runtime = "nodejs";

type ChatRequestPayload = {
  question?: unknown;
  conversationId?: unknown;
  conversation?: unknown;
};

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "UNAUTHORIZED") return 401;
  if (message === "CONVERSATION_NOT_FOUND") return 404;
  if (message === "SUPABASE_SERVER_CONFIG_MISSING") return 500;

  return 500;
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

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const { supabase, user } = await requireAIUser(request);
    const payload = (await request.json()) as ChatRequestPayload;
    const debugEnabled = process.env.NODE_ENV === "development";

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

    const continuation = await resolveAIPendingActionContinuation({
      context: { userId: user.id, supabase },
      conversationId: activeConversationId,
      question,
      conversation,
    });

    const continuationAnswer = pendingActionContinuationAnswer(continuation);

    if (continuationAnswer && continuation.activeAction) {
      const pendingActions = [
        {
          id: continuation.activeAction.id,
          toolName: continuation.activeAction.tool_name,
          preview: continuation.activeAction.preview,
          status: continuation.activeAction.status,
          expiresAt: continuation.activeAction.expires_at,
        },
      ];

      const deterministicResult = {
        answer: continuationAnswer,
        source: "local" as const,
        model: "pending-action-policy",
        fallbackUsed: false,
        generatedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        conversationId: activeConversationId,
        agentMode: "dynamic_planner" as const,
        plan: null,
        planResults: [],
        pendingActions,
        plannerDebug: debugEnabled
          ? {
              enabled: true as const,
              plannerStatus: "recovered" as const,
              model: "pending-action-policy",
              plannerAttempt: 0,
              selectedTools: [],
              timing: { totalMs: Date.now() - startedAt },
              validationErrors: [],
              retryErrors: [],
              continuation: {
                matched: continuation.matched,
                mode: continuation.mode,
                source: continuation.source,
                actionId: continuation.actionId,
                toolName: continuation.toolName,
                lockTool: continuation.lockTool,
                reason: continuation.reason,
              },
            }
          : undefined,
      };

      await saveAIMessage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        role: "assistant",
        content: continuationAnswer,
        provider: "local",
        model: "pending-action-policy",
        status: "completed",
        metadata: {
          pendingActions,
          continuation: deterministicResult.plannerDebug?.continuation,
        },
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "local",
        model: "pending-action-policy",
        requestType: "pending_action_continuation",
        latencyMs: deterministicResult.latencyMs,
        status: "completed",
      });

      return NextResponse.json(deterministicResult);
    }

    const continuationQuestion = buildPendingActionContinuationContext({
      question: buildAgentQuestion(question, conversation),
      directive: continuation,
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
        requestType: "dynamic_planner_chat",
        latencyMs: Date.now() - startedAt,
        status: "completed",
      });

      return NextResponse.json({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        actionForms: [],
        pendingActions: [],
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
        requestType: "dynamic_planner_chat",
        latencyMs: Date.now() - startedAt,
        status: "completed",
        errorCode: "AI_API_KEY_MISSING",
      });

      return NextResponse.json({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        actionForms: [],
        pendingActions: [],
      });
    }

    try {
      const relevantContext = await buildAIFinanceRelevantContext({
        context: {
          userId: user.id,
          supabase,
        },
        question: continuationQuestion,
      });

      const planningContext = buildContextAwarePlannerQuestion({
        question: continuationQuestion,
        context: relevantContext,
      });

      const plannerResult = await runAIFinanceDynamicPlanner({
        apiKey,
        model: settings.model,
        question: continuationQuestion,
        planningContext,
        context: {
          userId: user.id,
          supabase,
        },
        conversationId: activeConversationId,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTokens,
        continuation,
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
        actionForms: plannerResponse.actionForms,
        pendingActions: plannerResponse.pendingActions,
        context: {
          intent: relevantContext.intent,
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
          actionForms: result.actionForms,
          pendingActions: result.pendingActions,
          contextDiagnostics: relevantContext.diagnostics,
          usage: result.usage,
        },
      });

      await recordAIUsage({
        supabase,
        userId: user.id,
        conversationId: activeConversationId,
        provider: "openai",
        model: settings.model,
        requestType: "dynamic_planner_chat",
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs: result.latencyMs,
        status: "completed",
      });

      return NextResponse.json(result);
    } catch (error) {
      if (!settings.fallbackLocal) {
        await recordAIUsage({
          supabase,
          userId: user.id,
          conversationId: activeConversationId,
          provider: "openai",
          model: settings.model,
          requestType: "dynamic_planner_chat",
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
        requestType: "dynamic_planner_chat",
        latencyMs: Date.now() - startedAt,
        status: "completed",
        errorCode: "AI_AGENT_FALLBACK",
      });

      return NextResponse.json({
        ...result,
        conversationId: activeConversationId,
        agentMode: "local",
        plan: null,
        planResults: [],
        actionForms: [],
        pendingActions: [],
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý AI Finance request.",
      },
      { status: statusForError(error) },
    );
  }
}
