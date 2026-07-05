"use client";

import { Bot, CheckCircle2, Copy, Sparkles, User } from "lucide-react";

export type AIChatRole = "assistant" | "user";
export type AIChatSource = "local" | "openai" | "fallback";

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
  source?: AIChatSource;
  confidence?: number;
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
  if (source === "openai") return "bg-blue-50 text-blue-600";
  if (source === "fallback") return "bg-amber-50 text-amber-600";
  return "bg-emerald-50 text-emerald-600";
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
  const isUser = message.role === "user";

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
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
              <Sparkles size={13} />
              MyFinance AI
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={[
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black",
                  getSourceClassName(message.source),
                ].join(" ")}
              >
                <CheckCircle2 size={11} />
                {getSourceLabel(message.source)}
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
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-line">{message.content}</p>
        ) : (
          renderAssistantContent(message.content)
        )}

        <p
          className={[
            "mt-2 text-[10px] font-bold",
            isUser ? "text-blue-100" : "text-slate-300",
          ].join(" ")}
        >
          {message.createdAt}
          {!isUser && typeof message.confidence === "number"
            ? ` • Confidence ${Math.round(message.confidence * 100)}%`
            : ""}
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
