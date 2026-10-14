import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const src = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 Dashboard targets", () => {
  it("applies configured emergency months to canonical expense-evidence coverage", () => {
    const coverage = src.slice(src.indexOf("const emergencyCoverage = useMemo("),src.indexOf("// Downstream consumers share", src.indexOf("const emergencyCoverage = useMemo(")));
    expect(coverage).toContain("calculateEmergencyCoverageSnapshot");
    expect(coverage).toContain("minimumMonths: financialTargets.emergencyFundMonths");
    expect(coverage).toContain("financialTargets.emergencyFundMonths,");
    expect(src).toContain('emergencyMonthsExact >= financialTargets.emergencyFundMonths');
    expect(src).toContain('Đủ ≥${financialTargets.emergencyFundMonths} tháng');
  });
  it("benchmarks Savings-only gross contributions against the Settings savings goal", () => {
    const panel = src.slice(src.indexOf('title="Cấu trúc tài chính"'),src.indexOf('</Panel>',src.indexOf('title="Cấu trúc tài chính"')));
    expect(panel).toContain('data-settings-effective-savings-target="true"');
    expect(panel).toContain('financialStructureAdjusted.savingRate');
    expect(panel).toContain('financialTargets.savingsGoalPercent');
    expect(panel).toContain('Không tính khoản nạp đầu tư');
  });
  it("keeps canonical completed-month baseline and finance reads unchanged", () => {
    expect(src).toContain('calculateEmergencyCoverageSnapshot({');
    expect(src.split('getTransactionsInRange(').length - 1).toBe(2);
    expect(src.split('getBudgets(').length - 1).toBe(1);
  });
});
