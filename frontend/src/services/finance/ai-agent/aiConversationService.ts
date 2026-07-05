import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/lib/database.types";
import type { AIChatMessage } from "@/src/components/ai-agent/AIChatMessage";

type AIConversationRow =
  Database["public"]["Tables"]["ai_conversations"]["Row"];
type AIMessageRow = Database["public"]["Tables"]["ai_messages"]["Row"];
type AIMessageInsert = Database["public"]["Tables"]["ai_messages"]["Insert"];

export type AIConversation = {
  id: string;
  userId: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type CreateAIConversationInput = {
  userId: string;
  title?: string;
};

export type SaveAIMessageInput = {
  conversationId: string;
  userId: string;
  message: AIChatMessage;
};

function toConversation(row: AIConversationRow): AIConversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function normalizeMessageStatus(
  status: AIMessageRow["status"],
): AIChatMessage["status"] {
  return status ?? "completed";
}

function toChatMessage(row: AIMessageRow): AIChatMessage {
  const metadata = (row.metadata ?? {}) as Partial<AIChatMessage>;

  return {
    // This is the DB UUID. New unsaved UI messages may still use ids like user-1.
    // Persisting never writes those UI ids back into the DB.
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status:
      normalizeMessageStatus(row.status) ?? metadata.status ?? "completed",
    source: row.provider ?? metadata.source,
    confidence: row.confidence ?? metadata.confidence,
    model: row.model ?? metadata.model,
    fallbackUsed: metadata.fallbackUsed,
    fallbackReason: metadata.fallbackReason,
    latencyMs: metadata.latencyMs,
    usage: metadata.usage,
    promptDebug: metadata.promptDebug,
  };
}

function buildMessageMetadata(message: AIChatMessage): Record<string, unknown> {
  return {
    uiMessageId: message.id,
    source: message.source,
    fallbackUsed: message.fallbackUsed,
    fallbackReason: message.fallbackReason,
    latencyMs: message.latencyMs,
    usage: message.usage,
    promptDebug: message.promptDebug,
  };
}

export function buildConversationTitle(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (!normalized) return "Cuộc trò chuyện mới";
  if (normalized.length <= 42) return normalized;
  return `${normalized.slice(0, 42).trim()}...`;
}

export async function listAIConversations(userId?: string | null) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(toConversation);
}

export async function createAIConversation(input: CreateAIConversationInput) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      title: input.title?.trim() || "Cuộc trò chuyện mới",
      is_pinned: false,
      created_at: now,
      updated_at: now,
      last_message_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toConversation(data);
}

export async function renameAIConversation(
  userId: string | undefined | null,
  conversationId: string,
  title: string,
) {
  if (!userId) return null;
  const nextTitle = title.trim() || "Cuộc trò chuyện mới";

  const { data, error } = await supabase
    .from("ai_conversations")
    .update({ title: nextTitle, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return toConversation(data);
}

export async function togglePinAIConversation(
  userId: string | undefined | null,
  conversationId: string,
  isPinned: boolean,
) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("ai_conversations")
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return toConversation(data);
}

export async function deleteAIConversation(
  userId: string | undefined | null,
  conversationId: string,
) {
  if (!userId) return;

  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function loadAIMessages(
  userId: string | undefined | null,
  conversationId: string,
) {
  if (!userId) return [];

  // Ownership is enforced by RLS through ai_conversations.
  // ai_messages does not have a user_id column.
  const { data, error } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toChatMessage);
}

export async function saveAIMessage(input: SaveAIMessageInput) {
  if (!input.userId || !input.conversationId) return;

  const now = new Date().toISOString();
  const message = input.message;

  // Important: do not persist the UI message id.
  // UI ids look like user-1 / assistant-2, while DB id is UUID default gen_random_uuid().
  const payload: AIMessageInsert = {
    conversation_id: input.conversationId,
    role: message.role,
    content: message.content,
    provider: message.source ?? null,
    model: message.model ?? null,
    confidence: message.confidence ?? null,
    status: message.status ?? "completed",
    metadata: buildMessageMetadata(message),
    created_at: now,
  };

  const { error } = await supabase.from("ai_messages").insert(payload);
  if (error) throw error;

  const { error: conversationError } = await supabase
    .from("ai_conversations")
    .update({
      updated_at: now,
      last_message_at: now,
    })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  if (conversationError) throw conversationError;
}
