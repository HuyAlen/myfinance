export type AIConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

export type AIConversationMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source?: "openai" | "local" | "fallback";
  model?: string;
  latencyMs?: number;
  pendingActions?: Array<{
    id: string;
    toolName: string;
    preview: Record<string, unknown>;
    status: string;
    expiresAt: string;
  }>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function arrayFromPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of keys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) return candidate;
  }

  if (isRecord(payload.data)) {
    for (const key of keys) {
      const candidate = payload.data[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return [];
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    try {
      const payload = JSON.parse(text) as { error?: string; message?: string };
      throw new Error(
        payload.error ||
          payload.message ||
          `Request failed (${response.status}).`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.startsWith("Unexpected token")
      ) {
        throw error;
      }
      throw new Error(text || `Request failed (${response.status}).`);
    }
  }

  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function normalizeConversation(value: unknown): AIConversationSummary | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id, value.conversationId, value.conversation_id);
  if (!id) return null;

  const createdAt = stringValue(
    value.createdAt,
    value.created_at,
    value.insertedAt,
    value.inserted_at,
  );
  const updatedAt = stringValue(
    value.updatedAt,
    value.updated_at,
    value.lastMessageAt,
    value.last_message_at,
    createdAt,
  );
  const title = stringValue(
    value.title,
    value.name,
    value.subject,
    value.lastQuestion,
    value.last_question,
    "Cuộc trò chuyện mới",
  );

  return {
    id,
    title,
    createdAt,
    updatedAt,
    messageCount: numberValue(
      value.messageCount,
      value.message_count,
      value.messagesCount,
    ),
  };
}

function normalizePendingActions(
  value: unknown,
): AIConversationMessageRecord["pendingActions"] {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = stringValue(
      candidate.id,
      candidate.actionId,
      candidate.action_id,
    );
    if (!id) return [];

    return [
      {
        id,
        toolName: stringValue(
          candidate.toolName,
          candidate.tool_name,
          "unknown_tool",
        ),
        preview: isRecord(candidate.preview) ? candidate.preview : {},
        status: stringValue(candidate.status, "pending"),
        expiresAt: stringValue(
          candidate.expiresAt,
          candidate.expires_at,
          new Date(0).toISOString(),
        ),
      },
    ];
  });
}

function normalizeMessage(value: unknown): AIConversationMessageRecord | null {
  if (!isRecord(value)) return null;

  const rawRole = stringValue(
    value.role,
    value.messageRole,
    value.message_role,
  ).toLowerCase();
  const role =
    rawRole === "assistant" ? "assistant" : rawRole === "user" ? "user" : null;
  if (!role) return null;

  const content = stringValue(
    value.content,
    value.message,
    value.text,
    value.answer,
    value.question,
  );
  const id =
    stringValue(value.id, value.messageId, value.message_id) ||
    `${role}-${Date.now()}-${Math.random()}`;
  const createdAt = stringValue(
    value.createdAt,
    value.created_at,
    value.insertedAt,
    value.inserted_at,
  );
  const rawSource = stringValue(value.source).toLowerCase();
  const source =
    rawSource === "openai" || rawSource === "local" || rawSource === "fallback"
      ? rawSource
      : undefined;

  return {
    id,
    role,
    content,
    createdAt,
    source,
    model: stringValue(value.model) || undefined,
    latencyMs: numberValue(value.latencyMs, value.latency_ms),
    pendingActions: normalizePendingActions(
      value.pendingActions ?? value.pending_actions,
    ),
  };
}

export async function listAIConversations(accessToken: string) {
  const response = await fetch("/api/ai-finance/conversations", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await readJson(response);
  return arrayFromPayload(payload, ["conversations", "items", "results"])
    .map(normalizeConversation)
    .filter((item): item is AIConversationSummary => item !== null)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
}

export async function getAIConversationMessages(
  accessToken: string,
  conversationId: string,
) {
  const response = await fetch(
    `/api/ai-finance/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = await readJson(response);
  return arrayFromPayload(payload, ["messages", "items", "results"])
    .map(normalizeMessage)
    .filter((item): item is AIConversationMessageRecord => item !== null);
}
