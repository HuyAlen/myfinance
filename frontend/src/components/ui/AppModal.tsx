"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
export type AppModalSize = "sm" | "md" | "lg" | "xl";

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Optional icon node rendered in a gradient bubble in the header */
  icon?: ReactNode;
  size?: AppModalSize;
  children: ReactNode;
};

const SIZE_CLASS: Record<AppModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function AppModal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  children,
}: AppModalProps) {
  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/20 p-4 backdrop-blur-sm sm:items-center"
    >
      {/* Click-outside overlay */}
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      {/* Panel */}
      <div
        className={[
          "relative max-h-[92dvh] w-full overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl",
          SIZE_CLASS[size],
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
                {icon}
              </div>
            )}
            <div>
              <h2
                id="app-modal-title"
                className="text-xl font-black text-slate-900"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-sm text-slate-400">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div>{children}</div>
      </div>
    </div>
  );
}
