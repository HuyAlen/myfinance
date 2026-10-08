import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function readFrontend(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const routeError = readFrontend("app/error.tsx");
const globalError = readFrontend("app/global-error.tsx");
const helper = readFrontend("src/lib/errorRecovery.ts");
const authProvider = readFrontend("src/components/auth/AuthProvider.tsx");
const authRecovery = readFrontend(
  "src/components/auth/AuthBootstrapRecovery.tsx",
);
const appShell = readFrontend("src/components/layout/AppShell.tsx");

describe("APP-ERROR-RECOVERY-1 — P2", () => {
  it("defines a client route error boundary with reset and hard-reload recovery", () => {
    expect(routeError).toMatch(/^"use client";/);
    expect(routeError).toContain("reset: () => void");
    expect(routeError).toContain("onClick={() => reset()}");
    expect(routeError).toContain("window.location.reload()");
    expect(routeError).toContain('role="alert"');
  });

  it("warns against blindly repeating a possibly committed finance mutation", () => {
    expect(routeError).toContain(
      "kiểm tra trạng thái hiện tại trước khi thực hiện lại",
    );
    expect(globalError).toContain(
      "kiểm tra lại",
    );
    expect(globalError).toContain(
      "trước khi thực hiện thao tác",
    );
  });

  it("defines a self-contained global boundary for root-layout failures", () => {
    expect(globalError).toMatch(/^"use client";/);
    expect(globalError).toContain('<html lang="vi">');
    expect(globalError).toContain("<body>");
    expect(globalError).toContain("<style>{GLOBAL_ERROR_STYLES}</style>");
    expect(globalError).toContain("reset: () => void");
    expect(globalError).toContain("onClick={() => reset()}");
    expect(globalError).toContain("window.location.reload()");
  });

  it("never renders or logs raw runtime error messages", () => {
    expect(routeError).not.toContain("error.message");
    expect(globalError).not.toContain("error.message");
    expect(helper).not.toContain("error.message");
    expect(routeError).toContain("getSafeErrorReference(error)");
    expect(globalError).toContain("getSafeErrorReference(error)");
  });

  it("limits support references to sanitized Next digests", () => {
    expect(helper).toContain("SAFE_ERROR_REFERENCE_PATTERN");
    expect(helper).toContain("error.digest");
    expect(helper).toContain("Unexpected runtime error. Reference:");
  });

  it("preserves auth bootstrap failure as an explicit recoverable state", () => {
    expect(authProvider).toContain("bootstrapError: boolean");
    expect(authProvider).toContain("retryAuthBootstrap: () => void");
    expect(authProvider).toContain("setBootstrapError(true)");
    expect(authProvider).toContain("setBootstrapError(false)");
    expect(authProvider).toContain("setBootstrapAttempt");
    expect(authProvider).toContain("message.slice(0, 240)");
  });

  it("does not redirect an unresolved auth infrastructure failure to /login", () => {
    expect(appShell).toContain(
      "const { user, loading, bootstrapError, retryAuthBootstrap } = useAuth()",
    );
    expect(appShell).toContain("!bootstrapError");
    expect(appShell).toContain(
      "<AuthBootstrapRecovery onRetry={retryAuthBootstrap} />",
    );
    expect(appShell).toMatch(
      /if \(!loading && !user && !bootstrapError\)[\s\S]*router\.replace\("\/login"\)/,
    );
  });

  it("gives auth bootstrap recovery both retry-in-place and hard-reload paths", () => {
    expect(authRecovery).toContain("onClick={onRetry}");
    expect(authRecovery).toContain("window.location.reload()");
    expect(authRecovery).toContain("Không thể kiểm tra phiên đăng nhập");
    expect(authRecovery).toContain('role="alert"');
  });
});