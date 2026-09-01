import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
);

describe("DASH-EMERGENCY-FUND-BASELINE-1 Dashboard contract", () => {
  it("uses stable completed-month coverage instead of the selected partial-month expense", () => {
    expect(dashboard).toContain("calculateEmergencyCoverageSnapshot");
    expect(dashboard).toContain("emergencyCoverage.coverageMonths ?? 0");
    expect(dashboard).not.toContain(
      "savingsSnapshot.emergencyFund / summary.monthlyExpense",
    );
  });

  it("loads one year before the earliest selected/current year for January evidence", () => {
    expect(dashboard).toContain(
      "const minYear = Math.min(selectedYear, currentYear) - 1;",
    );
  });

  it("fails closed when completed-month evidence is unavailable", () => {
    // Keep this structural and ASCII-only so copy/terminal encoding cannot make
    // the contract brittle. The visible unavailable branch is guarded by the
    // same reliability flag and neutral tone used by the canonical snapshot.
    expect(dashboard).toContain("value: emergencyCoverage.isReliable");
    expect(dashboard).toContain("note: emergencyCoverage.isReliable");
    expect(dashboard).toContain("tone: !emergencyCoverage.isReliable");
    expect(dashboard).toMatch(
      /tone:\s*!emergencyCoverage\.isReliable\s*\?\s*"neutral"/,
    );
  });

  it("routes every present downstream emergency consumer through the stable baseline", () => {
    if (dashboard.includes("calculateFinancialStabilitySummary")) {
      expect(dashboard).toMatch(
        /calculateFinancialStabilitySummary\(\{[\s\S]*?emergencyMonths:\s*emergencyMonthsExact[\s\S]*?\}\)/,
      );
    }

    if (dashboard.includes("calculateAiCfoInsightSummary")) {
      expect(dashboard).toMatch(
        /calculateAiCfoInsightSummary\(\{[\s\S]*?emergencyMonths:\s*emergencyMonthsExact[\s\S]*?\}\)/,
      );
    }

    if (dashboard.includes("const v3AdvisorActions")) {
      expect(dashboard).toContain("emergencyCoverage.minimumGap");
      expect(dashboard).toContain(
        "emergencyCoverage.isReliable && emergencyMonthsExact < 3",
      );
      expect(dashboard).not.toContain(
        "const emergencyTarget = (summary.monthlyExpense || summary.expense) * 3",
      );
    }

    expect(dashboard).toContain(
      "const emergencyMonthsExact = emergencyCoverage.coverageMonths ?? 0;",
    );
  });
});
