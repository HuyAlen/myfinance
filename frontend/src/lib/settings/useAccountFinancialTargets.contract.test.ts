import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const src = readFileSync(path.resolve(__dirname, "useAccountFinancialTargets.ts"), "utf8");

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 reactive targets", () => {
  it("reads one account-scoped snapshot with stable primitives, not a new storage key", () => {
    expect(src).toContain('useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)');
    expect(src).toContain('readAccountFinancialTargets(accountId)');
    expect(src).toContain('accountSettingsKey(accountId)');
    expect(src).not.toContain('localStorage.setItem(');
  });
  it("subscribes to same-tab saves and cross-tab storage changes", () => {
    expect(src).toContain('window.addEventListener(FINANCIAL_TARGETS_SAVED_EVENT, onSaved)');
    expect(src).toContain('window.addEventListener("storage", onStorage)');
    expect(src).toContain('window.removeEventListener("storage", onStorage)');
  });
});
