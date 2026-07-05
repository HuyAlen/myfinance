"use client";

import { Bot, CheckCircle2, Sparkles, User } from "lucide-react";

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

  return (
    <div
      className={[
        "flex gap-2.5 sm:gap-3",
        isUser ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!isUser && (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm sm:size-9">
          <Bot size={15} />
        </div>
      )}

      <div
        className={[
          "max-w-[88%] rounded-[1.35rem] px-3.5 py-3 text-sm leading-6 shadow-sm sm:max-w-[86%] sm:px-4",
          isUser
            ? "rounded-br-md bg-blue-600 text-white shadow-blue-100"
            : "rounded-bl-md border border-slate-100 bg-white text-slate-700",
        ].join(" ")}
      >
        {!isUser && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 sm:text-[11px]">
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
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 shadow-sm sm:size-9">
          <User size={15} />
        </div>
      )}
    </div>
  );
}
