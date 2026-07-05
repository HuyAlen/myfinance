"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  History,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import AIChatInput from "./AIChatInput";
import AIChatMessageBubble, { type AIChatMessage } from "./AIChatMessage";
import {
  buildAIFinanceContext,
  type AIFinanceContext,
} from "@/src/services/finance/ai-agent/aiFinanceContext";
import { buildAIFinanceRuleInsights } from "@/src/services/finance/ai-agent/aiFinanceRules";
import { buildAIFinanceChatResponse } from "@/src/services/finance/ai-agent/aiFinanceChatEngine";
import { getAIFinanceSettingsFromDb } from "@/src/services/finance/ai-agent/aiSettingsService";
import {
  buildConversationTitle,
  createAIConversation,
  deleteAIConversation,
  listAIConversations,
  loadAIMessages,
  renameAIConversation,
  saveAIMessage,
  togglePinAIConversation,
  type AIConversation,
} from "@/src/services/finance/ai-agent/aiConversationService";
import { useAuth } from "@/src/components/auth/AuthProvider";
import type { AIFinanceChatApiResponse } from "@/src/services/finance/ai-agent/aiPromptTypes";

type AIAgentDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type QuickQuestion = {
  label: string;
  title: string;
  description: string;
  question: string;
};

const quickQuestions: QuickQuestion[] = [
  {
    label: "Tổng quan",
    title: "Tổng quan tháng này",
    description: "Health score, dòng tiền, ngân sách.",
    question: "Tổng quan tài chính tháng này của tôi thế nào?",
  },
  {
    label: "Chi tiêu",
    title: "Tôi tiêu nhiều nhất ở đâu?",
    description: "Nhóm chi lớn và bất thường.",
    question: "Tháng này tôi tiêu nhiều nhất ở đâu?",
  },
  {
    label: "Ngân sách",
    title: "Ngân sách nào sắp vượt?",
    description: "Ưu tiên nhóm cần giảm chi.",
    question: "Ngân sách nào sắp vượt?",
  },
  {
    label: "Dòng tiền",
    title: "Dự báo dòng tiền",
    description: "Ước lượng dư địa chi tiêu.",
    question: "Dự báo dòng tiền tháng này giúp tôi",
  },
  {
    label: "Mục tiêu",
    title: "Mục tiêu đang thế nào?",
    description: "Tiến độ tiết kiệm và mục tiêu chậm.",
    question: "Mục tiêu tài chính của tôi đang thế nào?",
  },
  {
    label: "Cảnh báo",
    title: "Có cảnh báo nào không?",
    description: "Vấn đề ưu tiên theo Rule Insights.",
    question: "Tôi có cảnh báo tài chính nào cần xử lý không?",
  },
];

