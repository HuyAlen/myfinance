import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const src = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 Settings SSOT", () => {
  it("retains the existing account-keyed snapshot and emits a target change only after save", () => {
    expect(src).toContain("myfinance-settings-v${SETTINGS_LOCAL_VERSION}:${user?.id ?? \"anonymous\"}");
    const save = src.slice(src.indexOf("async function handleSaveFinancial()"), src.indexOf("function handleSaveAIFeatures()"));
    expect(save).toContain('saveAccountSettingsSection(user.id, "financial",');
    expect(save.indexOf("notifyFinancialTargetsSaved()")).toBeGreaterThan(save.indexOf("saveAccountSettingsSection("));
    expect(save).toContain("Number.isInteger(Number(emergencyFund))");
    expect(save).toContain('String(raw).trim() === ""');
  });
  it("does not offer pretend English, USD/EUR or non-calendar-day modes", () => {
    expect(src).toContain('disabled={opt.val === "en"}');
    expect(src).toContain('options={[{ value: "VND", label: "Đồng Việt Nam (VND)" }]}');
    expect(src).toContain('options={[{ value: "Asia/Ho_Chi_Minh", label: "Việt Nam (GMT+7)" }]}');
    expect(src).toContain('options={[{ value: "1", label: "Ngày 1" }]}');
    expect(src).toContain('lang: "vi", dateFormat, defaultPage');
    expect(src).toContain('finMonth: "1", savingsGoal, budgetAlert, debtAlert, emergencyFund');
  });
  it("does not remove editable savings goals, emergency targets or existing notification controls", () => {
    expect(src).toContain('onChange={(e) => setSavingsGoal(e.target.value)}');
    expect(src).toContain('onChange={(e) => setEmergencyFund(e.target.value)}');
    expect(src).toContain('onClick={handleSaveNotifications}');
    expect(src).toContain('notifyNotificationPreferencesSaved()');
  });
});
