"use client";

import { AlertTriangle, Bot, Check, Copy, Sparkles, User } from "lucide-react";

export type AIChatRole = "assistant" | "user";
export type AIChatSource = "local" | "openai" | "fallback";
export type AIChatMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "stopped"
  | "error";

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
  status?: AIChatMessageStatus;
  source?: AIChatSource;
  confidence?: number;
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  latencyMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  promptDebug?: {
    provider: AIChatSource;
    model?: string;
    intent?: string;
    temperature?: number;
    maxTokens?: number;
    contextSent?: boolean;
    ruleInsightsSent?: boolean;
    insightCount?: number;
    noFabrication?: boolean;
    systemPromptPreview?: string;
    userPromptPreview?: string;
    systemPromptChars?: number;
    userPromptChars?: number;
    responseId?: string;
  };
};

type AIChatMessageProps = {
  message: AIChatMessage;
};

function getSourceLabel(source: AIChatSource | undefined) {
  if (source === "openai") return "OpenAI";
  if (source === "fallback") return "Fallback";
  return "Local";
}

function formatLatency(latencyMs: number | undefined) {
  if (typeof latencyMs !== "number") return null;
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${latencyMs}ms`;
}

function renderAssistantContent(content: string) {
  const sections = content
    .split(/(?=📊 Tổng quan|🔍 Phân tích|💡 Gợi ý)/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sections.length <= 1) {
    return <p className="whitespace-pre-line">{content}</p>;
  }

  return (
    <div className="space-y-2.5">
      {sections.map((section) => {
        const [title, ...body] = section.split("\n");
        return (
          <section key={title} className="rounded-2xl bg-slate-50/80 p-3">
            <h4 className="text-xs font-black text-slate-950">{title}</h4>
            <p className="mt-1 whitespace-pre-line text-xs font-semibold leading-5 text-slate-600">
              {body.join("\n").trim()}
            </p>
          </section>
        );
      })}
    </div>
  );
}

export default function AIChatMessageBubble({ message }: AIChatMessageProps) {
  const isUser = message.role === "user";
  const latencyLabel = formatLatency(message.latencyMs);
  const showFallbackReason =
    !isUser && message.fallbackUsed && Boolean(message.fallbackReason);
  const isStreaming = !isUser && message.status === "streaming";
  const isPending = !isUser && message.status === "pending";
  const isStopped = !isUser && message.status === "stopped";
  const isError = !isUser && message.status === "error";
  const providerLabel = getSourceLabel(message.source);
  const modelLabel = message.model || providerLabel;

  function handleCopy() {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(message.content);
  }

  if (isUser) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[82%] rounded-3xl rounded-br-md bg-blue-600 px-4 py-3 text-sm font-semibold leading-6 text-white shadow-sm shadow-blue-100">
          <p className="whitespace-pre-line">{message.content}</p>
          <p className="mt-2 text-right text-[10px] font-bold text-blue-100">
            {message.createdAt}
          </p>
        </div>
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 shadow-sm">
          <User size={14} />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
        <Bot size={15} />
      </div>

      <div className="max-w-[88%] rounded-3xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
              <Sparkles size={12} />
              MyFinance AI
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-slate-400">
              <span className="truncate">{modelLabel}</span>
              {typeof message.confidence === "number" && (
                <>
                  <span>•</span>
                  <span>{Math.round(message.confidence * 100)}%</span>
                </>
              )}
              {latencyLabel && (
                <>
                  <span>•</span>
                  <span>{latencyLabel}</span>
                </>
              )}
            </div>
          </div>

          {message.content.trim() && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
              aria-label="Copy AI answer"
            >
              <Copy size={13} />
            </button>
          )}
        </div>

        {(isPending || (isStreaming && !message.content.trim())) && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-blue-500" />
            </span>
            <span>Đang phân tích...</span>
          </div>
        )}

        {isStopped && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            <Check size={13} />
            Đã dừng phản hồi.
          </div>
        )}

        {isError && (
          <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
            Stream interrupted. Bạn có thể gửi lại câu hỏi để retry.
          </div>
        )}

        {showFallbackReason && (
          <div className="mb-3 flex gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Fallback: {message.fallbackReason}</span>
          </div>
        )}

        {message.content.trim()
          ? renderAssistantContent(message.content)
          : null}

        <p className="mt-2 text-[10px] font-bold text-slate-300">
          {message.createdAt}
        </p>
      </div>
    </div>
  );
}
