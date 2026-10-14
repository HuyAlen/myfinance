import { describe, expect, it, vi } from "vitest";
// The shared date preference reader imports AuthProvider; keep this a pure storage test.
vi.mock("@/src/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: null }) }));
import { accountSettingsKey } from "@/src/lib/date/dateFormatPreference";
import {
  DEFAULT_FINANCIAL_TARGETS,
  readAccountFinancialTargets,
  resolvePostLoginStartPage,
  SETTINGS_START_PAGES,
} from "./effectivePreferences";

type Reader = { getItem: (key: string) => string | null };
function reader(accountId: string, value: unknown): Reader {
  return {
    getItem: (key) => key === accountSettingsKey(accountId)
      ? JSON.stringify({ version: 1, ...(value as object) }) : null,
  };
}

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 strict account SSOT", () => {
  it("allows only the five configured internal landing paths", () => {
    for (const defaultPage of SETTINGS_START_PAGES) {
      expect(resolvePostLoginStartPage("user-a", reader("user-a", { defaultPage }))).toBe(defaultPage);
    }
  });

  it("rejects external, protocol-relative, query/fragment, auth and arbitrary paths", () => {
    for (const defaultPage of ["https://example.org", "//example.org", "/login", "/settings", "/wallets?x=1", "/wallets#x", "javascript:alert(1)", "/transactions/../login", ""]) {
      expect(resolvePostLoginStartPage("user-a", reader("user-a", { defaultPage }))).toBe("/");
    }
  });

  it("never reads another authenticated account or a local UI placeholder", () => {
    expect(resolvePostLoginStartPage("user-b", reader("user-a", { defaultPage: "/budgets" }))).toBe("/");
    expect(resolvePostLoginStartPage(null, reader("user-a", { defaultPage: "/reports" }))).toBe("/");
    expect(resolvePostLoginStartPage("local-ui-user", reader("local-ui-user", { defaultPage: "/reports" }))).toBe("/");
  });

  it("rejects wrong snapshot version, malformed and inaccessible storage", () => {
    expect(resolvePostLoginStartPage("user-a", { getItem: () => '{broken' })).toBe("/");
    expect(readAccountFinancialTargets("user-a", { getItem: () => '{broken' })).toEqual(DEFAULT_FINANCIAL_TARGETS);
    expect(resolvePostLoginStartPage("user-a", { getItem: () => JSON.stringify({ version: 2, defaultPage: "/reports" }) })).toBe("/");
    expect(readAccountFinancialTargets("user-a", { getItem: () => { throw new Error("storage blocked"); } })).toEqual(DEFAULT_FINANCIAL_TARGETS);
  });

  it("reads validated savings percent and emergency-month target without modifying balances", () => {
    expect(readAccountFinancialTargets("user-a", reader("user-a", { savingsGoal: "32.5", emergencyFund: "12" }))).toEqual({
      savingsGoalPercent: 32.5, emergencyFundMonths: 12,
    });
    expect(readAccountFinancialTargets("user-a", reader("user-a", { savingsGoal: "0", emergencyFund: "1" }))).toEqual({
      savingsGoalPercent: 0, emergencyFundMonths: 1,
    });
    expect(readAccountFinancialTargets("user-a", reader("user-a", { savingsGoal: 100, emergencyFund: 24 }))).toEqual({
      savingsGoalPercent: 100, emergencyFundMonths: 24,
    });
  });

  it("invalid numeric text, NaN, negatives, fractions of months and overflow use safe defaults", () => {
    for (const bad of ["", "NaN", "Infinity", "101", "-1", null, [], {}, 200]) {
      expect(readAccountFinancialTargets("user-a", reader("user-a", { savingsGoal: bad })).savingsGoalPercent).toBe(20);
    }
    for (const bad of ["", "0", "25", "2.5", null, -1, 100]) {
      expect(readAccountFinancialTargets("user-a", reader("user-a", { emergencyFund: bad })).emergencyFundMonths).toBe(6);
    }
  });

  it("preserves independent validated fields when another is invalid", () => {
    expect(readAccountFinancialTargets("user-a", reader("user-a", { savingsGoal: "30", emergencyFund: "bad" }))).toEqual({
      savingsGoalPercent: 30, emergencyFundMonths: 6,
    });
  });
});
