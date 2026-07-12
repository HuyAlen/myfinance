"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  Info,
  CircleStop,
  Copy,
  Expand,
  LoaderCircle,
  MessageSquarePlus,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/AuthProvider";
import AIConversationHistory from "./AIConversationHistory";
import AIPendingActionCard, {
  type AIPendingActionCardData,
} from "./AIPendingActionCard";
import AIActionFormCard from "./action-form/AIActionFormCard";
import type { AIActionFormMetadata } from "@/src/services/finance/ai-agent/action-form/aiActionFormTypes";
import type { SecureAIChatResponse } from "@/src/services/finance/ai-agent/aiChatResponseTypes";
import type { AIPlannerDebugMetadata } from "@/src/services/finance/ai-agent/planner/aiPlanTypes";
import {
  clearPersistedAIChat,
  readPersistedAIChat,
  writePersistedAIChat,
} from "./storage/aiChatPersistence";
import {
  getAIConversationMessages,
  type AIConversationSummary,
} from "@/src/services/finance/ai-agent/aiConversationApi";

type AIAgentDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type ChatRole = "user" | "assistant";
type ChatStatus = "completed" | "streaming" | "error" | "stopped";
type ChatSource = "openai" | "local" | "fallback";

type ChatUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type ChatMetaResponse = SecureAIChatResponse & {
  actionForms?: AIActionFormMetadata[];
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status: ChatStatus;
  createdAt: string;
  source?: ChatSource;
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  latencyMs?: number;
  usage?: ChatUsage;
  actionForms?: AIActionFormMetadata[];
  pendingActions?: AIPendingActionCardData[];
  plannerDebug?: AIPlannerDebugMetadata;
};

type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "meta"; response: ChatMetaResponse }
  | { type: "planner_meta"; debug: AIPlannerDebugMetadata }
  | { type: "error"; message: string };

