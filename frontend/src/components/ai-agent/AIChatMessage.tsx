"use client";

import { Bot, CheckCircle2, Copy, Sparkles, User } from "lucide-react";

export type AIChatRole = "assistant" | "user";

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
};

type AIChatMessageProps = {
  message: AIChatMessage;
};

const sectionStyles: Record<string, string> = {
  "📊 Tổng quan": "border-blue-100 bg-blue-50/70 text-blue-700",
  "🔍 Phân tích": "border-slate-100 bg-slate-50/90 text-slate-700",
  "💡 Gợi ý": "border-emerald-100 bg-emerald-50/70 text-emerald-700",
};

function renderAssistantContent(content: string) {
  const sections = content
    .split(/(?=📊 Tổng quan|🔍 Phân tích|💡 Gợi ý)/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sections.length <= 1) {
    return <p className="whitespace-pre-line text-sm leading-6">{content}</p>;
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const [title, ...body] = section.split("\n");
        const className =
          sectionStyles[title] ??
          "border-slate-100 bg-slate-50/90 text-slate-700";

        return (
          <section
            key={title}
            className={["rounded-2xl border p-3", className].join(" ")}
          >
            <h4 className="text-[11px] font-black uppercase tracking-[0.12em]">
              {title}
            </h4>
            <p className="mt-2 whitespace-pre-line text-[13px] font-semibold leading-6 text-slate-700">
              {body.join("\n").trim()}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function copyMessage(content: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(content);
}

export default function AIChatMessageBubble({ message }: AIChatMessageProps) {
  const isUser = message.role === "user";

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
          "max-w-[88%] rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "rounded-br-md bg-blue-600 text-white shadow-blue-100"
            : "rounded-bl-md border border-slate-100 bg-white text-slate-700",
        ].join(" ")}
      >
        {!isUser && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
              <Sparkles size={13} />
              MyFinance AI
            </div>
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">
              <CheckCircle2 size={11} />
              Local
            </div>
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-line">{message.content}</p>
        ) : (
          renderAssistantContent(message.content)
        )}

        <div
          className={[
            "mt-3 flex items-center gap-2 text-[10px] font-bold",
            isUser ? "justify-end text-blue-100" : "text-slate-300",
          ].join(" ")}
        >
          <span>{message.createdAt}</span>
          {!isUser && (
            <button
              type="button"
              onClick={() => copyMessage(message.content)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              aria-label="Sao chép câu trả lời AI"
            >
              <Copy size={11} />
              Copy
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 shadow-sm">
          <User size={15} />
        </div>
      )}
    </div>
  );
}
