"use client";

export const MYFINANCE_SERVICE_WORKER_URL = "/sw.js";
export const MYFINANCE_SERVICE_WORKER_SCOPE = "/";
export const MYFINANCE_SKIP_WAITING_MESSAGE = "MYFINANCE_SKIP_WAITING";

type ServiceWorkerRegistrationTarget = Pick<ServiceWorkerContainer, "register">;
type ServiceWorkerActivationTarget = Pick<ServiceWorker, "postMessage">;

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

export function buildMyFinanceServiceWorkerUrl(
  deploymentRevision: string | undefined,
) {
  const revision = deploymentRevision?.trim() || "unversioned";
  return `${MYFINANCE_SERVICE_WORKER_URL}?rev=${encodeURIComponent(
    revision.slice(0, 96),
  )}`;
}

export function registerMyFinanceServiceWorker(
  serviceWorker: ServiceWorkerRegistrationTarget,
  deploymentRevision: string | undefined,
) {
  return serviceWorker.register(
    buildMyFinanceServiceWorkerUrl(deploymentRevision),
    {
      scope: MYFINANCE_SERVICE_WORKER_SCOPE,
      // Always revalidate the worker script/imports instead of letting an HTTP
      // cache keep an old worker around after a production deployment.
      updateViaCache: "none",
    },
  );
}

export function isMyFinanceServiceWorkerUpdateReady(input: {
  hasController: boolean;
  workerState: ServiceWorkerState | undefined;
}) {
  return input.hasController && input.workerState === "installed";
}

export function requestMyFinanceServiceWorkerActivation(
  worker: ServiceWorkerActivationTarget,
) {
  worker.postMessage({ type: MYFINANCE_SKIP_WAITING_MESSAGE });
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