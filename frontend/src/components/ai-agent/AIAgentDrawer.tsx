"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Clock3,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import AIChatInput from "./AIChatInput";
import AIChatMessageBubble, { type AIChatMessage } from "./AIChatMessage";
import AIContextCard from "./AIContextCard";
import AIQuickStats from "./AIQuickStats";
import AIInsightPanel from "./AIInsightPanel";
import {
  buildAIFinanceContext,
  type AIFinanceContext,
} from "@/src/services/finance/ai-agent/aiFinanceContext";
import { buildAIFinanceRuleInsights } from "@/src/services/finance/ai-agent/aiFinanceRules";
import { buildAIFinanceChatResponse } from "@/src/services/finance/ai-agent/aiFinanceChatEngine";

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
    title: "Tổng quan tài chính",
    description: "Xem sức khỏe tài chính.",
    question: "Tổng quan tài chính tháng này của tôi thế nào?",
  },
  {
    label: "Chi tiêu",
    title: "Chi nhiều nhất ở đâu?",
    description: "Tìm nhóm chi lớn.",
    question: "Tháng này tôi tiêu nhiều nhất ở đâu?",
  },
  {
    label: "Ngân sách",
    title: "Ngân sách sắp vượt?",
    description: "Ưu tiên nhóm cần giảm.",
    question: "Ngân sách nào sắp vượt?",
  },
  {
    label: "Dòng tiền",
    title: "Dự báo dòng tiền",
    description: "Ước lượng cuối tháng.",
    question: "Dự báo dòng tiền tháng này giúp tôi",
  },
  {
    label: "Mục tiêu",
    title: "Tiến độ mục tiêu",
    description: "Kiểm tra mục tiêu chậm.",
    question: "Mục tiêu tài chính của tôi đang thế nào?",
  },
  {
    label: "Cảnh báo",
    title: "Cảnh báo cần xử lý",
    description: "Xem rủi ro ưu tiên.",
    question: "Tôi có cảnh báo tài chính nào cần xử lý không?",
  },
];

const thinkingSteps = [
  "Đọc Finance Context",
  "Chạy Rule Insights",
  "Xếp hạng rủi ro",
  "Soạn câu trả lời",
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
    content:
      "📊 Tổng quan\nXin chào, tôi là MyFinance AI — trợ lý tài chính cá nhân của bạn.\n\n🔍 Phân tích\nTôi sẽ đọc Finance Context thật, chạy Rule Insights hiện tại và ưu tiên các cảnh báo quan trọng.\n\n💡 Gợi ý\nBạn có thể hỏi về ngân sách, chi tiêu, dòng tiền, ví tiền hoặc mục tiêu tài chính.",
    createdAt: getTimeLabel(),
  };
}

export default function AIAgentDrawer({ open, onClose }: AIAgentDrawerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(0);
  const contextRequestRef = useRef(0);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
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
    if (contextLoading) return "Updating context";
    if (contextError) return "Context error";
    if (financeContext)
      return `${financeContext.counts.transactions} giao dịch • ${ruleInsights.length} insight`;
    return "Waiting for context";
  }, [contextError, contextLoading, financeContext, ruleInsights.length]);

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
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [open, messages, loading]);

  function handleReloadContext() {
    loadFinanceContext();
  }

  function handleAsk(value?: string) {
    const question = (value ?? input).trim();
    if (!question || loading) return;

    const userMessage: AIChatMessage = {
      id: nextMessageId("user"),
      role: "user",
      content: question,
      createdAt: getTimeLabel(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    window.setTimeout(() => {
      const response = buildAIFinanceChatResponse({
        question,
        context: financeContext,
        maxInsights: 4,
      });

      const assistantMessage: AIChatMessage = {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: response.answer,
        createdAt: getTimeLabel(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
    }, 360);
  }

  function handleClearChat() {
    setMessages([createWelcomeMessage(nextMessageId("welcome-reset"))]);
  }

  if (!open) return null;

  return (
    <section
      className={[
        "fixed z-80 flex flex-col overflow-hidden bg-white shadow-2xl",
        "inset-x-0 bottom-0 h-[min(94vh,var(--app-height))] rounded-t-4xl",
        "lg:inset-y-4 lg:right-4 lg:left-auto lg:h-auto lg:w-110 lg:rounded-4xl",
      ].join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label="AI Finance Agent"
    >
      <header className="border-b border-slate-100 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200">
              <Sparkles size={21} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-black text-slate-900">
                  MyFinance AI
                </h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">
                  AI-5.3
                </span>
              </div>
              <p className="truncate text-xs font-semibold text-slate-400">
                Personal CFO Copilot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReloadContext}
              disabled={contextLoading}
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
              onClick={handleClearChat}
              className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              aria-label="Xoá chat"
            >
              <Trash2 size={16} />
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
            Live Context
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-blue-600">
            <Activity size={12} />
            {contextStatusLabel}
          </span>
          {urgentInsightCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-amber-600">
              {urgentInsightCount} cần xử lý
            </span>
          )}
        </div>
      </header>

      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5"
      >
        <div className="mb-4 space-y-3">
          <AIContextCard context={financeContext} />
          <AIQuickStats context={financeContext} />
          <AIInsightPanel insights={ruleInsights} />
          {contextError && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {contextError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {messages.map((message) => (
            <AIChatMessageBubble key={message.id} message={message} />
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <Bot size={16} />
              </div>
              <div className="w-[86%] rounded-[1.35rem] rounded-bl-md border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                    <Sparkles size={14} className="text-blue-600" />
                    AI đang phân tích
                  </div>
                  <Clock3 size={13} className="animate-pulse text-slate-300" />
                </div>
                <div className="space-y-2">
                  {thinkingSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-2">
                      <span
                        className={[
                          "size-2 rounded-full",
                          index === 0
                            ? "animate-pulse bg-blue-600"
                            : "bg-slate-200",
                        ].join(" ")}
                      />
                      <span className="text-[11px] font-bold text-slate-500">
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {!hasUserMessage && (
          <section className="mt-5 rounded-3xl border border-blue-100 bg-linear-to-br from-blue-50 to-cyan-50 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Bot size={18} className="text-blue-600" />
                  Gợi ý bắt đầu
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Chọn nhanh để test AI-5.3 với dữ liệu thật.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickQuestions.map((item) => (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => handleAsk(item.question)}
                  className="rounded-2xl border border-white/80 bg-white/85 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">
                    {item.label}
                  </p>
                  <h3 className="mt-1 text-[13px] font-black leading-5 text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] font-semibold leading-4 text-slate-400">
                    {item.description}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-100 bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <AIChatInput
          value={input}
          loading={loading || contextLoading}
          onChange={setInput}
          onSubmit={() => handleAsk()}
        />
        <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">
          ⚠ AI có thể mắc sai sót. Hãy kiểm tra lại dữ liệu.
        </p>
      </footer>
    </section>
  );
}
