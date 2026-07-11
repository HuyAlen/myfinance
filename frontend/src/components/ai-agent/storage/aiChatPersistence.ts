export const AI_CHAT_STORAGE_VERSION = 1;

const STORAGE_PREFIX = "myfinance-ai-chat";

export type PersistedAIChatState<TMessage> = {
  version: typeof AI_CHAT_STORAGE_VERSION;
  conversationId: string | null;
  lastQuestion: string;
  messages: TMessage[];
  savedAt: string;
};

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}:v${AI_CHAT_STORAGE_VERSION}:${userId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistedAIChat<TMessage>(
  userId: string,
): PersistedAIChatState<TMessage> | null {
  const storage = getStorage();
  if (!storage || !userId) return null;

  try {
    const raw = storage.getItem(getStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedAIChatState<TMessage>>;

    if (
      parsed.version !== AI_CHAT_STORAGE_VERSION ||
      !Array.isArray(parsed.messages)
    ) {
      storage.removeItem(getStorageKey(userId));
      return null;
    }

    return {
      version: AI_CHAT_STORAGE_VERSION,
      conversationId:
        typeof parsed.conversationId === "string"
          ? parsed.conversationId
          : null,
      lastQuestion:
        typeof parsed.lastQuestion === "string" ? parsed.lastQuestion : "",
      messages: parsed.messages,
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date(0).toISOString(),
    };
  } catch {
    storage.removeItem(getStorageKey(userId));
    return null;
  }
}

export function writePersistedAIChat<TMessage>(
  userId: string,
  state: Omit<PersistedAIChatState<TMessage>, "version" | "savedAt">,
) {
  const storage = getStorage();
  if (!storage || !userId) return;

  try {
    const payload: PersistedAIChatState<TMessage> = {
      version: AI_CHAT_STORAGE_VERSION,
      conversationId: state.conversationId,
      lastQuestion: state.lastQuestion,
      messages: state.messages,
      savedAt: new Date().toISOString(),
    };

    storage.setItem(getStorageKey(userId), JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors. Chat continues to work in memory.
  }
}

export function clearPersistedAIChat(userId: string) {
  const storage = getStorage();
  if (!storage || !userId) return;

  try {
    storage.removeItem(getStorageKey(userId));
  } catch {
    // Ignore storage errors.
  }
}
