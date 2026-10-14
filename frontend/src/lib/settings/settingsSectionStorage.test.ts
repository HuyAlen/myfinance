import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/date/dateFormatPreference", () => ({
  accountSettingsKey: (id: string) => `myfinance-settings-v1:${id}`,
  SETTINGS_DATE_FORMAT_VERSION: 1,
}));

import { saveAccountSettingsSection, type SettingsStoragePort } from "./settingsSectionStorage";

function makeStorage() {
  const values = new Map<string, string>();
  const storage: SettingsStoragePort = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  return { values, storage };
}

const key = (user: string) => `myfinance-settings-v1:${user}`;

function snapshot(values: Map<string, string>, user = "alice") {
  return JSON.parse(values.get(key(user)) ?? "null") as Record<string, unknown>;
}

describe("SETTINGS-SAVE-BOUNDARY-1 account-local section storage", () => {
  it("creates the existing versioned account snapshot without a second storage key", () => {
    const { values, storage } = makeStorage();
    saveAccountSettingsSection("alice", "preferences", { defaultPage: "/wallets" }, storage);
    expect([...values.keys()]).toEqual([key("alice")]);
    expect(snapshot(values)).toEqual({ version: 1, defaultPage: "/wallets" });
  });

  it("saving a profile never rewrites financial, AI, notification or unknown fields", () => {
    const { values, storage } = makeStorage();
    const existing = {
      version: 1, profileName: "Old", defaultPage: "/budgets", savingsGoal: "35",
      budgetAlert: "75", debtAlert: "60", aiRisk: false, notifBudget: false,
      customFutureField: { enabled: true },
    };
    values.set(key("alice"), JSON.stringify(existing));
    saveAccountSettingsSection("alice", "profile", { profileName: "New" }, storage);
    expect(snapshot(values)).toEqual({ ...existing, profileName: "New" });
  });

  it("financial save keeps the latest saved notification flags, date format and login page", () => {
    const { values, storage } = makeStorage();
    values.set(key("alice"), JSON.stringify({
      version: 1, notifGoal: false, notifDebt: true,
      dateFormat: "yyyy-mm-dd", defaultPage: "/reports", aiInvestCoach: true,
    }));
    saveAccountSettingsSection("alice", "financial", {
      savingsGoal: "27", emergencyFund: "9", budgetAlert: "85", debtAlert: "50",
    }, storage);
    expect(snapshot(values)).toMatchObject({
      notifGoal: false, notifDebt: true, dateFormat: "yyyy-mm-dd",
      defaultPage: "/reports", aiInvestCoach: true,
      savingsGoal: "27", emergencyFund: "9", budgetAlert: "85", debtAlert: "50",
    });
  });

  it("AI feature save cannot modify server-backed AI provider metadata or personal settings", () => {
    const { values, storage } = makeStorage();
    values.set(key("alice"), JSON.stringify({ version: 1, profileName: "Me", aiModel: "local" }));
    saveAccountSettingsSection("alice", "aiFeatures", { aiInsights: false, aiForecast: true }, storage);
    expect(snapshot(values)).toEqual({
      version: 1, profileName: "Me", aiModel: "local", aiInsights: false, aiForecast: true,
    });
  });

  it("rejects cross-section fields even from a JavaScript runtime caller", () => {
    const { values, storage } = makeStorage();
    const wrong = { dateFormat: "dd/mm/yyyy", notifDebt: false } as never;
    expect(() => saveAccountSettingsSection("alice", "preferences", wrong, storage)).toThrow("ngoài nhóm");
    expect(values.size).toBe(0);
  });

  it("rejects anonymous or absent accounts without touching storage", () => {
    const { values, storage } = makeStorage();
    expect(() => saveAccountSettingsSection(null, "profile", { profileName: "X" }, storage)).toThrow();
    expect(() => saveAccountSettingsSection("anonymous", "profile", { profileName: "X" }, storage)).toThrow();
    expect(values.size).toBe(0);
  });

  it("never touches another account snapshot", () => {
    const { values, storage } = makeStorage();
    values.set(key("bob"), JSON.stringify({ version: 1, profileName: "Bob" }));
    saveAccountSettingsSection("alice", "profile", { profileName: "Alice" }, storage);
    expect(snapshot(values, "bob")).toEqual({ version: 1, profileName: "Bob" });
    expect(snapshot(values, "alice").profileName).toBe("Alice");
  });

  it("fails closed on malformed or different-version snapshots", () => {
    const { values, storage } = makeStorage();
    values.set(key("alice"), "broken");
    expect(() => saveAccountSettingsSection("alice", "financial", { savingsGoal: "10" }, storage)).toThrow();
    expect(values.get(key("alice"))).toBe("broken");
    values.set(key("alice"), JSON.stringify({ version: 2, profileName: "Older" }));
    expect(() => saveAccountSettingsSection("alice", "financial", { savingsGoal: "10" }, storage)).toThrow("không hợp lệ");
    expect(snapshot(values).profileName).toBe("Older");
  });

  it("reports blocked writes rather than showing a fake save success", () => {
    const storage: SettingsStoragePort = {
      getItem: () => null,
      setItem: () => { throw new Error("storage unavailable"); },
    };
    expect(() => saveAccountSettingsSection("alice", "profile", { profileName: "A" }, storage)).toThrow("storage unavailable");
  });
});
