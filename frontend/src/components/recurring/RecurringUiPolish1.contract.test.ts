import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-UI-POLISH-1", () => {
  it("uses the canonical full-screen-mobile / rounded-desktop modal shell", () => {
    expect(source).toContain(
      "fixed inset-0 overflow-x-hidden z-100 flex items-stretch justify-center bg-slate-950/55",
    );
    expect(source).toContain(
      "flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl",
    );
    expect(source).toContain("sm:max-w-lg sm:rounded-4xl");
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps modal copy and controls visually aligned with the finance app", () => {
    expect(source).toContain("Thiết lập khoản thu hoặc chi lặp lại để dự báo dòng tiền.");
    expect(source).not.toContain(">Recurring</p>");
    expect(source).toContain("focus:border-blue-300");
    expect(source).toContain("focus:ring-4 focus:ring-blue-100");
    expect(source).toContain("disabled:cursor-not-allowed");
    expect(source).toContain("bg-blue-600 px-4 text-sm font-bold text-white");
  });

  it("preserves horizontal lock and vertical mobile scrolling", () => {
    expect(source).toContain("overflow-x-hidden overflow-y-auto overscroll-contain");
    expect(source).toContain("[-webkit-overflow-scrolling:touch]");
  });

  it("refines due-state hierarchy without changing its behavior", () => {
    expect(source).toContain('data-recurring-due-status={dueAction.status}');
    expect(source).toContain("rounded-2xl border px-3.5 py-3");
    expect(source).toContain("Sắp đến hạn · còn ${dueAction.daysUntilDue} ngày");
    expect(source).toContain("Ghi giao dịch");
    expect(source).toContain('if (dueAction.status !== "due-today") return;');
  });

  it("keeps recurring behavior unchanged by the polish wave", () => {
    expect(source).toContain("effectiveNextRunDate ?? schedule.nextRunDate");
    expect(source).toContain("buildRecurringDueActions");
    expect(source).toContain("await addTransaction(transaction)");
    expect(source).toContain("updateCategoryRecurringSchedule");
    expect(source).toContain("updateTransactionRecurringSchedule");
  });
});
