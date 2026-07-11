import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";

type DbClient = SupabaseClient<Database>;

export async function recordAIUsage(input: {
  supabase: DbClient;
  userId: string;
  conversationId?: string | null;
  provider: string;
  model?: string | null;
  requestType?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number | null;
  status?: string;
  errorCode?: string | null;
}) {
  const { error } = await input.supabase.from("ai_usage_logs").insert({
    user_id: input.userId,
    conversation_id: input.conversationId ?? null,
    provider: input.provider,
    model: input.model ?? null,
    request_type: input.requestType ?? "chat",
    input_tokens: input.inputTokens ?? 0,
    output_tokens: input.outputTokens ?? 0,
    total_tokens:
      input.totalTokens ?? (input.inputTokens ?? 0) + (input.outputTokens ?? 0),
    latency_ms: input.latencyMs ?? null,
    status: input.status ?? "completed",
    error_code: input.errorCode ?? null,
  } as never);

  if (error) {
    console.error("[AI usage] Failed to write log:", error.message);
  }
}
