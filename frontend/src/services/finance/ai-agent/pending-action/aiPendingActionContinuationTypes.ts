import type { PendingActionRecord } from "../server/aiPendingActionRepository.server";

export type AIPendingActionContinuationMode =
  | "none"
  | "conversation_follow_up"
  | "active_action"
  | "confirm_requested"
  | "cancelled";

export type AIPendingActionContinuationSource =
  | "none"
  | "conversation"
  | "repository";

export type AIPendingActionContinuationDirective = {
  matched: boolean;
  mode: AIPendingActionContinuationMode;
  source: AIPendingActionContinuationSource;
  reason: string;
  lockTool: boolean;
  actionId?: string;
  toolName?: string;
  existingArguments?: Record<string, unknown>;
  activeAction?: PendingActionRecord;
};

export type AIPendingActionConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
