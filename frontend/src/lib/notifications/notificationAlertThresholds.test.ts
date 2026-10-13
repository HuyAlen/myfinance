import { afterEach, describe, expect, it, vi } from "vitest";
import { accountSettingsKey } from "@/src/lib/date/dateFormatPreference";
import { checkedPercent, readAccountNotificationAlertThresholds, DEFAULT_NOTIFICATION_ALERT_THRESHOLDS } from "./notificationAlertThresholds";
vi.mock("@/src/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: null }) }));
afterEach(() => vi.unstubAllGlobals());
describe("MYFINANCE-NOTIFICATION-THRESHOLD-ALIGNMENT-1 account-scoped SSOT", () => {
  it("defaults when no snapshot or anonymous and enforces 0..100 and 0..200", () => {
    const items = new Map<string,string>();
    vi.stubGlobal("window", { localStorage:{getItem:(k:string)=>items.get(k)??null} });
    expect(readAccountNotificationAlertThresholds(null)).toEqual(DEFAULT_NOTIFICATION_ALERT_THRESHOLDS);
    expect(readAccountNotificationAlertThresholds("one")).toEqual({ budgetAlert:80,debtAlert:50 });
    items.set(accountSettingsKey("one"),JSON.stringify({version:1,budgetAlert:"97.5",debtAlert:"175"}));
    expect(readAccountNotificationAlertThresholds("one")).toEqual({ budgetAlert:97.5,debtAlert:175 });
    expect(readAccountNotificationAlertThresholds("two")).toEqual(DEFAULT_NOTIFICATION_ALERT_THRESHOLDS);
  });
  it("invalid and out-of-range input falls back safely without mutating local data", () => {
    const items = new Map<string,string>([[accountSettingsKey("one"),JSON.stringify({version:1,budgetAlert:"",debtAlert:"201"})]]);
    vi.stubGlobal("window",{localStorage:{getItem:(key:string)=>items.get(key)??null}});
    expect(readAccountNotificationAlertThresholds("one")).toEqual({budgetAlert:80,debtAlert:50});
    items.set(accountSettingsKey("one"),"broken");
    expect(readAccountNotificationAlertThresholds("one")).toEqual(DEFAULT_NOTIFICATION_ALERT_THRESHOLDS);
    expect(checkedPercent(Infinity,80,100)).toBe(80);
    expect(checkedPercent(0,80,100)).toBe(0);
  });
});
