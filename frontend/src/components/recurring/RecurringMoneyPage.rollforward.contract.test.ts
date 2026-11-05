import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-NEXT-RUN-ROLLFORWARD-1 page wiring", () => {
  it("uses the selected header month for schedules and projected occurrences", () => {
    expect(source).toContain("const { selectedMonth, filterMode: globalFilterMode } = useDateFilter();");
    expect(source).toContain("buildRecurringMonthView(selectedMonth, todayKey)");
    expect(source).toContain("referenceDate: viewMonth.startDate");
    expect(source).toContain("projectSelectedRecurringMonth({");
    expect(source).toContain("data-recurring-view-month={viewMonth.monthKey}");
  });

  it("renders the rolled effective next date while keeping edit form on stored anchor", () => {
    expect(source).toContain(
      "formatDate(schedule.effectiveNextRunDate ?? schedule.nextRunDate,dateDisplayFormat)",
    );
    expect(source).toContain(
      "nextRunDate: schedule.nextRunDate ?? localDateKey()",
    );
    expect(source).toContain("dateDisplayFormat={dateDisplayFormat}");
  });
});
