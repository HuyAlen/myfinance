"use client";

import { AlertCircle, X } from "lucide-react";

/**
 * Inline error banner shown inside forms when a Supabase write fails.
 * Pass `message={null}` (or omit) to render nothing.
 */
export function SaveError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 size-4 flex-shrink-0 text-red-500" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng thông báo lỗi"
          className="flex-shrink-0 text-red-400 hover:text-red-600"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
