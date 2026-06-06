"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
export type ToastVariant = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  toast: (opts: { variant: ToastVariant; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ─── Provider ────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    ({ variant, message }: { variant: ToastVariant; message: string }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, variant, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — fixed bottom-right */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 right-4 z-[9999] flex flex-col items-end gap-2.5 sm:right-6"
      >
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext);
}

// ─── Toast message ────────────────────────────────────────────────────────────
const VARIANT_STYLES: Record<
  ToastVariant,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    text: string;
    Icon: typeof CheckCircle2;
  }
> = {
  success: {
    border: "border-emerald-200",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    text: "text-emerald-900",
    Icon: CheckCircle2,
  },
  error: {
    border: "border-rose-200",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    text: "text-rose-900",
    Icon: AlertCircle,
  },
  warning: {
    border: "border-amber-200",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    text: "text-amber-900",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-blue-200",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    text: "text-blue-900",
    Icon: Info,
  },
};

function ToastMessage({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const s = VARIANT_STYLES[item.variant];
  return (
    <div
      role="alert"
      className={[
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl shadow-slate-200/80",
        s.border,
      ].join(" ")}
    >
      <div
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-xl",
          s.iconBg,
        ].join(" ")}
      >
        <s.Icon size={16} className={s.iconColor} />
      </div>
      <p className={"flex-1 text-sm font-bold leading-5 " + s.text}>
        {item.message}
      </p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
}
