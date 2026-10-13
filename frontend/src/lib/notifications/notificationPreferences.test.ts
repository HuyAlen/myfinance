import { afterEach, describe, expect, it, vi } from "vitest";
import { accountSettingsKey } from "@/src/lib/date/dateFormatPreference";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES_CHANGED,
  filterNotificationsByPreferences,
  readAccountNotificationPreferences,
  saveAccountNotificationPreferences,
} from "./notificationPreferences";

// dateFormatPreference exports the EXISTING account-scoped storage key, but
// also houses a React hook. Stub its AuthProvider import in pure unit tests.
vi.mock("@/src/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

afterEach(() => vi.unstubAllGlobals());

function fakeBrowser(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const dispatched: string[] = [];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    },
    dispatchEvent: (event: Event) => { dispatched.push(event.type); return true; },
  });
  return { items, dispatched };
}

describe("notification settings SSOT - existing account-scoped Settings snapshot", () => {
  it("uses defaults for missing/anonymous account, malformed JSON, wrong version or wrong types", () => {
    const state = fakeBrowser();
    expect(readAccountNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(readAccountNotificationPreferences("a")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    state.items.set(accountSettingsKey("a"), "invalid");
    expect(readAccountNotificationPreferences("a")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    state.items.set(accountSettingsKey("a"), JSON.stringify({ version: 2, notifBudget: false }));
    expect(readAccountNotificationPreferences("a")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    state.items.set(accountSettingsKey("a"), JSON.stringify({ version: 1, notifBudget: "false", notifGoal: false }));
    expect(readAccountNotificationPreferences("a")).toEqual({ notifBudget: true, notifGoal: false, notifDebt: true });
  });

  it("does not leak preferences from one account into another", () => {
    const state = fakeBrowser({
      [accountSettingsKey("one")]: JSON.stringify({version: 1, notifBudget: false, notifDebt: false}),
    });
    expect(readAccountNotificationPreferences("one")).toEqual({notifBudget:false, notifGoal:true, notifDebt:false});
    expect(readAccountNotificationPreferences("two")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(state.items.has(accountSettingsKey("two"))).toBe(false);
  });

  it("saving notifications preserves ALL unrelated snapshot fields and notifies same-tab listeners", () => {
    const before = { version: 1, dateFormat: "yyyy-mm-dd", theme: "dark", profileName: "Profile", budgetAlert: "80", notifInvest: true, notifBudget: true };
    const state = fakeBrowser({[accountSettingsKey("one")]: JSON.stringify(before)});
    saveAccountNotificationPreferences("one", {notifBudget: false, notifGoal: false, notifDebt: true});
    const after = JSON.parse(state.items.get(accountSettingsKey("one")) ?? "null") as Record<string, unknown>;
    expect(after).toMatchObject({...before, notifBudget:false, notifGoal:false, notifDebt:true});
    expect(state.dispatched).toEqual([NOTIFICATION_PREFERENCES_CHANGED]);
    expect(readAccountNotificationPreferences("one")).toEqual({notifBudget:false,notifGoal:false,notifDebt:true});
  });

  it("does not overwrite an invalid snapshot and never claims a successful save on storage failure", () => {
    const state = fakeBrowser({[accountSettingsKey("one")]: "invalid-json"});
    expect(() => saveAccountNotificationPreferences("one", {notifBudget:false,notifGoal:true,notifDebt:true})).toThrow();
    expect(state.items.get(accountSettingsKey("one"))).toBe("invalid-json");
    expect(state.dispatched).toHaveLength(0);
    vi.stubGlobal("window", {
      localStorage: {getItem: () => null, setItem: () => {throw new Error("quota exceeded");}},
      dispatchEvent: (event: Event) => {state.dispatched.push(event.type); return true;},
    });
    expect(() => saveAccountNotificationPreferences("one", {notifBudget:false,notifGoal:true,notifDebt:true})).toThrow("quota exceeded");
    expect(state.dispatched).toHaveLength(0);
  });
});

describe("notification settings visibility - no read/order/data mutation", () => {
  it("filters disabled categories but preserves unrelated action alerts and read states", () => {
    const items = [
      {id:"b",kind:"budget",read:true},
      {id:"g",kind:"goal",read:false},
      {id:"d",kind:"debt",read:false},
      {id:"c",kind:"cash-flow",read:true},
      {id:"a",kind:"recurring-due",read:false},
      {id:"h",read:true},
    ];
    const actual = filterNotificationsByPreferences(items, {notifBudget:false,notifGoal:true,notifDebt:false});
    expect(actual.map(item=>item.id)).toEqual(["g","c","a","h"]);
    expect(items).toHaveLength(6);
    expect(actual.find(item=>item.id==="c")?.read).toBe(true);
    expect(actual.find(item=>item.id==="g")?.read).toBe(false);
    expect(filterNotificationsByPreferences(items, DEFAULT_NOTIFICATION_PREFERENCES)).toHaveLength(6);
  });

  it("caps eight VISIBLE finance alerts after filtering, not eight generated alerts before filtering", () => {
    const items = [
      ...Array.from({length: 10}, (_, i) => ({id:`b${i}`,kind:"budget"})),
      ...Array.from({length: 10}, (_, i) => ({id:`g${i}`,kind:"goal"})),
      {id:"review",kind:"transaction-review"},
      {id:"invite"},
    ];
    const result = filterNotificationsByPreferences(items, {notifBudget:false,notifGoal:true,notifDebt:false});
    expect(result.map(item => item.id)).toEqual([
      "g0","g1","g2","g3","g4","g5","g6","g7","review","invite",
    ]);
    expect(items).toHaveLength(22);
  });
});
