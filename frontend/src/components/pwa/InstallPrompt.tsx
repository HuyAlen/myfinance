"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-prompt-dismissed";
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed — no prompt needed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Dismissed recently
    const ts = localStorage.getItem(DISMISS_KEY);
    if (ts && Date.now() - Number(ts) < DISMISS_TTL) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    /* On mobile: sits above bottom nav (bottom-20).
       On desktop (lg+): anchored to bottom-right (bottom-6 right-6). */
    <div className="fixed bottom-20 inset-x-4 z-50 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      <div className="rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-2xl shadow-blue-100 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Download size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900">Thêm vào màn hình chính</p>
            <p className="mt-0.5 text-sm leading-5 text-slate-500">
              Cài đặt MyFinance để truy cập nhanh, không cần trình duyệt.
            </p>
          </div>

          <button
            onClick={handleDismiss}
            aria-label="Bỏ qua"
            className="shrink-0 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Cài đặt ngay
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
