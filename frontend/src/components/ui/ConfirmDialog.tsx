"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PendingConfirm = {
  title?: string;
  message?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void | Promise<void>;
};

type ConfirmDialogProps = {
  action?: PendingConfirm | null;
  onCancel: () => void;
};

export default function ConfirmDialog({
  action,
  onCancel,
}: ConfirmDialogProps) {
  // TXN-FLOW-1: every caller (delete, bulk-delete, and any other confirm
  // flow across the app) shares this one dialog, so the re-entry guard
  // belongs here rather than duplicated per caller. `isConfirming` is
  // reset by the same click handler that set it — right after
  // action.onConfirm() settles and onCancel() closes the dialog — so no
  // effect is needed to keep it in sync with `action` changing.
  const [isConfirming, setIsConfirming] = useState(false);
  const isConfirmingRef = useRef(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Always call the latest onCancel without needing it in the Escape
  // effect's dependency array (avoids reinstalling that listener on every
  // render just because the parent passed a fresh inline callback). The
  // ref is updated in its own effect, not during render, per
  // react-hooks/refs.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  // TXN-UX-1: installed only while a confirmation is pending, cleaned up
  // when it closes — no permanent global listener. Escape while idle
  // behaves exactly like clicking Cancel; Escape while `isConfirming` is
  // ignored, matching the already-disabled Cancel button (a mutation is
  // in flight — the same interaction contract for mouse and keyboard).
  useEffect(() => {
    if (!action) return;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (isConfirmingRef.current) return;
      onCancelRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [action]);

  if (!action) return null;

  async function handleConfirm() {
    if (isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    setIsConfirming(true);
    try {
      await action!.onConfirm();
    } finally {
      isConfirmingRef.current = false;
      setIsConfirming(false);
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl outline-none"
      >
        <h3 id={titleId} className="text-lg font-bold text-slate-900">
          {action.title || "Xác nhận"}
        </h3>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          {action.description || action.message || "Bạn có chắc muốn tiếp tục?"}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {action.cancelText || "Hủy"}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className="rounded-2xl bg-rose-500 px-5 py-3 font-semibold text-white shadow-lg shadow-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConfirming ? "Đang xử lý..." : action.confirmText || "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}
