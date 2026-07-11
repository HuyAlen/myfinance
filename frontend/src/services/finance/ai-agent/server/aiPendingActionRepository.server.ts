import { createHash } from "node:crypto";

import type { AIFinanceToolContext } from "../tools/aiToolTypes";

export type PendingActionStatus =
  | "pending"
  | "confirmed"
  | "executing"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed";

export type PendingActionRecord = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  tool_name: string;
  arguments: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: PendingActionStatus;
  result: Record<string, unknown> | null;
  error_message: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  idempotency_key: string | null;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PendingActionQuery = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}> & {
  select: (columns: string) => PendingActionQuery;
  insert: (value: Record<string, unknown>) => PendingActionQuery;
  update: (value: Record<string, unknown>) => PendingActionQuery;
  eq: (column: string, value: unknown) => PendingActionQuery;
  single: () => PendingActionQuery;
  maybeSingle: () => PendingActionQuery;
};

type PendingActionClient = {
  from: (table: string) => PendingActionQuery;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as PendingActionClient;
}

function expiresAt(minutes = 20) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function buildIdempotencyKey(input: {
  userId: string;
  conversationId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  const source = JSON.stringify({
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    toolName: input.toolName,
    arguments: input.arguments,
  });

  return createHash("sha256").update(source).digest("hex");
}

export async function createPendingAction(input: {
  context: AIFinanceToolContext;
  conversationId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  preview: Record<string, unknown>;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}) {
  const client = clientOf(input.context);
  const idempotencyKey = buildIdempotencyKey({
    userId: input.context.userId,
    conversationId: input.conversationId,
    toolName: input.toolName,
    arguments: input.arguments,
  });

  const { data: existing, error: existingError } = await client
    .from("ai_pending_actions")
    .select("*")
    .eq("user_id", input.context.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(`ai_pending_actions: ${existingError.message}`);
  }

  if (existing) {
    return existing as PendingActionRecord;
  }

  const { data, error } = await client
    .from("ai_pending_actions")
    .insert({
      user_id: input.context.userId,
      conversation_id: input.conversationId ?? null,
      tool_name: input.toolName,
      arguments: input.arguments,
      preview: input.preview,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      idempotency_key: idempotencyKey,
      status: "pending",
      expires_at: expiresAt(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`ai_pending_actions: ${error.message}`);
  }

  return data as PendingActionRecord;
}

export async function getPendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
}) {
  const client = clientOf(input.context);

  const { data, error } = await client
    .from("ai_pending_actions")
    .select("*")
    .eq("id", input.actionId)
    .eq("user_id", input.context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`ai_pending_actions: ${error.message}`);
  }

  return (data ?? null) as PendingActionRecord | null;
}

export async function updatePendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
  values: Record<string, unknown>;
}) {
  const client = clientOf(input.context);

  const { data, error } = await client
    .from("ai_pending_actions")
    .update({
      ...input.values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.actionId)
    .eq("user_id", input.context.userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`ai_pending_actions: ${error.message}`);
  }

  return data as PendingActionRecord;
}