function getTimeLabel() {
  return new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createWelcomeMessage(id: string): AIChatMessage {
  return {
    id,
    role: "assistant",
    status: "completed",
    content:
      "Xin chào, tôi là AI tài chính của bạn.\n\n📊 Tổng quan\nTôi sẽ đọc Finance Context thật và Rule Insights hiện tại.\n\n🔍 Phân tích\nBạn có thể hỏi về ngân sách, dòng tiền, chi tiêu, ví tiền hoặc mục tiêu.\n\n💡 Gợi ý\nChọn một gợi ý bên dưới để bắt đầu nhanh.",
    createdAt: getTimeLabel(),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function splitStreamingChunks(answer: string) {
  const normalized = answer.replace(/\r\n/g, "\n");
  const chunks = normalized.match(/.{1,18}(?:\s|$)|\n/g) ?? [normalized];
  return chunks.filter(Boolean);
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export default function AIAgentDrawer({ open, onClose }: AIAgentDrawerProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(0);
  const contextRequestRef = useRef(0);
  const conversationsRequestRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const streamedContentRef = useRef("");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage.getItem("myfinance-ai-panel-expanded") === "true"
    );
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [financeContext, setFinanceContext] = useState<AIFinanceContext | null>(
    null,
  );
  const [messages, setMessages] = useState<AIChatMessage[]>(() => [
    createWelcomeMessage("welcome"),
  ]);

  function nextMessageId(prefix: string) {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  }

  const hasUserMessage = useMemo(
    () => messages.some((message) => message.role === "user"),
    [messages],
  );

  const activeConversation = useMemo(
    () =>
      conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const ruleInsights = useMemo(
    () => buildAIFinanceRuleInsights(financeContext),
    [financeContext],
  );

  const urgentInsightCount = useMemo(
    () =>
      ruleInsights.filter(
        (insight) =>
          insight.severity === "danger" || insight.severity === "warning",
      ).length,
    [ruleInsights],
  );

  const contextStatusLabel = useMemo(() => {
    if (contextLoading) return "Đang cập nhật";
    if (contextError) return "Lỗi dữ liệu";
    if (financeContext)
      return `${financeContext.counts.transactions} giao dịch • ${ruleInsights.length} insight`;
    return "Đang chờ dữ liệu";
  }, [contextError, contextLoading, financeContext, ruleInsights.length]);

  const refreshConversations = useCallback(() => {
    const requestId = conversationsRequestRef.current + 1;
    conversationsRequestRef.current = requestId;

    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    listAIConversations(userId)
      .then((items) => {
        if (conversationsRequestRef.current !== requestId) return;
        setConversations(items);
      })
      .catch((error: unknown) => {
        if (conversationsRequestRef.current !== requestId) return;
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Không thể tải lịch sử hội thoại.",
        );
      })
      .finally(() => {
        if (conversationsRequestRef.current !== requestId) return;
        setHistoryLoading(false);
      });
  }, [userId]);

  const loadFinanceContext = useCallback(() => {
    const requestId = contextRequestRef.current + 1;
    contextRequestRef.current = requestId;

    setContextLoading(true);
    setContextError(null);

    buildAIFinanceContext()
      .then((context) => {
        if (contextRequestRef.current !== requestId) return;
        setFinanceContext(context);
      })
      .catch((error: unknown) => {
        if (contextRequestRef.current !== requestId) return;
        setFinanceContext(null);
        setContextError(
          error instanceof Error
            ? error.message
            : "Không thể đọc dữ liệu tài chính.",
        );
      })
      .finally(() => {
        if (contextRequestRef.current !== requestId) return;
        setContextLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!open || financeContext || contextLoading) return;

    const timer = window.setTimeout(() => {
      loadFinanceContext();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, financeContext, contextLoading, loadFinanceContext]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      refreshConversations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, refreshConversations]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 45);

    return () => window.clearTimeout(timer);
  }, [open, messages, loading, streaming]);

  useEffect(() => {
    if (open) return;

    const timer = window.setTimeout(() => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      stopRequestedRef.current = false;
      streamedContentRef.current = "";
      activeAssistantMessageIdRef.current = null;
      setLoading(false);
      setStreaming(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    window.localStorage.setItem(
      "myfinance-ai-panel-expanded",
      panelExpanded ? "true" : "false",
    );
  }, [panelExpanded]);

  function handleTogglePanelSize() {
    setPanelExpanded((value) => !value);
    setHistoryOpen(false);
  }

  function handleReloadContext() {
    loadFinanceContext();
  }

  async function ensureConversation(question: string) {
    if (!userId) return null;
    if (activeConversationId) return activeConversationId;

    const created = await createAIConversation({
      userId: userId,
      title: buildConversationTitle(question),
    });

    setActiveConversationId(created.id);
    setConversations((prev) => [created, ...prev]);
    return created.id;
  }

  async function runAIChat(
    question: string,
    signal: AbortSignal,
  ): Promise<AIFinanceChatApiResponse> {
    const localResponse = buildAIFinanceChatResponse({
      question,
      context: financeContext,
      maxInsights: 4,
    });

    try {
      const { settings } = await getAIFinanceSettingsFromDb(userId);

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (settings.provider === "local" || !settings.apiKey) {
        return {
          answer: localResponse.answer,
          source: "local" as const,
          confidence: localResponse.hasEnoughData ? 0.78 : 0.45,
          fallbackUsed: false,
          generatedAt: new Date().toISOString(),
          actions: [],
          model: "Rule Engine",
        } satisfies AIFinanceChatApiResponse;
      }

      const response = await fetch("/api/ai-finance/chat", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          context: financeContext,
          settings,
          maxInsights: 4,
          conversation: messages
            .filter(
              (message) =>
                message.role === "user" || message.role === "assistant",
            )
            .slice(-12)
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API lỗi ${response.status}`);
      }

      return (await response.json()) as AIFinanceChatApiResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      return {
        answer: localResponse.answer,
        source: "fallback" as const,
        confidence: localResponse.hasEnoughData ? 0.72 : 0.42,
        fallbackUsed: true,
        fallbackReason:
          error instanceof Error
            ? error.message
            : "OpenAI không phản hồi, đã dùng Local AI.",
        generatedAt: new Date().toISOString(),
        actions: [],
        model: "Rule Engine",
      } satisfies AIFinanceChatApiResponse;
    }
  }

  function applyResponseMetadata(
    assistantMessageId: string,
    response: AIFinanceChatApiResponse,
  ) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              source: response.source,
              confidence: response.confidence,
              model: response.model,
              fallbackUsed: response.fallbackUsed,
              fallbackReason: response.fallbackReason,
              latencyMs: response.latencyMs,
              usage: response.usage,
              promptDebug: response.promptDebug,
            }
          : message,
      ),
    );
  }

  async function persistMessage(
    conversationId: string | null,
    message: AIChatMessage,
  ) {
    if (!userId || !conversationId) return;

    try {
      await saveAIMessage({
        conversationId,
        userId: userId,
        message,
      });
      refreshConversations();
    } catch (error) {
      console.error("[AI conversation] Failed to save message", error);
    }
  }

  async function streamAssistantAnswer(
    assistantMessageId: string,
    response: AIFinanceChatApiResponse,
    conversationId: string | null,
  ) {
    applyResponseMetadata(assistantMessageId, response);

    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              status: "streaming",
              content: "",
            }
          : message,
      ),
    );

    setLoading(false);
    setStreaming(true);

    streamedContentRef.current = "";
    const chunks = splitStreamingChunks(response.answer);

    for (const chunk of chunks) {
      if (stopRequestedRef.current) {
        const stoppedContent = streamedContentRef.current.trimEnd();
        const stoppedMessage: AIChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          status: "stopped",
          content: stoppedContent || response.answer.slice(0, 120),
          createdAt: getTimeLabel(),
          source: response.source,
          confidence: response.confidence,
          model: response.model,
          fallbackUsed: response.fallbackUsed,
          fallbackReason: response.fallbackReason,
          latencyMs: response.latencyMs,
          usage: response.usage,
          promptDebug: response.promptDebug,
        };

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId ? stoppedMessage : message,
          ),
        );
        await persistMessage(conversationId, stoppedMessage);
        return;
      }

      streamedContentRef.current = `${streamedContentRef.current}${chunk}`;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: streamedContentRef.current,
              }
            : message,
        ),
      );

      await sleep(chunk.includes("\n") ? 34 : 16);
    }

    const completedMessage: AIChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      status: "completed",
      content: response.answer,
      createdAt: getTimeLabel(),
      source: response.source,
      confidence: response.confidence,
      model: response.model,
      fallbackUsed: response.fallbackUsed,
      fallbackReason: response.fallbackReason,
      latencyMs: response.latencyMs,
      usage: response.usage,
      promptDebug: response.promptDebug,
    };

    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId ? completedMessage : message,
      ),
    );
    await persistMessage(conversationId, completedMessage);
  }

  function handleStopGenerating() {
    stopRequestedRef.current = true;
    abortControllerRef.current?.abort();

    const assistantMessageId = activeAssistantMessageIdRef.current;
    if (!assistantMessageId) return;

    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId &&
        (message.status === "pending" || message.status === "streaming")
          ? {
              ...message,
              status: "stopped",
              content: message.content.trim() || "Response stopped.",
            }
          : message,
      ),
    );

    setLoading(false);
    setStreaming(false);
  }

  function handleAsk(value?: string) {
    const question = (value ?? input).trim();
    if (!question || loading || streaming) return;

    const userMessage: AIChatMessage = {
      id: nextMessageId("user"),
      role: "user",
      status: "completed",
      content: question,
      createdAt: getTimeLabel(),
    };

    const assistantMessageId = nextMessageId("assistant");
    const assistantMessage: AIChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      status: "pending",
      content: "",
      createdAt: getTimeLabel(),
      source: "openai",
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeAssistantMessageIdRef.current = assistantMessageId;
    stopRequestedRef.current = false;
    streamedContentRef.current = "";

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setLoading(true);

    void ensureConversation(question)
      .then(async (conversationId) => {
        await persistMessage(conversationId, userMessage);
        const response = await runAIChat(question, controller.signal);
        await streamAssistantAnswer(
          assistantMessageId,
          response,
          conversationId,
        );
      })
      .catch((error: unknown) => {
        if (stopRequestedRef.current) return;

        const reason =
          error instanceof Error ? error.message : "Không thể tạo phản hồi AI.";

        const errorMessage: AIChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          status: "error",
          source: "fallback",
          fallbackUsed: true,
          fallbackReason: reason,
          content: "Không thể hoàn tất phản hồi AI. Vui lòng thử lại.",
          createdAt: getTimeLabel(),
        };

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId ? errorMessage : message,
          ),
        );
      })
      .finally(() => {
        if (activeAssistantMessageIdRef.current === assistantMessageId) {
          activeAssistantMessageIdRef.current = null;
          abortControllerRef.current = null;
        }
        setLoading(false);
        setStreaming(false);
      });
  }

  function handleNewChat() {
    if (loading || streaming) handleStopGenerating();
    setActiveConversationId(null);
    setMessages([createWelcomeMessage(nextMessageId("welcome-new"))]);
    setInput("");
    setHistoryOpen(false);
  }

  function handleClearChat() {
    if (loading || streaming) handleStopGenerating();
    handleNewChat();
  }

  function handleSelectConversation(conversationId: string) {
    if (!userId || loading || streaming) return;

    setHistoryLoading(true);
    setHistoryError(null);
    loadAIMessages(userId, conversationId)
      .then((items) => {
        setActiveConversationId(conversationId);
        setMessages(
          items.length > 0
            ? items
            : [createWelcomeMessage(nextMessageId("welcome-empty"))],
        );
        setHistoryOpen(false);
      })
      .catch((error: unknown) => {
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Không thể mở cuộc trò chuyện.",
        );
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }

  function handleRenameConversation(conversation: AIConversation) {
    if (!userId) return;
    const title = window.prompt("Tên cuộc trò chuyện", conversation.title);
    if (title === null) return;

    renameAIConversation(userId, conversation.id, title)
      .then((updated) => {
        if (!updated) return;
        setConversations((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      })
      .catch((error: unknown) => {
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Không thể đổi tên hội thoại.",
        );
      });
  }

  function handleTogglePin(conversation: AIConversation) {
    if (!userId) return;

    togglePinAIConversation(userId, conversation.id, !conversation.isPinned)
      .then((updated) => {
        if (!updated) return;
        setConversations((prev) =>
          prev
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              return b.lastMessageAt.localeCompare(a.lastMessageAt);
            }),
        );
      })
      .catch((error: unknown) => {
        setHistoryError(
          error instanceof Error ? error.message : "Không thể ghim hội thoại.",
        );
      });
  }

  function handleDeleteConversation(conversation: AIConversation) {
    if (!userId) return;
    const ok = window.confirm(`Xoá cuộc trò chuyện "${conversation.title}"?`);
    if (!ok) return;

    deleteAIConversation(userId, conversation.id)
      .then(() => {
        setConversations((prev) =>
          prev.filter((item) => item.id !== conversation.id),
        );
        if (activeConversationId === conversation.id) handleNewChat();
      })
      .catch((error: unknown) => {
        setHistoryError(
          error instanceof Error ? error.message : "Không thể xoá hội thoại.",
        );
      });
  }

  const visibleMessages = hasUserMessage
    ? messages
    : messages.filter((message) => !message.id.startsWith("welcome"));

  if (!open) return null;

  return (
    <section
      className={[
        "fixed inset-0 z-80 flex h-dvh flex-col overflow-hidden bg-white shadow-2xl transition-all duration-300 ease-out",
        "lg:top-5 lg:right-4 lg:bottom-3 lg:left-auto lg:h-auto lg:rounded-4xl",
        panelExpanded
          ? "lg:w-[50rem] xl:w-[56rem]"
          : "lg:w-[28rem] xl:w-[30rem]",
      ].join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label="AI Finance Agent"
    >
      <header className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-3xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200">
              <Sparkles size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-black text-slate-900">
                  MyFinance AI
                </h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">
                  AI-7.1
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                {activeConversation?.title ?? "Personal CFO Copilot"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              className={[
                "flex size-10 items-center justify-center rounded-2xl transition",
                historyOpen
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              ].join(" ")}
              aria-label="Lịch sử chat"
            >
              <History size={16} />
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              disabled={loading || streaming}
              className={[
                "items-center justify-center rounded-2xl font-black transition disabled:cursor-not-allowed disabled:opacity-60",
                panelExpanded
                  ? "hidden gap-2 bg-blue-600 px-3.5 py-2.5 text-xs text-white shadow-lg shadow-blue-100 hover:bg-blue-700 sm:inline-flex"
                  : "hidden size-10 bg-slate-100 text-slate-500 hover:bg-slate-200 sm:inline-flex",
              ].join(" ")}
              aria-label="Chat mới"
              title="Chat mới"
            >
              <MessageSquarePlus size={panelExpanded ? 15 : 16} />
              {panelExpanded && <span>New Chat</span>}
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              disabled={loading || streaming}
              className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 sm:hidden"
              aria-label="Chat mới"
              title="Chat mới"
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              type="button"
              onClick={handleReloadContext}
              disabled={contextLoading || loading || streaming}
              className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Làm mới dữ liệu AI"
            >
              <RefreshCw
                size={16}
                className={contextLoading ? "animate-spin" : ""}
              />
            </button>
            <button
              type="button"
              onClick={handleTogglePanelSize}
              className="hidden size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 lg:flex"
              aria-label={panelExpanded ? "Thu gọn AI" : "Mở rộng AI"}
              title={panelExpanded ? "Thu gọn" : "Mở rộng"}
            >
              {panelExpanded ? (
                <Minimize2 size={17} />
              ) : (
                <Maximize2 size={17} />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              aria-label="Đóng AI"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-black">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-600">
            <span className="size-2 rounded-full bg-emerald-500" />
            {streaming ? "Streaming" : "Online"}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-slate-500">
            <span className="truncate">{contextStatusLabel}</span>
          </span>
          {urgentInsightCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-amber-600">
              {urgentInsightCount} cảnh báo
            </span>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 bg-slate-50/70">
        {historyOpen && panelExpanded && (
          <aside className="hidden w-72 shrink-0 border-r border-slate-100 bg-white p-4 lg:block">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Lịch sử</h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  Đồng bộ theo tài khoản.
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex size-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
                aria-label="Chat mới"
              >
                <MessageSquarePlus size={15} />
              </button>
            </div>

            {historyError && (
              <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                {historyError}
              </div>
            )}

            <div className="h-full space-y-2 overflow-y-auto pr-1">
              {historyLoading && conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Đang tải lịch sử...
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Chưa có hội thoại nào.
                </div>
              ) : (
                conversations.map((conversation) => {
                  const active = conversation.id === activeConversationId;
                  return (
                    <div
                      key={conversation.id}
                      className={[
                        "group flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition",
                        active
                          ? "border-blue-100 bg-blue-50"
                          : "border-transparent bg-white hover:border-slate-100 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        disabled={loading || streaming}
                        onClick={() =>
                          handleSelectConversation(conversation.id)
                        }
                        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {conversation.isPinned && (
                            <Pin size={11} className="shrink-0 text-blue-600" />
                          )}
                          <p className="truncate text-xs font-black text-slate-800">
                            {conversation.title}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                          {formatConversationTime(conversation.lastMessageAt)}
                        </p>
                      </button>

                      <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-blue-600"
                          aria-label="Ghim hội thoại"
                        >
                          {conversation.isPinned ? (
                            <PinOff size={13} />
                          ) : (
                            <Pin size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenameConversation(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700"
                          aria-label="Đổi tên hội thoại"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-rose-600"
                          aria-label="Xoá hội thoại"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {historyOpen && !panelExpanded && (
          <aside className="absolute inset-0 z-30 hidden bg-white px-4 py-4 lg:flex lg:flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Lịch sử hội thoại
                </h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  Chọn để tiếp tục chat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                disabled={loading || streaming}
                className="flex size-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Chat mới"
                title="Chat mới"
              >
                <MessageSquarePlus size={15} />
              </button>
            </div>

            {historyError && (
              <div className="mb-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                {historyError}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {historyLoading && conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Đang tải lịch sử...
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Chưa có hội thoại nào.
                </div>
              ) : (
                conversations.map((conversation) => {
                  const active = conversation.id === activeConversationId;
                  return (
                    <div
                      key={conversation.id}
                      className={[
                        "group flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition",
                        active
                          ? "border-blue-100 bg-blue-50"
                          : "border-slate-100 bg-slate-50/70 hover:bg-white",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        disabled={loading || streaming}
                        onClick={() =>
                          handleSelectConversation(conversation.id)
                        }
                        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {conversation.isPinned && (
                            <Pin size={11} className="shrink-0 text-blue-600" />
                          )}
                          <p className="truncate text-xs font-black text-slate-800">
                            {conversation.title}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                          {formatConversationTime(conversation.lastMessageAt)}
                        </p>
                      </button>

                      <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-blue-600"
                          aria-label="Ghim hội thoại"
                        >
                          {conversation.isPinned ? (
                            <PinOff size={13} />
                          ) : (
                            <Pin size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenameConversation(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700"
                          aria-label="Đổi tên hội thoại"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(conversation)}
                          className="flex size-7 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-rose-600"
                          aria-label="Xoá hội thoại"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {historyOpen && (
          <aside className="absolute inset-0 z-30 flex flex-col bg-white px-4 py-4 lg:hidden">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Lịch sử hội thoại
                </h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  Chọn để tiếp tục chat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex size-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
                aria-label="Chat mới"
                title="Chat mới"
              >
                <MessageSquarePlus size={15} />
              </button>
            </div>

            {historyError && (
              <div className="mb-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                {historyError}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {historyLoading && conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Đang tải lịch sử...
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">
                  Chưa có hội thoại nào.
                </div>
              ) : (
                conversations.map((conversation) => {
                  const active = conversation.id === activeConversationId;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      disabled={loading || streaming}
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={[
                        "flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed",
                        active
                          ? "border-blue-100 bg-blue-50"
                          : "border-slate-100 bg-slate-50/70 hover:bg-white",
                      ].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-800">
                          {conversation.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                          {formatConversationTime(conversation.lastMessageAt)}
                        </span>
                      </span>
                      {conversation.isPinned && (
                        <Pin size={12} className="shrink-0 text-blue-600" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          >
            {contextError && (
              <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {contextError}
              </div>
            )}

            {visibleMessages.length > 0 && (
              <div className="space-y-3">
                {visibleMessages.map((message) => (
                  <AIChatMessageBubble key={message.id} message={message} />
                ))}
              </div>
            )}

            {!hasUserMessage && (
              <section className="mx-auto flex min-h-[420px] max-w-2xl flex-col justify-center py-8">
                <div className="text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-4xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-100">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">
                    Xin chào, tôi có thể giúp gì về tài chính?
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
                    Hỏi về chi tiêu, ngân sách, dòng tiền, ví tiền, mục tiêu
                    hoặc các cảnh báo trong dữ liệu thật của bạn.
                  </p>
                </div>

                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  {quickQuestions.slice(0, 4).map((item) => (
                    <button
                      key={item.question}
                      type="button"
                      disabled={loading || streaming}
                      onClick={() => handleAsk(item.question)}
                      className="rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">
                        {item.label}
                      </p>
                      <h4 className="mt-1 text-sm font-black leading-5 text-slate-900">
                        {item.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-400">
                        {item.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>

          <footer className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5 sm:pt-4 sm:pb-4">
            <AIChatInput
              value={input}
              loading={loading || contextLoading}
              streaming={streaming}
              onChange={setInput}
              onSubmit={() => handleAsk()}
              onStop={handleStopGenerating}
            />
            <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">
              ⚠ AI có thể mắc sai sót. Hãy kiểm tra lại dữ liệu.
            </p>
          </footer>
        </div>
      </div>
    </section>
  );
}
