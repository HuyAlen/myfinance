"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  listAIConversations,
  type AIConversationSummary,
} from "@/src/services/finance/ai-agent/aiConversationApi";

type AIConversationHistoryProps = {
  open: boolean;
  accessToken: string;
  activeConversationId: string | null;
  onClose: () => void;
  onSelect: (conversation: AIConversationSummary) => void;
};

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isYesterday(date: Date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

function groupLabel(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Trước đây";
  if (isToday(date)) return "Hôm nay";
  if (isYesterday(date)) return "Hôm qua";

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - 6);
  if (date >= startOfWeek) return "7 ngày qua";

  return date.toLocaleDateString("vi-VN", {
    month: "2-digit",
    year: "numeric",
  });
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (isToday(date) || isYesterday(date)) {
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function AIConversationHistory({
  open,
  accessToken,
  activeConversationId,
  onClose,
  onSelect,
}: AIConversationHistoryProps) {
  const [items, setItems] = useState<AIConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      setError("Phiên đăng nhập đã hết hạn.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      setItems(await listAIConversations(accessToken));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể tải lịch sử trò chuyện.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi-VN");
    if (!normalized) return items;
    return items.filter((item) =>
      item.title.toLocaleLowerCase("vi-VN").includes(normalized),
    );
  }, [items, query]);

  const groups = useMemo(() => {
    const result = new Map<string, AIConversationSummary[]>();
    for (const item of filtered) {
      const label = groupLabel(item.updatedAt || item.createdAt);
      const current = result.get(label) ?? [];
      current.push(item);
      result.set(label, current);
    }
    return Array.from(result.entries());
  }, [filtered]);

  return (
    <aside
      className={[
        "absolute inset-y-0 left-0 z-30 flex w-[86%] max-w-[320px] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 lg:relative lg:z-auto lg:w-[310px] xl:w-[330px] lg:max-w-none lg:shrink-0 lg:shadow-none",
        open ? "translate-x-0" : "-translate-x-full lg:hidden",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-blue-100/70 bg-linear-to-b from-blue-50/70 to-white px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-50 to-cyan-50 text-blue-700 ring-1 ring-blue-100">
            <History size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">Lịch sử chat</h3>
            <p className="text-[10px] font-semibold text-slate-400">
              Mở lại cuộc trò chuyện trước
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
          aria-label="Đóng lịch sử"
        >
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-blue-50/50 px-3 focus-within:border-blue-300 focus-within:bg-white">
          <Search size={14} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm cuộc trò chuyện..."
            className="h-10 min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-50"
            title="Tải lại"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-color:#bfdbfe_transparent] scrollbar-thin">
        {loading && items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
            <LoaderCircle size={20} className="animate-spin" />
            <p className="text-xs font-semibold">Đang tải lịch sử...</p>
          </div>
        ) : error ? (
          <div className="m-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-700">
            {error}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-400">
              <MessageSquareText size={20} />
            </div>
            <p className="mt-3 text-sm font-black text-slate-700">
              Chưa có lịch sử
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-400">
              Các cuộc trò chuyện đã lưu sẽ xuất hiện tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([label, conversations]) => (
              <section key={label}>
                <div className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </div>
                <div className="space-y-1">
                  {conversations.map((conversation) => {
                    const active = conversation.id === activeConversationId;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => onSelect(conversation)}
                        className={[
                          "group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition",
                          active
                            ? "bg-blue-50 text-blue-900 ring-1 ring-blue-100"
                            : "text-slate-700 hover:bg-blue-50",
                        ].join(" ")}
                      >
                        <MessageSquareText
                          size={14}
                          className={
                            active ? "text-blue-600" : "text-slate-400"
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">
                            {conversation.title}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                            {timeLabel(
                              conversation.updatedAt || conversation.createdAt,
                            )}
                            {typeof conversation.messageCount === "number"
                              ? ` · ${conversation.messageCount} tin nhắn`
                              : ""}
                          </p>
                        </div>
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
