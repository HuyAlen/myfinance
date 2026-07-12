"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
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

type DisplayField = {
  key: string;
  label: string;
  value: unknown;
};

type CompletedLink = {
  href: string;
  label: string;
};

const FIELD_LABELS: Record<string, string> = {
  categoryName: "Danh mục",
  budgetName: "Ngân sách",
  walletName: "Ví",
  month: "Tháng",
  limitAmount: "Hạn mức",
  oldLimitAmount: "Hạn mức hiện tại",
  newLimitAmount: "Hạn mức mới",
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

const INTERNAL_FIELDS = new Set([
  "title",
  "id",
  "categoryId",
  "budgetId",
  "goalId",
  "walletId",
  "transactionId",
  "userId",
  "ownerId",
  "actionId",
  "pendingActionId",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInternalKey(key: string) {
  return INTERNAL_FIELDS.has(key) || /(^id$|id$)/i.test(key);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function sanitizeDisplayValue(value: unknown): unknown {
  if (isUuid(value)) return undefined;

  if (Array.isArray(value)) {
    const sanitized = value
      .map(sanitizeDisplayValue)
      .filter((item) => item !== undefined);

    return sanitized.length > 0 ? sanitized : undefined;
  }

  if (isRecord(value)) {
    const sanitized = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isInternalKey(key))
        .map(([key, nestedValue]) => [key, sanitizeDisplayValue(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined),
    );

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  return value;
}

function formatMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;

  return `Tháng ${Number(match[2])}/${match[1]}`;
}

function formatValue(key: string, value: unknown) {
  const safeValue = sanitizeDisplayValue(value);

  if (safeValue === undefined || safeValue === null || safeValue === "") {
    return "—";
  }

  if (typeof safeValue === "number") {
    const formatted = new Intl.NumberFormat("vi-VN").format(safeValue);
    return MONEY_FIELDS.has(key) ? `${formatted} đ` : formatted;
  }

  if (typeof safeValue === "string") {
    return key === "month" ? formatMonth(safeValue) : safeValue;
  }

  return JSON.stringify(safeValue);
}

function pendingTitle(action: AIPendingActionCardData) {
  const title = action.preview.title;

  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }

  switch (action.toolName) {
    case "create_budget":
      return "Tạo ngân sách";
    case "update_budget":
      return "Cập nhật ngân sách";
    case "create_goal":
      return "Tạo mục tiêu tài chính";
    default:
      return "Xác nhận hành động";
  }
}

function completedTitle(toolName: string) {
  switch (toolName) {
    case "create_budget":
      return "Đã tạo ngân sách";
    case "update_budget":
      return "Đã cập nhật ngân sách";
    case "create_goal":
      return "Đã tạo mục tiêu tài chính";
    default:
      return "Hành động đã hoàn tất";
  }
}

function titleOf(action: AIPendingActionCardData) {
  return action.status === "completed"
    ? completedTitle(action.toolName)
    : pendingTitle(action);
}

function rawFieldsOf(action: AIPendingActionCardData) {
  const fields = action.preview.fields;
  return isRecord(fields) ? fields : action.preview;
}

function fieldsOf(action: AIPendingActionCardData): DisplayField[] {
  const fields = rawFieldsOf(action);
  const output: DisplayField[] = [];
  const used = new Set<string>();

  const push = (key: string, label: string, value: unknown) => {
    if (isInternalKey(key)) return;

    const safeValue = sanitizeDisplayValue(value);
    if (safeValue === undefined || safeValue === null || safeValue === "") {
      return;
    }

    output.push({ key, label, value: safeValue });
    used.add(key);
  };

  switch (action.toolName) {
    case "create_budget":
      push("categoryName", "Danh mục", fields.categoryName);
      push("month", "Tháng", fields.month);
      push("limitAmount", "Hạn mức", fields.limitAmount);
      break;

    case "update_budget":
      push("budgetName", "Ngân sách", fields.budgetName ?? fields.categoryName);
      push("month", "Tháng", fields.month);
      push("oldLimitAmount", "Hạn mức hiện tại", fields.oldLimitAmount);
      push("newLimitAmount", "Hạn mức mới", fields.newLimitAmount);
      break;

    case "create_goal":
      push("name", "Tên mục tiêu", fields.name);
      push("targetAmount", "Số tiền mục tiêu", fields.targetAmount);
      push("currentAmount", "Đã tích lũy", fields.currentAmount);
      break;
  }

  for (const [key, value] of Object.entries(fields)) {
    if (used.has(key) || isInternalKey(key)) continue;
    push(key, FIELD_LABELS[key] ?? key, value);
  }

  return output;
}

function completedLinkOf(
  action: AIPendingActionCardData,
): CompletedLink | null {
  if (action.status !== "completed") return null;

  switch (action.toolName) {
    case "create_budget":
      return {
        href: "/budgets",
        label: "Xem ngân sách vừa tạo",
      };

    case "update_budget":
      return {
        href: "/budgets",
        label: "Xem ngân sách",
      };

    case "create_goal":
      return {
        href: "/goals",
        label: "Xem mục tiêu vừa tạo",
      };

    default:
      return null;
  }
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
    case "confirmed":
      return "Đang thực thi";
    default:
      return "Chờ xác nhận";
  }
}

function eyebrowOf(status: string) {
  switch (status) {
    case "completed":
      return "Hành động đã hoàn tất";
    case "cancelled":
      return "Hành động đã được hủy";
    case "expired":
      return "Yêu cầu đã hết hạn";
    case "failed":
      return "Hành động chưa hoàn tất";
    case "executing":
    case "confirmed":
      return "AI đang thực thi";
    default:
      return "Xác nhận trước khi thực hiện";
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
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (action.status !== "pending") return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [action.status, action.expiresAt]);

  const expiresAtMs = new Date(action.expiresAt).getTime();
  const expired = expiresAtMs <= now;
  const pending = action.status === "pending" && !expired;
  const visualStatus =
    expired && action.status === "pending" ? "expired" : action.status;

  const displayFields = useMemo(() => fieldsOf(action), [action]);
  const completedLink = useMemo(() => completedLinkOf(action), [action]);

  async function run(type: "confirm" | "cancel") {
    if (!accessToken || !pending || loading) return;

    setLoading(type);
    setError("");

    try {
      const updated =
        type === "confirm"
          ? await confirmAIPendingAction(accessToken, action.id)
          : await cancelAIPendingAction(accessToken, action.id);

      const next: AIPendingActionCardData = {
        id: updated.id,
        toolName: updated.tool_name,
        preview: updated.preview,
        status: updated.status,
        expiresAt: updated.expires_at,
      };

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

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_12px_32px_rgba(37,99,235,0.10)]">
      <div className="flex items-start justify-between gap-4 border-b border-blue-100 bg-linear-to-r from-blue-50 via-cyan-50/70 to-emerald-50/50 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
            <ShieldCheck size={14} />
            {eyebrowOf(visualStatus)}
          </div>

          <h4 className="mt-1.5 text-sm font-black text-slate-900">
            {titleOf({ ...action, status: visualStatus })}
          </h4>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">
          <Clock3 size={11} />
          {pending
            ? remainingLabel(action.expiresAt, now)
            : statusLabel(visualStatus)}
        </span>
      </div>

      <div className="space-y-2 px-4 py-3.5">
        {displayFields.map(({ key, label, value }) => (
          <div
            key={key}
            className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
          >
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <span className="max-w-[65%] wrap-break-word text-right text-xs font-black text-slate-800">
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

      <div className="border-t border-slate-100 px-4 py-3">
        {pending ? (
          <div className="flex gap-2">
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
              {loading === "cancel" ? "Đang hủy..." : "Hủy"}
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
              {loading === "confirm" ? "Đang xác nhận..." : "Xác nhận"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
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

            {completedLink ? (
              <Link
                href={completedLink.href}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
              >
                {completedLink.label}
                <ArrowUpRight size={14} />
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
