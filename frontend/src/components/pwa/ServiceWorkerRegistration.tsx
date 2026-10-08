"use client";

import { useEffect } from "react";

import {
  registerMyFinanceServiceWorker,
  serviceWorkerRegistrationErrorMessage,
  shouldRegisterMyFinanceServiceWorker,
} from "@/src/lib/pwa/serviceWorkerRegistration";

export default function ServiceWorkerRegistration() {
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

    const register = () => {
      void registerMyFinanceServiceWorker(navigator.serviceWorker).catch(
        (error: unknown) => {
          if (disposed) return;

          // Registration is progressive enhancement. A failure must not block
          // authentication or the finance application itself.
          console.warn(
            "[PWA] Service worker registration failed:",
            serviceWorkerRegistrationErrorMessage(error),
          );
        },
      );
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
    };
  }, []);

  return null;
}