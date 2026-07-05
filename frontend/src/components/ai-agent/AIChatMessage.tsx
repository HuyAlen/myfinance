"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Gauge,
  Sparkles,
  TerminalSquare,
  User,
} from "lucide-react";

export type AIChatRole = "assistant" | "user";
export type AIChatSource = "local" | "openai" | "fallback";

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
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

function getSourceClassName(source: AIChatSource | undefined) {
  if (source === "openai") return "bg-blue-50 text-blue-600 ring-blue-100";
  if (source === "fallback") return "bg-amber-50 text-amber-600 ring-amber-100";
  return "bg-emerald-50 text-emerald-600 ring-emerald-100";
}

function getConfidenceClassName(confidence: number | undefined) {
  if (typeof confidence !== "number") return "bg-slate-50 text-slate-500";
  if (confidence >= 0.9) return "bg-emerald-50 text-emerald-600";
  if (confidence >= 0.7) return "bg-amber-50 text-amber-600";
  return "bg-rose-50 text-rose-600";
}

function formatLatency(latencyMs: number | undefined) {
  if (typeof latencyMs !== "number") return null;
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${latencyMs}ms`;
}

function formatTokenCount(totalTokens: number | undefined) {
  if (typeof totalTokens !== "number") return null;
  return `${totalTokens.toLocaleString("vi-VN")} tokens`;
}

function formatBoolean(value: boolean | undefined) {
  if (typeof value !== "boolean") return "-";
  return value ? "Yes" : "No";
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
    <div className="space-y-3">
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const isUser = message.role === "user";
  const latencyLabel = formatLatency(message.latencyMs);
  const tokenLabel = formatTokenCount(message.usage?.totalTokens);
  const showFallbackReason =
    !isUser && message.fallbackUsed && Boolean(message.fallbackReason);
  const showPromptInspector = !isUser && Boolean(message.promptDebug);

  function handleCopy() {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(message.content);
  }

  return (
    <div
      className={["flex gap-3", isUser ? "justify-end" : "justify-start"].join(
        " ",
      )}
    >
      {!isUser && (
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
          <Bot size={16} />
        </div>
      )}

      <div
        className={[
          "max-w-[86%] rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "rounded-br-md bg-blue-600 text-white shadow-blue-100"
            : "rounded-bl-md border border-slate-100 bg-white text-slate-700",
        ].join(" ")}
      >
        {!isUser && (
          <div className="mb-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
                <Sparkles size={13} />
                MyFinance AI
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="flex size-6 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Copy AI answer"
              >
                <Copy size={12} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ring-1",
                  getSourceClassName(message.source),
                ].join(" ")}
              >
                <CheckCircle2 size={11} />
                {getSourceLabel(message.source)}
              </div>

              {message.model && (
                <div className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                  {message.model}
                </div>
              )}

              {typeof message.confidence === "number" && (
                <div
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black",
                    getConfidenceClassName(message.confidence),
                  ].join(" ")}
                >
                  <Gauge size={11} />
                  {Math.round(message.confidence * 100)}% confidence
                </div>
              )}

              {latencyLabel && (
                <div className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-400">
                  {latencyLabel}
                </div>
              )}

              {tokenLabel && (
                <div className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-400">
                  {tokenLabel}
                </div>
              )}
            </div>
          </div>
        )}

        {showFallbackReason && (
          <div className="mb-3 flex gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Fallback: {message.fallbackReason}</span>
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-line">{message.content}</p>
        ) : (
          renderAssistantContent(message.content)
        )}

        {showPromptInspector && message.promptDebug && (
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80">
            <button
              type="button"
              onClick={() => setInspectorOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                <TerminalSquare size={13} />
                Prompt Inspector
              </span>
              <ChevronDown
                size={14}
                className={[
                  "text-slate-400 transition",
                  inspectorOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {inspectorOpen && (
              <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500">
                  <div className="rounded-xl bg-white px-3 py-2">
                    Provider: {getSourceLabel(message.promptDebug.provider)}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Model: {message.promptDebug.model ?? "-"}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Intent: {message.promptDebug.intent ?? "-"}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Max tokens: {message.promptDebug.maxTokens ?? "-"}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Finance context:{" "}
                    {formatBoolean(message.promptDebug.contextSent)}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Rule insights:{" "}
                    {formatBoolean(message.promptDebug.ruleInsightsSent)}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    Insights: {message.promptDebug.insightCount ?? "-"}
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    No fabrication:{" "}
                    {formatBoolean(message.promptDebug.noFabrication)}
                  </div>
                </div>

                {message.promptDebug.responseId && (
                  <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
                    Response ID: {message.promptDebug.responseId}
                  </div>
                )}

                {message.promptDebug.systemPromptPreview && (
                  <div>
                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      System prompt (
                      {message.promptDebug.systemPromptChars ?? 0} chars)
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-xl bg-white p-3 text-[10px] font-semibold leading-4 text-slate-600 whitespace-pre-wrap">
                      {message.promptDebug.systemPromptPreview}
                    </pre>
                  </div>
                )}

                {message.promptDebug.userPromptPreview && (
                  <div>
                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      User prompt ({message.promptDebug.userPromptChars ?? 0}{" "}
                      chars)
                    </div>
                    <pre className="max-h-56 overflow-auto rounded-xl bg-white p-3 text-[10px] font-semibold leading-4 text-slate-600 whitespace-pre-wrap">
                      {message.promptDebug.userPromptPreview}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p
          className={[
            "mt-2 text-[10px] font-bold",
            isUser ? "text-blue-100" : "text-slate-300",
          ].join(" ")}
        >
          {message.createdAt}
        </p>
      </div>

      {isUser && (
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 shadow-sm">
          <User size={15} />
        </div>
      )}
    </div>
  );
}
