import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SettingsPage iPhone navigation and control ergonomics (SETTINGS-MOBILE-POLISH-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("keeps a compact mobile page rhythm", () => {
    expect(source).toContain('className="space-y-4 sm:space-y-6"');
    expect(source).toContain('className="min-w-0 flex-1 space-y-5 sm:space-y-8"');
  });

  it("pins the mobile settings navigator to the viewport while preserving desktop navigation", () => {
    expect(source).toContain('aria-label="Điều hướng cài đặt"');
    expect(source).toContain('className="fixed inset-x-0 top-[8.5625rem] z-20');
    expect(source).toContain("md:top-[4.5rem]");
    expect(source).toContain("lg:left-72");
    expect(source).toContain('className="h-[3.75rem] xl:hidden"');
    expect(source).not.toContain('className="sticky top-2 z-20 -mx-1');
    expect(source).toContain('className="hidden w-44 shrink-0 xl:block"');
  });

  it("gives mobile section navigation 44px touch targets", () => {
    expect(source).toContain('"flex min-h-11 shrink-0 items-center');
  });

  it("offsets sections for the fixed mobile navigator", () => {
    for (const id of ["profile", "preferences", "financial", "ai", "notifications", "data", "security", "sync", "system", "danger"]) {
      expect(source).toContain(`id="settings-${id}" className="scroll-mt-20"`);
    }
  });

  it("turns account stats into a swipeable snap rail on phones", () => {
    expect(source).toContain("snap-x");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("snap-start");
  });

  it("keeps the account header compact and does not truncate email", () => {
    expect(source).toContain("size-12");
    expect(source).toContain("break-all text-xs");
    expect(source).not.toContain("mt-0.5 truncate text-sm text-slate-500");
  });

  it("does not present a hardcoded Premium entitlement", () => {
    expect(normalized).not.toContain("> Premium <");
  });

  it("uses Vietnamese AI navigation labels", () => {
    expect(source).toContain('{ id: "ai", label: "Trợ lý AI", icon: Bot }');
    expect(source).toContain('title="Trợ lý AI"');
  });

  it("uses compact mobile card padding while retaining desktop density", () => {
    expect(source).toContain("p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6");
  });

  it("prevents iPhone form auto zoom with 16px mobile input text", () => {
    expect(source).toContain("text-base outline-none sm:text-sm");
  });

  it("gives toggle controls a 44px hit target without visually enlarging the switch track", () => {
    expect(source).toContain('className="flex size-11 shrink-0 items-center justify-center');
    expect(source).toContain('"relative inline-flex h-6 w-11 items-center');
    expect(source).toContain("aria-pressed={checked}");
  });

  it("does not imply unsupported security actions are available", () => {
    expect(source).toContain('desc="Trạng thái bảo mật hiện có"');
    expect(source).toContain('status: "Chưa hỗ trợ"');
    expect(source).toContain('desc: "Quản lý phiên chưa khả dụng"');
  });

  it("preserves SETTINGS-CORRECTNESS-1 safety and readiness contracts", () => {
    expect(source).toContain("SETTINGS_STATS_TIMEOUT_MS = 10_000");
    expect(source).toContain("SETTINGS_INITIAL_RETRY_MS = 750");
    expect(source).toContain("recoveryInFlightRef");
    expect(source).toContain("window.localStorage.setItem");
    expect(source).toContain("testAIFinanceConnection(accessToken)");
  });
});
