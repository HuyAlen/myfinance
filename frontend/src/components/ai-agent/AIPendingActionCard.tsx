"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import {
  cancelAIPendingAction,
  confirmAIPendingAction,
} from "@/src/services/finance/ai-agent/aiPendingActionApi";

export type AIPendingActionCardData = {
  id: string;
  toolName: string;
  preview: Record<string, unknown>;
  status: string;
  expiresAt: string;
};

type Props = {
  action: AIPendingActionCardData;
  accessToken: string;
  onChanged?: (action: AIPendingActionCardData) => void;
};

const FIELD_LABELS: Record<string, string> = {
  categoryId: "Danh mục",
  categoryName: "Tên danh mục",
  month: "Tháng",
  limitAmount: "Hạn mức",
  oldLimitAmount: "Hạn mức hiện tại",
  newLimitAmount: "Hạn mức mới",
  budgetId: "Ngân sách",
  name: "Tên mục tiêu",
  targetAmount: "Số tiền mục tiêu",
  currentAmount: "Đã tích lũy",
};

const MONEY_FIELDS = new Set([
  "limitAmount",
  "oldLimitAmount",
  "newLimitAmount",
  "targetAmount",
  "currentAmount",
]);

function formatValue(key: string, value: unknown) {
  if (typeof value === "number") {
    const formatted = new Intl.NumberFormat("vi-VN").format(value);
    return MONEY_FIELDS.has(key) ? `${formatted} đ` : formatted;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "—";
  }

  return JSON.stringify(value);
}

function titleOf(action: AIPendingActionCardData) {
  const title = action.preview.title;

  if (typeof title === "string" && title.trim()) {
    return title;
  }

  return action.toolName;
}

function fieldsOf(action: AIPendingActionCardData) {
  const fields = action.preview.fields;

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return action.preview;
  }

  return fields as Record<string, unknown>;
}

function statusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Đã hoàn tất";
    case "cancelled":
      return "Đã hủy";
    case "expired":
      return "Đã hết hạn";
    case "failed":
      return "Thất bại";
    case "executing":
      return "Đang thực thi";
    default:
      return "Chờ xác nhận";
  }
}

function remainingLabel(expiresAt: string, now: number) {
  const remaining = new Date(expiresAt).getTime() - now;

  if (remaining <= 0) return "Đã hết hạn";

  const minutes = Math.ceil(remaining / 60_000);
  return `Còn ${minutes} phút`;
}

export default function AIPendingActionCard({
  action,
  accessToken,
  onChanged,
}: Props) {
  const [current, setCurrent] = useState(action);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date().getTime());

  useEffect(() => {
    if (current.status !== "pending") return;

    const timer = window.setInterval(() => {
      setNow(new Date().getTime());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [current.status, current.expiresAt]);

  const expiresAtMs = new Date(current.expiresAt).getTime();
  const expired = expiresAtMs <= now;
  const pending = current.status === "pending" && !expired;

  async function run(type: "confirm" | "cancel") {
    if (!accessToken || !pending || loading) return;

    setLoading(type);
    setError("");

    try {
      const updated =
        type === "confirm"
          ? await confirmAIPendingAction(accessToken, current.id)
          : await cancelAIPendingAction(accessToken, current.id);

      const next: AIPendingActionCardData = {
        id: updated.id,
        toolName: updated.tool_name,
        preview: updated.preview,
        status: updated.status,
        expiresAt: updated.expires_at,
      };

      setCurrent(next);
      onChanged?.(next);

      if (type === "confirm" && next.status === "completed") {
        window.dispatchEvent(
          new CustomEvent("myfinance:data-changed", {
            detail: {
              source: "ai",
              toolName: next.toolName,
            },
          }),
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể cập nhật hành động.",
      );
    } finally {
      setLoading(null);
    }
  }

  const visualStatus =
    expired && current.status === "pending" ? "expired" : current.status;

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4 border-b border-blue-100 bg-linear-to-r from-blue-50 to-cyan-50/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
            <ShieldCheck size={14} />
            Yêu cầu phê duyệt từ AI
          </div>
          <h4 className="mt-1.5 text-sm font-black text-slate-900">
            {titleOf(current)}
          </h4>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">
          <Clock3 size={11} />
          {pending
            ? remainingLabel(current.expiresAt, now)
            : statusLabel(visualStatus)}
        </span>
      </div>

      <div className="space-y-2 px-4 py-3.5">
        {Object.entries(fieldsOf(current)).map(([key, value]) => (
          <div
            key={key}
            className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
          >
            <span className="text-xs font-bold text-slate-500">
              {FIELD_LABELS[key] ?? key}
            </span>
            <span className="text-right text-xs font-black text-slate-800">
              {formatValue(key, value)}
            </span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mx-4 mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
        {pending ? (
          <>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => void run("cancel")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "cancel" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <X size={14} />
              )}
              Hủy
            </button>

            <button
              type="button"
              disabled={loading !== null}
              onClick={() => void run("confirm")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "confirm" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Xác nhận
            </button>
          </>
        ) : (
          <div
            className={[
              "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black",
              visualStatus === "completed"
                ? "bg-emerald-50 text-emerald-700"
                : visualStatus === "failed"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-50 text-slate-600",
            ].join(" ")}
          >
            {visualStatus === "completed" ? (
              <CheckCircle2 size={14} />
            ) : visualStatus === "failed" ? (
              <XCircle size={14} />
            ) : null}
            {statusLabel(visualStatus)}
          </div>
        )}
      </div>
    </section>
  );
}
