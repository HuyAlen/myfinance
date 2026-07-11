import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";

type DbClient = SupabaseClient<Database>;

export type AIConversationSummary = {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type AIStoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: "local" | "openai" | "fallback" | null;
  model: string | null;
  confidence: number | null;
  status: "pending" | "streaming" | "completed" | "stopped" | "error";
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export function buildConversationTitle(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (!normalized) return "Cuộc trò chuyện mới";
  return normalized.length <= 60 ? normalized : `${normalized.slice(0, 57)}...`;
}

export async function listAIConversations(
  supabase: DbClient,
  userId: string,
  limit = 50,
): Promise<AIConversationSummary[]> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  }));
}

export async function createAIConversation(
  supabase: DbClient,
  userId: string,
  title: string,
): Promise<AIConversationSummary> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      user_id: userId,
      title: title || "Cuộc trò chuyện mới",
      is_pinned: false,
      last_message_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    title: data.title,
    isPinned: data.is_pinned,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastMessageAt: data.last_message_at,
  };
}

export async function assertConversationOwnership(
  supabase: DbClient,
  userId: string,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("CONVERSATION_NOT_FOUND");
}

export async function listAIMessages(
  supabase: DbClient,
  userId: string,
  conversationId: string,
): Promise<AIStoredMessage[]> {
  await assertConversationOwnership(supabase, userId, conversationId);

  const { data, error } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    confidence: row.confidence,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

export async function saveAIMessage(input: {
  supabase: DbClient;
  userId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  provider?: "local" | "openai" | "fallback" | null;
  model?: string | null;
  confidence?: number | null;
  status?: "pending" | "streaming" | "completed" | "stopped" | "error";
  metadata?: Record<string, unknown> | null;
}) {
  await assertConversationOwnership(
    input.supabase,
    input.userId,
    input.conversationId,
  );

  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("ai_messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      provider: input.provider ?? null,
      model: input.model ?? null,
      confidence: input.confidence ?? null,
      status: input.status ?? "completed",
      metadata: input.metadata ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await input.supabase
    .from("ai_conversations")
    .update({
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  return data;
}

export async function updateAIConversation(input: {
  supabase: DbClient;
  userId: string;
  conversationId: string;
  title?: string;
  isPinned?: boolean;
}) {
  const patch: Database["public"]["Tables"]["ai_conversations"]["Update"] = {
    updated_at: new Date().toISOString(),
  };

  if (typeof input.title === "string")
    patch.title = input.title.trim() || "Cuộc trò chuyện mới";
  if (typeof input.isPinned === "boolean") patch.is_pinned = input.isPinned;

  const { data, error } = await input.supabase
    .from("ai_conversations")
    .update(patch)
    .eq("id", input.conversationId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAIConversation(
  supabase: DbClient,
  userId: string,
  conversationId: string,
) {
  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
