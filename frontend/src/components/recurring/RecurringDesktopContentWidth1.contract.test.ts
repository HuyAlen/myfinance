import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const recurring = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const transactions = readFileSync(
  path.resolve(__dirname, "../transactions/TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-DESKTOP-CONTENT-WIDTH-1", () => {
  it("adopts the same primary content-shell width behavior as Transactions", () => {
    const sharedShell = "space-y-3 overflow-x-hidden md:space-y-5";

    expect(transactions).toContain(sharedShell);
    expect(recurring).toContain(
      `data-recurring-money-manager="true" className="${sharedShell}"`,
    );
  });

  it("removes the narrow centered wrapper that caused oversized desktop gutters", () => {
    expect(recurring).not.toContain(
      'data-recurring-money-manager="true" className="mx-auto max-w-7xl',
    );
    expect(recurring).not.toContain(
      'className="mx-auto max-w-7xl space-y-4 sm:space-y-5"',
    );
  });

  it("keeps all primary recurring sections inside the full-width content shell", () => {
    expect(recurring).toContain("Dòng tiền định kỳ");
    expect(recurring).toContain("Thêm khoản định kỳ");
    expect(recurring).toContain('["all", "Tất cả"]');
    expect(recurring).toContain('<section className="grid gap-3 lg:grid-cols-2">');
  });

  it("does not disturb the real-iPhone VisualViewport modal hardening", () => {
    expect(recurring).toContain('data-recurring-mobile-viewport="true"');
    expect(recurring).toContain("--recurring-visual-viewport-height");
    expect(recurring).toContain("--recurring-visual-viewport-offset-top");
    expect(recurring).toContain("touch-pan-y");
    expect(recurring).toContain("env(safe-area-inset-bottom)");
  });
});
