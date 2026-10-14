import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8").replace(/\r\n?/g, "\n");

function region(begin: string, end: string) {
  const start = source.indexOf(begin);
  const finish = source.indexOf(end, start + begin.length);
  expect(start).toBeGreaterThan(-1);
  expect(finish).toBeGreaterThan(start);
  return source.slice(start, finish);
}

const profile = () => region("async function handleSaveProfile() {", "function handleSavePreferences() {");
const prefs = () => region("function handleSavePreferences() {", "async function handleSaveFinancial() {");
const finance = () => region("async function handleSaveFinancial() {", "function handleSaveAIFeatures() {");
const features = () => region("function handleSaveAIFeatures() {", "function getAISettingsPayload() {");

describe("SETTINGS-SAVE-BOUNDARY-1 isolated Settings save handlers", () => {
  it("removes the shared full-snapshot save and wires all four explicit buttons", () => {
    expect(source).not.toContain("handleSavePrefs");
    expect(source).not.toContain("buildLocalSettingsSnapshot");
    expect(source).toContain('onClick={handleSaveProfile}');
    expect(source).toContain('onClick={handleSavePreferences}');
    expect(source).toContain('onClick={handleSaveFinancial}');
    expect(source).toContain('onClick={handleSaveAIFeatures}');
    expect(source).toContain('onClick={handleSaveAISettings}');
    expect(source).toContain('onClick={handleSaveNotifications}');
  });

  it("profile save checks only profile draft and writes only profile fields", () => {
    const body = profile();
    expect(body).toContain("isValidBirthDateInput(profileBirthDate)");
    expect(body).toContain("supabase.auth.updateUser({");
    expect(body).toContain('saveAccountSettingsSection(user.id, "profile",');
    expect(body).not.toContain("numericRules");
    expect(body).not.toContain("NOTIFICATION_CLOUD_METADATA_KEY");
    expect(body).not.toContain("notifyFinancialTargetsSaved()");
    expect(body).not.toContain("toNotificationCloudSettings(");
  });

  it("preferences save validates a route allowlist and updates date format after commit", () => {
    const body = prefs();
    expect(body).toContain("SETTINGS_START_PAGES.some(");
    expect(body).toContain('saveAccountSettingsSection(user.id, "preferences",');
    expect(body.indexOf("notifyDateFormatSaved()")).toBeGreaterThan(body.indexOf("saveAccountSettingsSection("));
    expect(body).not.toContain("updateUser(");
    expect(body).not.toContain("notifyFinancialTargetsSaved()");
  });

  it("financial save alone validates finance values and preserves latest cloud notification flags", () => {
    const body = finance();
    expect(body).toContain('Number.isInteger(Number(emergencyFund))');
    expect(body).toContain("await pullNotificationCloudSettings(user.id, supabase.auth)");
    expect(body).toContain("toNotificationCloudSettings(preservedNotificationFlags,");
    expect(body).toContain('saveAccountSettingsSection(user.id, "financial",');
    expect(body.indexOf("notifyFinancialTargetsSaved()")).toBeGreaterThan(body.indexOf("saveAccountSettingsSection("));
    expect(body).not.toContain("birthDateInputValid");
    expect(body).not.toContain("profileName");
    expect(body).not.toContain("saveAccountNotificationPreferences(");
  });

  it("AI feature switches save locally without provider, API key, profile or finance mutation", () => {
    const body = features();
    expect(body).toContain('saveAccountSettingsSection(user.id, "aiFeatures",');
    for (const unexpected of ["getAISettingsPayload(", "saveAIFinanceSettings(", "updateUser(", "savingsGoal", "budgetAlert"]) {
      expect(body).not.toContain(unexpected);
    }
    expect(source).toContain("chưa bật/tắt các pipeline AI trên máy chủ");
  });

  it("shows feedback only for the section actually saved", () => {
    expect(source).toContain('savedSection === "profile"');
    expect(source).toContain('savedSection === "preferences"');
    expect(source).toContain('savedSection === "financial"');
    expect(source).toContain('savedSection === "aiFeatures"');
    expect(source).toContain('savedSection === "aiSettings"');
    expect(source).not.toContain("setSaveSuccess(");
  });

  it("keeps unsaved notification/financial draft controls during same-tab cloud refresh", () => {
    const refresh = region("const refreshNotificationToggles = () => {", "const onStorage = (event: StorageEvent) => {");
    expect(refresh).toContain("notificationDraftAccountRef.current !== accountId");
    expect(refresh).toContain("financialDraftAccountRef.current !== accountId");
    expect(source).toContain("notificationDraftAccountRef.current = user?.id ?? null;");
    expect(source).toContain("financialDraftAccountRef.current = user?.id ?? null;");
    expect(source).toContain("cloudMetadataSaveRef.current");
  });

  it("retains unsupported notification values as stored legacy fields without unused UI bindings", () => {
    expect(source).not.toContain("NOTIFICATION_CLOUD_METADATA_KEY");
    for (const name of ["notifInvest", "notifWeekly", "notifMonthly"]) {
      expect(source).not.toContain(`const [${name}, set`);
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
      expect(source).not.toContain(`set${capitalized}(`);
    }
    expect(source).toContain("Chưa hỗ trợ: Cảnh báo đầu tư");
    expect(source).toContain("unsupported; their historical");
  });

  it("never hydrates a stale account theme over ThemeProvider's own storage", () => {
    expect(source).not.toContain("setTheme(saved.theme)");
    expect(source).toContain("ThemeProvider owns its separate immediate-persisted preference");
  });
});
