import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-NEXT-RUN-ROLLFORWARD-1 page wiring", () => {
  it("uses one local calendar reference for read model and 30-day projection", () => {
    expect(source).toContain("const todayKey = localDateKey();");
    expect(source).toContain("referenceDate: todayKey");
    expect(source).toContain(
      "expandRecurringScheduleOccurrences(forecastSchedules, todayKey, 30)",
    );
  });

  it("renders the rolled effective next date while keeping edit form on stored anchor", () => {
    expect(source).toContain(
      "formatDate(schedule.effectiveNextRunDate ?? schedule.nextRunDate)",
    );
    expect(source).toContain(
      "nextRunDate: schedule.nextRunDate ?? localDateKey()",
    );
  });
});
