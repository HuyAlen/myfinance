import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const get = (file: string)=>readFileSync(resolve(process.cwd(),"src",file),"utf8").replace(/\r\n?/g,"\n");
const settings = get("components/settings/SettingsPage.tsx");
const header = get("components/layout/Header.tsx");
const engine = get("lib/notifications/financeNotifications.ts");
describe("MYFINANCE-NOTIFICATION-P1 threshold + account metadata sync wiring",()=>{
  it("Settings saves notification metadata only after authenticated cloud write, and never touches profile",()=>{
    const start=settings.indexOf("async function handleSaveNotifications() {");
    const end=settings.indexOf("async function handleSavePrefs() {",start);
    expect(start).toBeGreaterThan(-1);
    const content=settings.slice(start,end);
    expect(content).toContain("await pushNotificationCloudSettings(");
    expect(content).toContain("saveAccountNotificationPreferences(user?.id");
    expect(content.indexOf("await pushNotificationCloudSettings(")).toBeLessThan(content.indexOf("saveAccountNotificationPreferences(user?.id"));
    expect(content).not.toContain("birthDateInputValid");
    expect(content).not.toContain("supabase.auth.updateUser(");
  });
  it("financial settings save includes thresholds and prior saved toggles without inventing a separate key",()=>{
    expect(settings).toContain("toNotificationCloudSettings(");
    expect(settings).toContain("const cloudSaved = await pullNotificationCloudSettings(user.id, supabase.auth);");
    expect(settings).toContain("...preservedNotificationFlags,");
    expect(settings).toContain("...readAccountNotificationPreferences(user?.id)");
    expect(settings).toContain("notifyNotificationPreferencesSaved()");
    expect(settings).toContain('["Ngưỡng cảnh báo nợ", debtAlert, 0, 200]');
  });
  it("Header pulls server settings with verified account and preserves the single reload path",()=>{
    expect(header).toContain('const activeAccountId = user?.id ?? "";');
    expect(settings).toContain("pullNotificationCloudSettings,");
    expect(header).toContain("pullNotificationCloudSettings(activeAccountId, supabase.auth)");
    expect(header).toContain("applyNotificationCloudSettings(activeAccountId, remote)");
    expect(header).toContain("const freshNotifications = buildNotifications(data, readAccountNotificationAlertThresholds(notificationAccountRef.current));");
    expect(header).toContain("requestHeaderRefresh();");
    expect(header).toContain("maxNotifications: Number.MAX_SAFE_INTEGER");
  });
  it("canonical finance engine uses raw budget spent and income > 0, not a second wallet/expense summation",()=>{
    expect(engine).toContain("spending.spent * 100 >= spending.limit * budgetThreshold");
    expect(engine).toContain("getTotalIncome(thisMonthTx)");
    expect(engine).toContain("getTotalDebt(debts)");
  });
});
