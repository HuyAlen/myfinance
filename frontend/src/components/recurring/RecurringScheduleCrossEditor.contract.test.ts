import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const categories = read("src/components/categories/CategoriesPage.tsx");
const transactions = read("src/components/transactions/TransactionsPage.tsx");
const transactionSupport = read(
  "src/components/transactions/transactionPageSupport.ts",
);

describe("RECURRING-MONEY-MANAGER-1 cross-editor integrity", () => {
  it("treats disabling an existing category schedule as pause, preserving its plan metadata", () => {
    expect(categories).toContain("const existingCategory = form.id");
    expect(categories).toContain("existingCategory?.recurrence");
    expect(categories).toContain("existingCategory?.defaultAmount");
    expect(categories).toContain("existingCategory?.defaultWalletId");
    expect(categories).toContain("existingCategory?.nextRunDate");
    expect(categories).toContain("xóa lịch tại trang Định Kỳ");
  });

  it("gives transaction schedules an explicit next-run date instead of creating incomplete legacy schedules", () => {
    expect(transactionSupport).toContain("nextRunDate: string;");
    expect(transactions).toContain('nextRunDate: t.nextRunDate ?? ""');
    expect(transactions).toContain('if (form.isRecurring && !form.nextRunDate)');
    expect(transactions).toContain("Ngày chạy tiếp");
    expect(transactions).toContain("Dùng cho dự báo dòng tiền");
    expect(transactions).toContain("nextRunDate: form.nextRunDate || undefined");
  });

  it("preserves legacy schedule recurrence/date while paused so Manager resume stays lossless", () => {
    expect(transactions).toContain(
      "form.isRecurring || form.nextRunDate ? form.recurrence : undefined",
    );
    expect(transactions).toContain("nextRunDate: form.nextRunDate || undefined");
  });
});
