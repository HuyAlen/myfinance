import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "Header.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-DUE-ACTION-1 Header wiring", () => {
  it("derives recurring reminders from canonical schedules instead of a second date engine", () => {
    expect(source).toContain("buildRecurringMoneySchedules");
    expect(source).toContain("buildRecurringDueActions");
    expect(source).toContain("summarizeRecurringDueActions");
  });

  it("feeds the due summary into actionable finance alerts", () => {
    expect(source).toContain("recurringDueSummary");
  });
});
