import type { AIFinanceExecutedToolCall } from "../tools/aiToolTypes";

export type PendingActionMetadata = {
  id: string;
  toolName: string;
  preview: Record<string, unknown>;
  status: string;
  expiresAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function extractPendingActions(
  calls: AIFinanceExecutedToolCall[],
): PendingActionMetadata[] {
  const actions: PendingActionMetadata[] = [];

  for (const call of calls) {
    const data = asRecord(call.result.data);

    if (!data || data.kind !== "confirmation_required") {
      continue;
    }

    const pendingAction = asRecord(data.pendingAction);

    if (
      !pendingAction ||
      typeof pendingAction.id !== "string" ||
      typeof pendingAction.toolName !== "string" ||
      typeof pendingAction.status !== "string" ||
      typeof pendingAction.expiresAt !== "string"
    ) {
      continue;
    }

    actions.push({
      id: pendingAction.id,
      toolName: pendingAction.toolName,
      preview: asRecord(pendingAction.preview) ?? {},
      status: pendingAction.status,
      expiresAt: pendingAction.expiresAt,
    });
  }

  return actions;
}
