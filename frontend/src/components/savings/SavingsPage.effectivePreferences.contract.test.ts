import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const src = readFileSync(path.resolve(__dirname, "SavingsPage.tsx"), "utf8");

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 Savings target", () => {
  it("uses stored emergency months and refreshes the memo after a Settings save", () => {
    expect(src).toContain('useAccountFinancialTargets()');
    expect(src).toContain('MONTHLY_EXPENSE_TARGET * financialTargets.emergencyFundMonths');
    expect(src).toContain('[financialTargets.emergencyFundMonths, localSavings, metrics.emergencyFund]');
    expect(src).toContain('tiêu {financialTargets.emergencyFundMonths} tháng chi phí');
  });
  it("keeps the Savings hero month label dynamic and removes every retired constant reference", () => {
    expect(src).toContain('note={`${savingsExperience.emergencyMonths.toFixed(1)} / ${financialTargets.emergencyFundMonths} tháng`}');
    expect(src).not.toContain('EMERGENCY_MONTH_TARGET');
  });
  it("labels the existing hardcoded expense assumption honestly without changing ledgers", () => {
    expect(src).toContain('chi phí giả định {formatCurrency(MONTHLY_EXPENSE_TARGET)}');
    expect(src).toContain('createSavingAccount({');
    expect(src).toContain('createSavingMovement({');
  });
});