const QUICK_QUESTIONS = [
  "Tổng quan tài chính tháng này của tôi thế nào?",
  "Tháng này tôi tiêu nhiều nhất ở đâu?",
  "Ngân sách nào đang sắp vượt?",
  "Dòng tiền hiện tại của tôi có an toàn không?",
  "Tôi nên ưu tiên mục tiêu tài chính nào?",
  "Có cảnh báo tài chính nào cần xử lý ngay không?",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTimeLabel() {
  return new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseStreamLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const raw = trimmed.slice(5).trim();
  if (!raw || raw === "[DONE]") return null;

  try {
    return JSON.parse(raw) as StreamEvent;
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return `Request failed (${response.status}).`;

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

function sourceLabel(source?: ChatSource) {
  if (source === "openai") return "OpenAI";
  if (source === "fallback") return "Local fallback";
  if (source === "local") return "Local AI";
  return "MyFinance AI";
}

function WelcomeState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <section className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-2 py-10 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-[1.35rem] bg-linear-to-br from-blue-600 via-cyan-500 to-emerald-400 text-white shadow-[0_18px_45px_rgba(37,99,235,0.24)]">
          <Sparkles size={23} />
        </div>
        <h3 className="mt-5 text-2xl font-black tracking-[-0.03em] text-slate-900">
          Hôm nay bạn muốn phân tích gì?
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
          Hỏi về chi tiêu, ngân sách, dòng tiền hoặc mục tiêu. MyFinance AI sẽ
          đọc dữ liệu phù hợp và giải thích theo ngữ cảnh của bạn.
        </p>
      </div>

      <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {QUICK_QUESTIONS.slice(0, 4).map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md"
          >
            <span className="text-sm font-bold leading-5 text-slate-700">
              {question}
            </span>
            <ChevronRight
              size={15}
              className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function PlannerDebugPanel({ debug }: { debug: AIPlannerDebugMetadata }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-black text-blue-800">
          <Bug size={14} className="shrink-0" />
          Planner Debug
          <span className="truncate rounded-full bg-white px-2 py-0.5 text-[9px] uppercase tracking-wide text-blue-600 ring-1 ring-blue-100">
            {debug.plannerStatus}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={[
            "shrink-0 text-blue-500 transition",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="border-t border-blue-100 bg-white/80 px-3.5 py-3 text-[11px] text-slate-600">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <div className="font-bold text-slate-400">Attempt</div>
              <div className="mt-0.5 font-black text-slate-700">
                {debug.plannerAttempt}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-400">Total</div>
              <div className="mt-0.5 font-black text-slate-700">
                {debug.timing.totalMs}ms
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-400">Planning</div>
              <div className="mt-0.5 font-black text-slate-700">
                {debug.timing.planningMs ?? 0}ms
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-400">Execution</div>
              <div className="mt-0.5 font-black text-slate-700">
                {debug.timing.executionMs ?? 0}ms
              </div>
            </div>
          </div>

          {debug.continuation?.matched ? (
            <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
              <div className="font-black text-cyan-800">
                Pending Action Continuation · {debug.continuation.mode}
              </div>
              <div className="mt-1 text-[10px] text-cyan-700">
                source: {debug.continuation.source} · lock:{" "}
                {String(debug.continuation.lockTool)}
                {debug.continuation.toolName
                  ? ` · tool: ${debug.continuation.toolName}`
                  : ""}
              </div>
              <div className="mt-1 text-[10px] text-cyan-700">
                {debug.continuation.reason}
              </div>
            </div>
          ) : null}

          {debug.intent ? (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="font-bold text-slate-400">Intent:</span>{" "}
              <span className="font-black text-slate-700">{debug.intent}</span>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {debug.selectedTools.length ? (
              debug.selectedTools.map((tool) => (
                <div
                  key={tool.stepId}
                  className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 font-black text-slate-700">
                      {tool.stepId} · {tool.toolName}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">
                      {tool.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {tool.durationMs ?? 0}ms · keys:{" "}
                    {tool.argumentKeys.join(", ") || "none"}
                  </div>
                  {tool.error ? (
                    <div className="mt-1 text-[10px] font-semibold text-rose-600">
                      {tool.error}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-400">
                Không có tool nào được thực thi.
              </div>
            )}
          </div>

          {debug.retryErrors.length || debug.validationErrors.length ? (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              {[...debug.retryErrors, ...debug.validationErrors].map(
                (error, index) => (
                  <div key={`${index}-${error}`}>{error}</div>
                ),
              )}
            </div>
          ) : null}

          {debug.fallbackReason ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">
              {debug.fallbackReason}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  accessToken,
  onRetry,
  onPendingActionChanged,
  onActionFormPrepared,
  onActionFormCancelled,
  conversationId,
}: {
  message: ChatMessage;
  accessToken: string;
  onRetry?: () => void;
  onPendingActionChanged?: (
    messageId: string,
    action: AIPendingActionCardData,
  ) => void;
  onActionFormPrepared?: (
    messageId: string,
    formId: string,
    action: AIPendingActionCardData,
  ) => void;
  onActionFormCancelled?: (messageId: string, formId: string) => void;
  conversationId?: string | null;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const latencyLabel =
    typeof message.latencyMs === "number"
      ? `${(message.latencyMs / 1000).toFixed(1)}s`
      : null;

  if (isUser) {
    return (
      <article className="flex animate-[fadeIn_.18s_ease-out] justify-end">
        <div className="max-w-[82%] sm:max-w-[74%]">
          <div className="rounded-[1.3rem] rounded-br-md bg-linear-to-br from-blue-600 to-blue-500 px-4 py-3 text-[14px] font-semibold leading-6 text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)]">
            <div className="whitespace-pre-wrap wrap-break-word">
              {message.content}
            </div>
          </div>
          <div className="mt-1.5 pr-1 text-right text-[10px] font-semibold text-slate-400">
            {message.createdAt}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group animate-[fadeIn_.18s_ease-out]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-sm">
          <Sparkles size={14} />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className={[
              "text-[14px] leading-6",
              message.status === "error"
                ? "rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 font-medium text-rose-800"
                : "font-normal text-slate-700",
            ].join(" ")}
          >
            {message.content ? (
              <div className="whitespace-pre-wrap wrap-break-word">
                {message.content}
                {message.status === "streaming" ? (
                  <span className="ml-0.5 inline-block animate-pulse text-blue-600">
                    ▋
                  </span>
                ) : null}
              </div>
            ) : message.status === "streaming" ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <LoaderCircle
                    size={15}
                    className="animate-spin text-blue-600"
                  />
                  Đang phân tích
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    Hiểu yêu cầu và chọn dữ liệu phù hợp
                  </span>
                  <span className="flex items-center gap-2">
                    <LoaderCircle
                      size={13}
                      className="animate-spin text-blue-500"
                    />
                    Kiểm tra dữ liệu tài chính
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {message.actionForms?.length ? (
            <div className="space-y-3">
              {message.actionForms.map((form) => (
                <AIActionFormCard
                  key={form.id}
                  form={form}
                  accessToken={accessToken}
                  conversationId={conversationId}
                  onPrepared={(action) =>
                    onActionFormPrepared?.(message.id, form.id, action)
                  }
                  onCancelled={() =>
                    onActionFormCancelled?.(message.id, form.id)
                  }
                />
              ))}
            </div>
          ) : null}

          {message.pendingActions?.length ? (
            <div className="space-y-3">
              {message.pendingActions.map((action) => (
                <AIPendingActionCard
                  key={action.id}
                  action={action}
                  accessToken={accessToken}
                  onChanged={(updated) =>
                    onPendingActionChanged?.(message.id, updated)
                  }
                />
              ))}
            </div>
          ) : null}

          {message.plannerDebug ? (
            <PlannerDebugPanel debug={message.plannerDebug} />
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-400">
            <span>{message.createdAt}</span>
            {message.source ? (
              <>
                <span>·</span>
                <span>{sourceLabel(message.source)}</span>
              </>
            ) : null}
            {message.model ? (
              <>
                <span>·</span>
                <span>{message.model}</span>
              </>
            ) : null}
            {latencyLabel ? (
              <>
                <span>·</span>
                <span>{latencyLabel}</span>
              </>
            ) : null}
            {message.status === "stopped" ? (
              <span className="ml-1 text-amber-600">Đã dừng</span>
            ) : null}
          </div>

          {message.content ? (
            <div className="mt-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-slate-400 transition hover:bg-white hover:text-slate-700"
                title="Copy"
              >
                <Copy size={13} /> {copied ? "Đã copy" : "Copy"}
              </button>
              {onRetry &&
              (message.status === "error" || message.status === "stopped") ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50"
                >
                  <RotateCcw size={13} /> Thử lại
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                title="Hữu ích"
              >
                <ThumbsUp size={13} />
              </button>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                title="Chưa hữu ích"
              >
                <ThumbsDown size={13} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function AIAgentDrawer({ open, onClose }: AIAgentDrawerProps) {
  const { session, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const streamedTextRef = useRef("");
  const userId = session?.user?.id ?? "";

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setHydratedUserId(null);
      return;
    }

    const persisted = readPersistedAIChat<ChatMessage>(userId);

    if (persisted) {
      setMessages(
        persisted.messages.map((message) =>
          message.status === "streaming"
            ? {
                ...message,
                status: "stopped",
                content:
                  message.content.trim() ||
                  "Phản hồi trước đã bị dừng khi chuyển trang.",
              }
            : message,
        ),
      );
      setActiveConversationId(persisted.conversationId);
      setLastQuestion(persisted.lastQuestion);
    }

    setHydratedUserId(userId);
  }, [authLoading, userId]);

  useEffect(() => {
    if (!userId || hydratedUserId !== userId) return;

    writePersistedAIChat<ChatMessage>(userId, {
      conversationId: activeConversationId,
      lastQuestion,
      messages,
    });
  }, [activeConversationId, hydratedUserId, lastQuestion, messages, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setExpanded(
      window.localStorage.getItem("myfinance-ai-expanded") === "true",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDeveloperMode(
      window.localStorage.getItem("myfinance-ai-developer-mode") === "true",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "myfinance-ai-developer-mode",
      String(developerMode),
    );
  }, [developerMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("myfinance-ai-expanded", String(expanded));
  }, [expanded]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [messages, open, streaming]);

  const conversationPayload = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.status === "completed" &&
            (message.role === "user" || message.role === "assistant"),
        )
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages],
  );

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);

    setMessages((current) =>
      current.map((message) =>
        message.status === "streaming"
          ? {
              ...message,
              status: "stopped",
              content: message.content.trim() || "Phản hồi đã được dừng.",
            }
          : message,
      ),
    );
  }, []);

  const askQuestion = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || streaming) return;

      const accessToken = session?.access_token;
      const userMessage: ChatMessage = {
        id: makeId("user"),
        role: "user",
        content: question,
        status: "completed",
        createdAt: getTimeLabel(),
      };
      const assistantId = makeId("assistant");
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: getTimeLabel(),
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput("");
      setLastQuestion(question);
      setStreaming(true);
      streamedTextRef.current = "";

      if (!accessToken) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  status: "error",
                  content:
                    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
                }
              : message,
          ),
        );
        setStreaming(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/ai-finance/chat/stream", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question,
            conversationId: activeConversationId ?? undefined,
            conversation: conversationPayload,
            debug: developerMode,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        if (!response.body) {
          throw new Error("Server không trả về stream dữ liệu.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let meta: ChatMetaResponse | null = null;
        let plannerDebug: AIPlannerDebugMetadata | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const event = parseStreamLine(line);
            if (!event) continue;

            if (event.type === "delta") {
              streamedTextRef.current += event.content;
              const nextContent = streamedTextRef.current;
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: nextContent }
                    : message,
                ),
              );
            } else if (event.type === "meta") {
              meta = event.response;
            } else if (event.type === "planner_meta") {
              plannerDebug = event.debug;
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        if (buffer.trim()) {
          const event = parseStreamLine(buffer);
          if (event?.type === "delta") {
            streamedTextRef.current += event.content;
            const nextContent = streamedTextRef.current;

            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: nextContent }
                  : message,
              ),
            );
          } else if (event?.type === "meta") {
            meta = event.response;
          } else if (event?.type === "planner_meta") {
            plannerDebug = event.debug;
          } else if (event?.type === "error") {
            throw new Error(event.message);
          }
        }

        const finalContent =
          meta?.answer?.trim() || streamedTextRef.current.trim();

        if (meta?.conversationId) {
          setActiveConversationId(meta.conversationId);
        }

        if (!finalContent) {
          throw new Error("AI không trả về nội dung.");
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: finalContent,
                  status: "completed",
                  source: meta?.source,
                  model: meta?.model,
                  fallbackUsed: meta?.fallbackUsed,
                  fallbackReason: meta?.fallbackReason,
                  latencyMs: meta?.latencyMs,
                  usage: meta?.usage,
                  actionForms: meta?.actionForms ?? [],
                  pendingActions: meta?.pendingActions ?? [],
                  plannerDebug: meta?.plannerDebug ?? plannerDebug,
                }
              : message,
          ),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  status: "error",
                  content:
                    error instanceof Error
                      ? `Không thể hoàn tất phản hồi: ${error.message}`
                      : "Không thể hoàn tất phản hồi AI.",
                }
              : message,
          ),
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setStreaming(false);
      }
    },
    [
      activeConversationId,
      conversationPayload,
      developerMode,
      session?.access_token,
      streaming,
    ],
  );

  const handlePendingActionChanged = useCallback(
    (messageId: string, updated: AIPendingActionCardData) => {
      setMessages((current) =>
        current.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                pendingActions: message.pendingActions?.map((candidate) =>
                  candidate.id === updated.id ? updated : candidate,
                ),
              },
        ),
      );
    },
    [],
  );

  const handleActionFormPrepared = useCallback(
    (messageId: string, formId: string, action: AIPendingActionCardData) => {
      setMessages((current) =>
        current.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                actionForms: message.actionForms?.filter(
                  (candidate) => candidate.id !== formId,
                ),
                pendingActions: [...(message.pendingActions ?? []), action],
              },
        ),
      );
    },
    [],
  );

  const handleActionFormCancelled = useCallback(
    (messageId: string, formId: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                actionForms: message.actionForms?.filter(
                  (candidate) => candidate.id !== formId,
                ),
              },
        ),
      );
    },
    [],
  );

  function handleSubmit() {
    void askQuestion(input);
  }

  function handleNewChat() {
    if (streaming) stopGenerating();
    if (userId) clearPersistedAIChat(userId);
    setMessages([]);
    setInput("");
    setLastQuestion("");
    setActiveConversationId(null);
    setHistoryOpen(false);
  }

  function handleRetry() {
    if (lastQuestion) void askQuestion(lastQuestion);
  }

  const handleSelectConversation = useCallback(
    async (conversation: AIConversationSummary) => {
      const accessToken = session?.access_token;
      if (!accessToken || historyLoading || streaming) return;

      setHistoryLoading(true);

      try {
        const records = await getAIConversationMessages(
          accessToken,
          conversation.id,
        );

        const restoredMessages: ChatMessage[] = records.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: "completed",
          createdAt: message.createdAt
            ? new Date(message.createdAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          source: message.source,
          model: message.model,
          latencyMs: message.latencyMs,
          pendingActions: message.pendingActions,
        }));

        setMessages(restoredMessages);
        setActiveConversationId(conversation.id);
        setLastQuestion(
          [...restoredMessages]
            .reverse()
            .find((message) => message.role === "user")?.content ??
            conversation.title,
        );
        setInput("");
        setHistoryOpen(false);
      } catch (reason) {
        setMessages((current) => [
          ...current,
          {
            id: makeId("assistant-history-error"),
            role: "assistant",
            content:
              reason instanceof Error
                ? `Không thể mở cuộc trò chuyện: ${reason.message}`
                : "Không thể mở cuộc trò chuyện đã chọn.",
            status: "error",
            createdAt: getTimeLabel(),
          },
        ]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyLoading, session?.access_token, streaming],
  );

  if (!open) return null;

  return (
    <section
      className={[
        "fixed inset-0 z-80 flex h-dvh overflow-hidden bg-white shadow-[0_28px_90px_rgba(37,99,235,0.18)] transition-all duration-300",
        "lg:top-4 lg:right-4 lg:bottom-4 lg:left-auto lg:h-auto lg:rounded-4xl",
        historyOpen
          ? "lg:w-[min(920px,calc(100vw-5rem))] xl:w-[min(1040px,calc(100vw-6rem))]"
          : expanded
            ? "lg:w-[min(780px,calc(100vw-5rem))] xl:w-[min(880px,calc(100vw-6rem))]"
            : "lg:w-140 xl:w-155",
      ].join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label="MyFinance AI Agent"
    >
      {historyOpen ? (
        <button
          type="button"
          aria-label="Đóng lịch sử"
          onClick={() => setHistoryOpen(false)}
          className="absolute inset-0 z-20 bg-blue-950/15 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <AIConversationHistory
        open={historyOpen}
        accessToken={session?.access_token ?? ""}
        activeConversationId={activeConversationId}
        onClose={() => setHistoryOpen(false)}
        onSelect={(conversation) => void handleSelectConversation(conversation)}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:min-w-135">
        <header className="shrink-0 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 via-cyan-500 to-emerald-400 text-white shadow-lg shadow-blue-200/70">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[15px] font-black text-slate-900">
                    MyFinance AI
                  </h2>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                    Secure BYOK
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <span className={historyOpen ? "hidden xl:inline" : "inline"}>
                    Personal CFO Copilot
                  </span>
                  <span className={historyOpen ? "hidden xl:inline" : "inline"}>
                    ·
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600">
                    {streaming ? (
                      <LoaderCircle size={10} className="animate-spin" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    )}
                    {streaming ? "Đang phân tích" : "Online"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDeveloperMode((value) => !value)}
                className={[
                  "flex size-9 items-center justify-center rounded-xl transition",
                  developerMode
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                    : "text-slate-500 hover:bg-blue-50 hover:text-blue-700",
                ].join(" ")}
                aria-label="Developer Mode"
                title={
                  developerMode ? "Tắt Planner Debug" : "Bật Planner Debug"
                }
              >
                <Bug size={17} />
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen((value) => !value)}
                className={[
                  "flex size-9 items-center justify-center rounded-xl transition",
                  historyOpen
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                    : "text-slate-500 hover:bg-blue-50 hover:text-blue-700",
                ].join(" ")}
                aria-label="Lịch sử trò chuyện"
                title="Lịch sử trò chuyện"
              >
                <History size={17} />
              </button>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Chat mới"
                title="Chat mới"
              >
                <MessageSquarePlus size={17} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="hidden size-9 items-center justify-center rounded-xl text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300 lg:flex"
                aria-label={expanded ? "Thu gọn" : "Mở rộng"}
                title={expanded ? "Thu gọn" : "Mở rộng"}
              >
                {expanded ? <Minimize2 size={17} /> : <Expand size={17} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Đóng AI"
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </header>

        <main
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto bg-linear-to-b from-blue-50/30 via-white to-slate-50/50 px-4 py-7 [scrollbar-color:#bfdbfe_transparent] scrollbar-thin sm:px-6 lg:px-8"
        >
          {messages.length === 0 ? (
            <WelcomeState onAsk={(question) => void askQuestion(question)} />
          ) : (
            <div className="mx-auto w-full max-w-190 space-y-6">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  accessToken={session?.access_token ?? ""}
                  onPendingActionChanged={handlePendingActionChanged}
                  onActionFormPrepared={handleActionFormPrepared}
                  onActionFormCancelled={handleActionFormCancelled}
                  conversationId={activeConversationId}
                  onRetry={
                    index === messages.length - 1 &&
                    message.role === "assistant"
                      ? handleRetry
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </main>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5 sm:pb-3">
          <div className="mx-auto w-full max-w-190">
            <div className="rounded-[1.35rem] border border-slate-200 bg-white p-2 shadow-[0_12px_36px_rgba(37,99,235,0.10)] transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={1}
                  maxLength={6000}
                  disabled={streaming || authLoading}
                  placeholder={
                    streaming ? "AI đang trả lời..." : "Nhắn MyFinance AI..."
                  }
                  className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm font-medium leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                {streaming ? (
                  <button
                    type="button"
                    onClick={stopGenerating}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-sm transition hover:bg-rose-600"
                    aria-label="Dừng phản hồi"
                    title="Dừng phản hồi"
                  >
                    <CircleStop size={17} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!input.trim() || authLoading}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    aria-label="Gửi"
                    title="Gửi"
                  >
                    <Send size={17} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] font-medium text-slate-400">
              <Info size={11} />
              <span>
                AI có thể mắc sai sót. Hãy kiểm tra thông tin quan trọng.
              </span>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}
