"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, Trash2, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
export type ConfirmVariant = "danger" | "warning" | "info";

export type PendingConfirm = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
};

type Props = {
  action: PendingConfirm | null;
  onCancel: () => void;
};

// ─── Variant config ───────────────────────────────────────────────────────────
const VARIANT_CONFIG = {
  danger: {
    iconWrap: "bg-rose-100",
    iconColor: "text-rose-600",
    confirmBtn:
      "bg-rose-600 hover:bg-rose-700 shadow-rose-200/60 focus-visible:ring-rose-400",
    Icon: Trash2,
    defaultConfirmText: "Xóa",
  },
  warning: {
    iconWrap: "bg-amber-100",
    iconColor: "text-amber-600",
    confirmBtn:
      "bg-amber-500 hover:bg-amber-600 shadow-amber-200/60 focus-visible:ring-amber-400",
    Icon: AlertTriangle,
    defaultConfirmText: "Xác nhận",
  },
  info: {
    iconWrap: "bg-blue-100",
    iconColor: "text-blue-600",
    confirmBtn:
      "bg-blue-600 hover:bg-blue-700 shadow-blue-200/60 focus-visible:ring-blue-400",
    Icon: Info,
    defaultConfirmText: "Xác nhận",
  },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────
export default function ConfirmDialog({ action, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const open = !!action;

  // Escape key to cancel
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open || !action) return null;

  const variant = action.variant ?? "danger";
  const cfg = VARIANT_CONFIG[variant];
  const confirmText = action.confirmText ?? cfg.defaultConfirmText;
  const cancelText = action.cancelText ?? "Hủy";

  async function handleConfirm() {
    setLoading(true);
    try {
      await action!.onConfirm();
    } finally {
      setLoading(false);
      onCancel();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/40">
        {/* Close button */}
        <button
          type="button"
          aria-label="Đóng"
          onClick={onCancel}
          disabled={loading}
          className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 disabled:opacity-40"
        >
          <X size={15} />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Icon bubble */}
          <div
            className={[
              "flex size-16 items-center justify-center rounded-3xl",
              cfg.iconWrap,
            ].join(" ")}
          >
            <cfg.Icon size={28} className={cfg.iconColor} />
          </div>

          <div className="space-y-2">
            <h2
              id="confirm-dialog-title"
              className="text-xl font-black text-slate-900"
            >
              {action.title}
            </h2>
            <p className="text-sm leading-6 text-slate-500">
              {action.description}
            </p>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={[
              "flex-1 rounded-2xl py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              cfg.confirmBtn,
            ].join(" ")}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Đang xử lý...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
