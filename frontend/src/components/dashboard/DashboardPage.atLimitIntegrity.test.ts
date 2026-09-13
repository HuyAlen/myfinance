import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

describe("BUDGET-AT-LIMIT-INTEGRITY-1 DashboardPage", () => {
  it("colors monthly budget usage from canonical raw status instead of rounded percentages", () => {
    expect(source).toContain("deriveBudgetSpendingStatus");
    expect(source).toContain("budgetUsageStatus");
    expect(source).toContain("projectedBudgetUsageStatus");
    expect(source).not.toContain("monthlyPulse.budgetUsage > 100");
    expect(source).not.toContain("monthlyPulse.projectedBudgetUsage > 100");
  });
});
