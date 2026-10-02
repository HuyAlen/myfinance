import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-MOBILE-VISUAL-VIEWPORT-1", () => {
  it("tracks real iPhone VisualViewport height and top offset", () => {
    expect(source).toContain("window.visualViewport");
    expect(source).toContain("--recurring-visual-viewport-height");
    expect(source).toContain("--recurring-visual-viewport-offset-top");
    expect(source).toContain('viewport?.addEventListener("resize"');
    expect(source).toContain('viewport?.addEventListener("scroll"');
    expect(source).toContain('window.addEventListener("orientationchange"');
  });

  it("binds the mobile editor to the real visible viewport instead of h-dvh", () => {
    expect(source).toContain('data-recurring-mobile-viewport="true"');
    expect(source).toContain(
      'top: "var(--recurring-visual-viewport-offset-top, 0px)"',
    );
    expect(source).toContain(
      'height: "var(--recurring-visual-viewport-height, 100dvh)"',
    );
    expect(source).toContain("flex h-full min-h-0 w-full flex-col");
    expect(source).not.toContain(
      'className="flex h-dvh w-full flex-col overflow-hidden',
    );
  });

  it("keeps scrolling confined to content while footer remains visible", () => {
    expect(source).toContain(
      "touch-pan-y space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain",
    );
    expect(source).toContain("[-webkit-overflow-scrolling:touch]");
    expect(source).toContain(
      "relative z-20 shrink-0 border-t border-slate-100",
    );
    expect(source).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("preserves desktop modal behavior and recurring actions", () => {
    expect(source).toContain("sm:inset-0 sm:h-auto sm:items-center");
    expect(source).toContain("sm:max-w-lg sm:rounded-4xl");
    expect(source).toContain('form="recurring-money-form"');
    expect(source).toContain("requestRecordDueTransaction");
  });
});
