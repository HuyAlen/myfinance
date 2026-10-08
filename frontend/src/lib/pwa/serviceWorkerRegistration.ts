"use client";

export const MYFINANCE_SERVICE_WORKER_URL = "/sw.js";
export const MYFINANCE_SERVICE_WORKER_SCOPE = "/";

type ServiceWorkerRegistrationTarget = Pick<ServiceWorkerContainer, "register">;

export function shouldRegisterMyFinanceServiceWorker(input: {
  nodeEnv: string | undefined;
  serviceWorkerSupported: boolean;
  secureContext: boolean;
}) {
  return (
    input.nodeEnv === "production" &&
    input.serviceWorkerSupported &&
    input.secureContext
  );
}

export function registerMyFinanceServiceWorker(
  serviceWorker: ServiceWorkerRegistrationTarget,
) {
  return serviceWorker.register(MYFINANCE_SERVICE_WORKER_URL, {
    scope: MYFINANCE_SERVICE_WORKER_SCOPE,
    // Always revalidate the worker script/imports instead of letting an HTTP
    // cache keep an old worker around after a production deployment.
    updateViaCache: "none",
  });
}

export function serviceWorkerRegistrationErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown service worker registration error.";

  // Keep production logs bounded; registration errors do not need stack traces
  // or arbitrary payload serialization.
  return message.slice(0, 240);
}