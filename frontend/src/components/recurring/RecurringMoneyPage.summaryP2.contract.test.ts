import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const page = readFileSync(path.join(root, "src/components/recurring/RecurringMoneyPage.tsx"), "utf8");
const helper = readFileSync(path.join(root, "src/lib/recurring/recurringSummaryP2.ts"), "utf8");

describe("MYFINANCE-RECURRING-SUMMARY-CARDS-P2 wiring", () => {
  it("renders four concise month-aware actual-vs-estimate summary cards", () => {
    expect(page).toContain("buildRecurringMonthSummary({ viewMonth, schedules, transactions })");
    expect(page).toContain("data-recurring-summary-month={viewMonth.monthKey}");
    expect(page).toContain('id="recorded"');
    expect(page).toContain('id="estimate"');
    expect(page).toContain('id="actual"');
    expect(page).toContain('id="difference"');
    expect(page).toContain("Tổng chi dự tính");
    expect(page).toContain("Tổng chi thực tế");
    expect(page).toContain("Chênh lệch chi");
    expect(page).toContain("summary.recordedCount");
    expect(page).toContain("summary.totalCount");
  });

  it("displays income without offsetting it against expense", () => {
    expect(page).toContain("summary.estimatedIncome");
    expect(page).toContain("summary.actualIncome");
    expect(page).toContain("summary.incomeDifference");
    expect(page).toContain('"Tổng thu dự tính"');
    expect(page).toContain('"Tổng thu thực tế"');
    expect(page).toContain('"Chênh lệch thu"');
  });

  it("keeps variance safe for outstanding occurrences and prevents phantom saving", () => {
    expect(helper).toContain("result.expenseDifference = result.actualExpense - result.recordedEstimatedExpense");
    expect(helper).toContain("result.incomeDifference = result.actualIncome - result.recordedEstimatedIncome");
    expect(page).toContain("Chênh lệch chỉ so các kỳ đã ghi nhận");
    expect(page).toContain('primaryRecorded > 0 ? signedAmount(primaryDifference) : "—"');
  });

  it("preserves selected-month calendar and reminders as independent existing features", () => {
    expect(page).toContain("projectSelectedRecurringMonth({");
    expect(page).toContain("viewMonth.isCurrentMonth");
    expect(page).toContain("requestRecordDueTransaction");
    expect(page).toContain("await addTransaction(transaction)");
    expect(page).not.toContain("updateTransaction(");
  });
});
