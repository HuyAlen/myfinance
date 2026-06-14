"use client";

type ToastPayload =
  | string
  | {
      title?: string;
      message?: string;
      description?: string;
      variant?: "success" | "error" | "info" | "destructive" | "warning";
    };

function showToast(payload: ToastPayload) {
  const message =
    typeof payload === "string"
      ? payload
      : payload.message || payload.description || payload.title || "Thông báo";

  console.log("TOAST:", message);
}

export function useToast() {
  return {
    toast: showToast,
    success: (message: string) => showToast({ message, variant: "success" }),
    error: (message: string) => showToast({ message, variant: "error" }),
    info: (message: string) => showToast({ message, variant: "info" }),
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
