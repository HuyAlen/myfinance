import { describe, expect, it, vi } from "vitest";

import {
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

  it("registers the root worker with a root scope and bypasses HTTP cache for updates", async () => {
    const registration = { scope: "https://example.com/" };
    const register = vi.fn().mockResolvedValue(registration);
    const serviceWorker = { register } as unknown as Pick<
      ServiceWorkerContainer,
      "register"
    >;

    await expect(
      registerMyFinanceServiceWorker(serviceWorker),
    ).resolves.toBe(registration);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(MYFINANCE_SERVICE_WORKER_URL, {
      scope: MYFINANCE_SERVICE_WORKER_SCOPE,
      updateViaCache: "none",
    });
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