import type { AIFinanceToolContext } from "../tools/aiToolTypes";

type AuditQuery = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}> & {
  insert: (value: Record<string, unknown>) => AuditQuery;
};

type AuditClient = {
  from: (table: string) => AuditQuery;
};

export async function recordAIActionAudit(input: {
  context: AIFinanceToolContext;
  pendingActionId: string;
  conversationId?: string | null;
  toolName: string;
  status: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  const client = input.context.supabase as unknown as AuditClient;

  const { error } = await client.from("ai_action_audit_logs").insert({
    user_id: input.context.userId,
    pending_action_id: input.pendingActionId,
    conversation_id: input.conversationId ?? null,
    tool_name: input.toolName,
    status: input.status,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    result: input.result ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    throw new Error(`ai_action_audit_logs: ${error.message}`);
  }
}
