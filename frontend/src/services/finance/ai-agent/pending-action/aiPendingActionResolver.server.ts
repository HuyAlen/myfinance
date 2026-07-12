import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import {
  findLatestActivePendingAction,
  updatePendingAction,
} from "../server/aiPendingActionRepository.server";
import type {
  AIPendingActionContinuationDirective,
  AIPendingActionConversationMessage,
} from "./aiPendingActionContinuationTypes";

const CANCEL_COMMANDS = new Set([
  "cancel",
  "cancel action",
  "huy",
  "huy bo",
  "huy hanh dong",
  "bo qua",
  "thoi khong lam nua",
]);

const CONFIRM_COMMANDS = new Set([
  "confirm",
  "confirmed",
  "xac nhan",
  "dong y",
  "ok xac nhan",
  "thuc hien di",
  "lam di",
]);

function normalizeCommand(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/[.!?;,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function latestMessage(
  conversation: AIPendingActionConversationMessage[],
  role: AIPendingActionConversationMessage["role"],
) {
  return [...conversation].reverse().find((item) => item.role === role);
}

function looksLikeAssistantClarification(content: string) {
  const normalized = normalizeCommand(content);

  return (
    content.includes("?") ||
    normalized.includes("vui long cung cap") ||
    normalized.includes("vui long cho biet") ||
    normalized.includes("can them thong tin") ||
    normalized.includes("kiem tra lai thong tin") ||
    normalized.includes("thong tin chi tiet") ||
    normalized.includes("de toi ho tro ban thuc hien") ||
    normalized.includes("ban muon")
  );
}

function looksLikeCompactFollowUp(question: string) {
  const normalized = normalizeCommand(question);

  if (!normalized || question.length > 500) return false;

  const newRequestPrefixes = [
    "tong quan",
    "phan tich",
    "tim giao dich",
    "cho toi xem",
    "vi nao",
    "ngan sach nao",
    "muc tieu nao",
    "suc khoe tai chinh",
  ];

  return !newRequestPrefixes.some((prefix) => normalized.startsWith(prefix));
}

export async function resolveAIPendingActionContinuation(input: {
  context: AIFinanceToolContext;
  conversationId?: string;
  question: string;
  conversation: AIPendingActionConversationMessage[];
}): Promise<AIPendingActionContinuationDirective> {
  const normalizedQuestion = normalizeCommand(input.question);
  const activeAction = input.conversationId
    ? await findLatestActivePendingAction({
        context: input.context,
        conversationId: input.conversationId,
      })
    : null;

  if (activeAction) {
    if (CANCEL_COMMANDS.has(normalizedQuestion)) {
      const cancelled = await updatePendingAction({
        context: input.context,
        actionId: activeAction.id,
        values: { status: "cancelled" },
      });

      return {
        matched: true,
        mode: "cancelled",
        source: "repository",
        reason: "The user explicitly cancelled the active pending action.",
        lockTool: true,
        actionId: cancelled.id,
        toolName: cancelled.tool_name,
        existingArguments: cancelled.arguments,
        activeAction: cancelled,
      };
    }

    if (CONFIRM_COMMANDS.has(normalizedQuestion)) {
      return {
        matched: true,
        mode: "confirm_requested",
        source: "repository",
        reason:
          "The user requested confirmation in chat. Execution remains protected by the existing confirmation endpoint.",
        lockTool: true,
        actionId: activeAction.id,
        toolName: activeAction.tool_name,
        existingArguments: activeAction.arguments,
        activeAction,
      };
    }

    return {
      matched: true,
      mode: "active_action",
      source: "repository",
      reason:
        "The conversation has an active pending action. Treat the message as an edit or continuation of that action.",
      lockTool: true,
      actionId: activeAction.id,
      toolName: activeAction.tool_name,
      existingArguments: activeAction.arguments,
      activeAction,
    };
  }

  const previousAssistant = latestMessage(input.conversation, "assistant");
  const previousUser = latestMessage(input.conversation, "user");

  if (
    previousAssistant &&
    previousUser &&
    looksLikeAssistantClarification(previousAssistant.content) &&
    looksLikeCompactFollowUp(input.question)
  ) {
    return {
      matched: true,
      mode: "conversation_follow_up",
      source: "conversation",
      reason:
        "The previous assistant response requested missing information and the current message is a compact follow-up.",
      lockTool: false,
    };
  }

  return {
    matched: false,
    mode: "none",
    source: "none",
    reason:
      "No active or conversational pending-action continuation was found.",
    lockTool: false,
  };
}
