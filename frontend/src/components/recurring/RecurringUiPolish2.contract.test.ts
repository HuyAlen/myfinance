import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-UI-POLISH-2", () => {
  it("aligns the recurring editor header with Transactions", () => {
    expect(source).toContain(
      "Thiết lập khoản thu hoặc chi lặp lại để dự báo dòng tiền.",
    );
    expect(source).not.toContain("LỊCH ĐỊNH KỲ");
    expect(source).toContain("sm:max-w-lg sm:rounded-4xl");
  });

  it("uses a transaction-style hero amount input without changing raw state semantics", () => {
    expect(source).toContain("function formatRecurringAmountInput");
    expect(source).toContain("formatRecurringAmountInput(editor.amount)");
    expect(source).toContain("formatVND(Number(editor.amount))");
    expect(source).toContain('placeholder="Nhập số tiền"');
    expect(source).toContain("₫");
    expect(source).toContain('amount: event.target.value.replace(/[^0-9]/g, "")');
  });

  it("uses transaction-like field order and density", () => {
    expect(source).toContain("Ví tiền");
    expect(source).toContain("Ngày chạy tiếp");
    expect(source).toContain("grid gap-2 sm:grid-cols-2");
    expect(source).toContain("focus:bg-white");
    expect(source).toContain("bg-slate-50");
  });

  it("keeps recurring behavior and mobile integrity unchanged", () => {
    expect(source).toContain("effectiveNextRunDate ?? schedule.nextRunDate");
    expect(source).toContain("requestRecordDueTransaction");
    expect(source).toContain("await addTransaction(transaction)");
    expect(source).toContain("overflow-x-hidden overflow-y-auto");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });
});
