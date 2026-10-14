import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source contracts complement genuine pure-module behavior tests. Normalize
// CRLF because the application is commonly developed on Windows.
const read = (file: string) => readFileSync(
  path.resolve(__dirname, "../../..", file), "utf8",
).replace(/\r\n?/g, "\n");
const settings = read("src/components/settings/SettingsPage.tsx");
const header = read("src/components/layout/Header.tsx");
const engine = read("src/lib/notifications/financeNotifications.ts");
const preferenceSource = read("src/lib/notifications/notificationPreferences.ts");

function regionBetween(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MYFINANCE-NOTIFICATION-SETTINGS-SSOT-1 wiring", () => {
  it("Settings notification-only save never validates or updates the profile", () => {
    const handler = regionBetween(
      settings, "function handleSaveNotifications() {", "async function handleSaveProfile() {",
    );
    expect(handler).toContain("saveAccountNotificationPreferences(user?.id");
    for (const forbidden of ["updateUser(", "birthDateInputValid", "numericRules", "buildLocalSettingsSnapshot()"]){
      expect(handler).not.toContain(forbidden);
    }
    expect(settings).toContain('onClick={handleSaveNotifications}');
  });

  it("another Settings Save preserves persisted notification flags, not unsaved drafts", () => {
    const handler = regionBetween(settings,"async function handleSaveFinancial() {", "function handleSaveAIFeatures() {");
    expect(handler).toContain('saveAccountSettingsSection(user.id, "financial",');
    expect(handler).toContain("readAccountNotificationPreferences(user.id)");
    expect(handler).not.toContain("saveAccountNotificationPreferences(");
    expect(handler).not.toContain("profileName");
    expect(settings).toContain("NOTIFICATION_PREFERENCES_CHANGED");
    expect(settings).toContain('window.addEventListener("storage", onStorage)');
  });

  it("shows ONLY the three supported switches, and clearly labels unsupported types", () => {
    const view = regionBetween(settings, '<div id="settings-notifications"', '<div id="settings-data"');
    for (const name of ["Cảnh báo ngân sách", "Cột mốc mục tiêu", "Cảnh báo khoản nợ"]){
      expect(view).toContain(`label="${name}"`);
    }
    for (const inactive of ['label="Cảnh báo đầu tư"','label="Tổng kết tuần"','label="Báo cáo tháng"']){
      expect(view).not.toContain(inactive);
    }
    expect(view).toContain('data-notification-unavailable="true"');
    expect(view).toContain("Chưa hỗ trợ:");
    expect(view).toContain("Lưu thông báo");
  });

  it("Header filters only the presentation, retaining all active IDs for first-seen and read status", () => {
    expect(header).toContain("useAccountNotificationPreferences(user?.id)");
    expect(header).toContain("filterNotificationsByPreferences(withReadState, notificationPreferences)");
    expect(header).toContain("maxNotifications: Number.MAX_SAFE_INTEGER");
    expect(header).toContain("const freshNotifications = buildNotifications(data, readAccountNotificationAlertThresholds(notificationAccountRef.current))");
    expect(header).toContain("advanceNotificationFirstSeen(");
    expect(header).toContain("setNotifList(");
    expect(header).toContain("const filteredNotifList = filterNotificationsByRead(visibleNotifList, notificationReadFilter)");
  });

  it("canonical finance rule engine still applies its original cap by default", () => {
    expect(engine).toContain("maxNotifications?: number;");
    expect(engine).toContain("].slice(0, input.maxNotifications ?? 8)");
    expect(engine).toContain('spending.status === "at-limit"');
    expect(engine).toContain('spending.status === "near"');
    expect(preferenceSource).toContain("useSyncExternalStore(");
    expect(preferenceSource).toContain("accountSettingsKey(accountId)");
    expect(preferenceSource).not.toContain('localStorage.removeItem(');
  });
});
