import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-DUE-ACTION-1 page wiring", () => {
  it("builds due reminders from the same canonical schedules and transactions", () => {
    expect(source).toContain("buildRecurringDueActions");
    expect(source).toContain("referenceDate: todayKey");
    expect(source).toContain("upcomingDays: 3");
  });

  it("offers explicit record action only for due-today items", () => {
    expect(source).toContain('dueAction?.status === "due-today"');
    expect(source).toContain("Ghi giao dịch");
    expect(source).toContain("requestRecordDueTransaction");
  });

  it("uses the canonical addTransaction boundary and does not persist recurrence metadata on the realized transaction", () => {
    expect(source).toContain("await addTransaction(transaction)");
    expect(source).toContain("date: dueAction.dueDate");
    expect(source).not.toContain("isRecurring: true");
  });
});
