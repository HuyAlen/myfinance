import { describe, expect, it, vi } from "vitest";

import {
  getSafeErrorReference,
  reportUnexpectedAppError,
} from "./errorRecovery";

describe("APP-ERROR-RECOVERY-1 helpers", () => {
  it("surfaces a bounded safe Next digest as a support reference", () => {
    expect(getSafeErrorReference({ digest: "12345-abcd:route_1" })).toBe(
      "12345-abcd:route_1",
    );
  });

  it("rejects missing, malformed, or oversized references", () => {
    expect(getSafeErrorReference({})).toBeNull();
    expect(getSafeErrorReference({ digest: "contains secret/value" })).toBeNull();
    expect(getSafeErrorReference({ digest: "x".repeat(97) })).toBeNull();
  });

  it("never logs the original error message or arbitrary error payload", () => {
    const logger = vi.fn();
    const error = Object.assign(
      new Error("account=123456789; token=secret-value"),
      {
        digest: "safe-ref-42",
      },
    );

    reportUnexpectedAppError("AppErrorBoundary", error, logger);

    expect(logger).toHaveBeenCalledTimes(1);
    const logged = String(logger.mock.calls[0]?.[0] ?? "");

    expect(logged).toContain("safe-ref-42");
    expect(logged).not.toContain("123456789");
    expect(logged).not.toContain("secret-value");
    expect(logged).not.toContain(error.message);
  });

  it("still emits a generic diagnostic when no safe reference exists", () => {
    const logger = vi.fn();

    reportUnexpectedAppError(
      "GlobalErrorBoundary",
      { digest: "bad/reference" },
      logger,
    );

    expect(logger).toHaveBeenCalledWith(
      "[GlobalErrorBoundary] Unexpected runtime error.",
    );
  });
});