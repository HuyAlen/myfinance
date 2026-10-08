"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import {
  isMyFinanceServiceWorkerUpdateReady,
  registerMyFinanceServiceWorker,
  requestMyFinanceServiceWorkerActivation,
  serviceWorkerRegistrationErrorMessage,
  shouldRegisterMyFinanceServiceWorker,
} from "@/src/lib/pwa/serviceWorkerRegistration";

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateVisible, setUpdateVisible] = useState(false);
  const updateRequestedRef = useRef(false);
  const reloadTriggeredRef = useRef(false);

  useEffect(() => {
    const serviceWorkerSupported = "serviceWorker" in navigator;

    if (
      !shouldRegisterMyFinanceServiceWorker({
        nodeEnv: process.env.NODE_ENV,
        serviceWorkerSupported,
        secureContext: window.isSecureContext,
      })
    ) {
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const revealUpdate = (worker: ServiceWorker | null) => {
      if (
        disposed ||
        !worker ||
        !isMyFinanceServiceWorkerUpdateReady({
          hasController: Boolean(navigator.serviceWorker.controller),
          workerState: worker.state,
        })
      ) {
        return;
      }

      setWaitingWorker(worker);
      setUpdateVisible(true);
    };

    const onInstallingStateChange = () => {
      if (!installingWorker) return;
      revealUpdate(installingWorker);
    };

    const detachInstallingWorker = () => {
      installingWorker?.removeEventListener(
        "statechange",
        onInstallingStateChange,
      );
      installingWorker = null;
    };

    const onUpdateFound = () => {
      detachInstallingWorker();
      installingWorker = registration?.installing ?? null;

      if (!installingWorker) return;

      installingWorker.addEventListener(
        "statechange",
        onInstallingStateChange,
      );
      onInstallingStateChange();
    };

    const onControllerChange = () => {
      if (
        !updateRequestedRef.current ||
        reloadTriggeredRef.current ||
        disposed
      ) {
        return;
      }

      reloadTriggeredRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const register = () => {
      void registerMyFinanceServiceWorker(
        navigator.serviceWorker,
        process.env.NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION,
      )
        .then((nextRegistration) => {
          if (disposed) return;

          registration = nextRegistration;
          revealUpdate(nextRegistration.waiting);
          nextRegistration.addEventListener("updatefound", onUpdateFound);
        })
        .catch((error: unknown) => {
          if (disposed) return;

          // Registration is progressive enhancement. A failure must not block
          // authentication or the finance application itself.
          console.warn(
            "[PWA] Service worker registration failed:",
            serviceWorkerRegistrationErrorMessage(error),
          );
        });
    };

    // Do not compete with the critical application/auth bootstrap for network
    // and main-thread work. Once the document has loaded, registration is safe
    // to start immediately; otherwise wait for the one-shot load event.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      registration?.removeEventListener("updatefound", onUpdateFound);
      detachInstallingWorker();
    };
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;

    try {
      updateRequestedRef.current = true;
      requestMyFinanceServiceWorkerActivation(waitingWorker);
      setUpdateVisible(false);
    } catch (error) {
      updateRequestedRef.current = false;
      setUpdateVisible(true);
      console.warn(
        "[PWA] Service worker activation request failed:",
        serviceWorkerRegistrationErrorMessage(error),
      );
    }
  };

  if (!updateVisible || !waitingWorker) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 lg:left-auto lg:right-6 lg:top-6 lg:w-96">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-2xl shadow-blue-100 backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <RefreshCw size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900">
              Phiên bản mới đã sẵn sàng
            </p>
            <p className="mt-0.5 text-sm leading-5 text-slate-500">
              Cập nhật khi bạn sẵn sàng. Phiên hiện tại sẽ không bị gián đoạn.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setUpdateVisible(false)}
            aria-label="Để sau"
            className="shrink-0 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleUpdate}
            className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Cập nhật ngay
          </button>
          <button
            type="button"
            onClick={() => setUpdateVisible(false)}
            className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}