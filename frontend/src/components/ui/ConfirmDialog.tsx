"use client";

import { useRef, useState } from "react";

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
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">
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
