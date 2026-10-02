import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const polish1 = readFileSync(
  path.resolve(__dirname, "RecurringUiPolish1.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-UI-POLISH-2 hotfix v3", () => {
  it("keeps POLISH-1 assertions aligned with the POLISH-2 target", () => {
    expect(polish1).toContain('sm:max-w-lg sm:rounded-4xl');
    expect(polish1).toContain(
      "Thiết lập khoản thu hoặc chi lặp lại để dự báo dòng tiền.",
    );
    expect(polish1).not.toContain('sm:max-w-xl sm:rounded-4xl');
    expect(polish1).not.toContain('expect(source).toContain("LỊCH ĐỊNH KỲ")');
  });

  it("keeps the refined recurring editor source clean", () => {
    expect(page).toContain("trang Giao dịch.");
    expect(page).not.toContain("trang Giaodịch.");
    expect(page).toContain("formatRecurringAmountInput(editor.amount)");
    expect(page).toContain("sm:max-w-lg sm:rounded-4xl");
  });
});
