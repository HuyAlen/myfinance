import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const recurring = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const polish1 = readFileSync(
  path.resolve(__dirname, "RecurringUiPolish1.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const viewportIntegrity = readFileSync(
  path.resolve(__dirname, "../layout/MobileViewportOverlayIntegrity.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const xLock = readFileSync(
  path.resolve(__dirname, "../layout/MobileOverlayXLock1.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-MOBILE-VISUAL-VIEWPORT-1 hotfix v2", () => {
  it("keeps POLISH-1 aligned with the visual-viewport mobile shell", () => {
    expect(polish1).toContain('data-recurring-mobile-viewport="true"');
    expect(polish1).toContain("fixed inset-x-0 z-100");
    expect(polish1).not.toContain(
      "fixed inset-0 overflow-x-hidden z-100 flex items-stretch justify-center bg-slate-950/55",
    );
    expect(polish1).not.toContain(
      "flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl",
    );
  });

  it("teaches the global viewport contract about the recurring exception", () => {
    expect(viewportIntegrity).toContain(
      'const recurring = read("src/components/recurring/RecurringMoneyPage.tsx");',
    );
    expect(viewportIntegrity).toContain("--recurring-visual-viewport-height");
    expect(viewportIntegrity).toContain("--recurring-visual-viewport-offset-top");
  });

  it("teaches the global x-lock contract about the recurring exception", () => {
    expect(xLock).toContain("const recurringSource = read(recurringPath);");
    expect(xLock).toContain('data-recurring-mobile-viewport="true"');
    expect(xLock).toContain(
      "fixed inset-x-0 z-100 flex items-stretch justify-center overflow-x-hidden",
    );
  });

  it("keeps runtime source on the real-iPhone viewport model", () => {
    expect(recurring).toContain("window.visualViewport");
    expect(recurring).toContain("--recurring-visual-viewport-height");
    expect(recurring).toContain("--recurring-visual-viewport-offset-top");
    expect(recurring).toContain("touch-pan-y");
  });
});
