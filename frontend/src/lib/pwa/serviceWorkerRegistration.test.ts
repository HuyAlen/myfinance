import { describe, expect, it, vi } from "vitest";

import {
  buildMyFinanceServiceWorkerUrl,
  MYFINANCE_SERVICE_WORKER_SCOPE,
  MYFINANCE_SERVICE_WORKER_URL,
  registerMyFinanceServiceWorker,
  serviceWorkerRegistrationErrorMessage,
  shouldRegisterMyFinanceServiceWorker,
} from "./serviceWorkerRegistration";

describe("PWA-SERVICE-WORKER-REGISTRATION-1 helper", () => {
  it("registers only in a secure production browser with service-worker support", () => {
    expect(
      shouldRegisterMyFinanceServiceWorker({
        nodeEnv: "production",
        serviceWorkerSupported: true,
        secureContext: true,
      }),
    ).toBe(true);

    for (const input of [
      {
        nodeEnv: "development",
        serviceWorkerSupported: true,
        secureContext: true,
      },
      {
        nodeEnv: "test",
        serviceWorkerSupported: true,
        secureContext: true,
      },
      {
        nodeEnv: "production",
        serviceWorkerSupported: false,
        secureContext: true,
      },
      {
        nodeEnv: "production",
        serviceWorkerSupported: true,
        secureContext: false,
      },
    ]) {
      expect(shouldRegisterMyFinanceServiceWorker(input)).toBe(false);
    }
  });

  it("builds a deployment-revision worker URL without changing the root worker path", () => {
    expect(buildMyFinanceServiceWorkerUrl("abc123")).toBe(
      `${MYFINANCE_SERVICE_WORKER_URL}?rev=abc123`,
    );
    expect(buildMyFinanceServiceWorkerUrl(" release 1 ")).toBe(
      `${MYFINANCE_SERVICE_WORKER_URL}?rev=release%201`,
    );
    expect(buildMyFinanceServiceWorkerUrl(undefined)).toBe(
      `${MYFINANCE_SERVICE_WORKER_URL}?rev=unversioned`,
    );
  });

  it("bounds the deployment revision before registering the worker", () => {
    const revision = "x".repeat(200);
    const workerUrl = buildMyFinanceServiceWorkerUrl(revision);
    const queryRevision = new URL(workerUrl, "https://example.com").searchParams.get(
      "rev",
    );

    expect(queryRevision).toHaveLength(96);
  });

  it("registers the revisioned root worker with a root scope and bypasses HTTP cache for updates", async () => {
    const registration = { scope: "https://example.com/" };
    const register = vi.fn().mockResolvedValue(registration);
    const serviceWorker = { register } as unknown as Pick<
      ServiceWorkerContainer,
      "register"
    >;

    await expect(
      registerMyFinanceServiceWorker(serviceWorker, "abc123"),
    ).resolves.toBe(registration);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      `${MYFINANCE_SERVICE_WORKER_URL}?rev=abc123`,
      {
        scope: MYFINANCE_SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      },
    );
  });

  it("keeps registration failures non-fatal and bounded for production logs", () => {
    const longMessage = "x".repeat(500);

    expect(
      serviceWorkerRegistrationErrorMessage(new Error("registration failed")),
    ).toBe("registration failed");
    expect(serviceWorkerRegistrationErrorMessage(longMessage)).toHaveLength(240);
    expect(serviceWorkerRegistrationErrorMessage({ reason: "secret" })).toBe(
      "Unknown service worker registration error.",
    );
  });
});