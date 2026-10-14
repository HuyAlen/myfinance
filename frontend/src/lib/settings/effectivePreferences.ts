/** SETTINGS-EFFECTIVE-PREFERENCES-1 — Reads the existing per-account Settings snapshot.
 * Never introduces a second preference key, never reads another account's data,
 * never interprets a saved value as a URL, and never fetches finance records.
 */
import {
  accountSettingsKey,
  SETTINGS_DATE_FORMAT_VERSION,
} from "@/src/lib/date/dateFormatPreference";

export const SETTINGS_START_PAGE_DEFAULT = "/";
export const SETTINGS_START_PAGES = [
  "/",
  "/transactions",
  "/wallets",
  "/budgets",
  "/reports",
] as const;

export type FinancialTargets = {
  savingsGoalPercent: number;
  emergencyFundMonths: number;
};

export const DEFAULT_FINANCIAL_TARGETS: Readonly<FinancialTargets> = Object.freeze({
  savingsGoalPercent: 20,
  emergencyFundMonths: 6,
});

type SettingsReader = {
  getItem(key: string): string | null;
};

function settingsReader(reader?: SettingsReader): SettingsReader | null {
  if (reader) return reader;
  return typeof window !== "undefined" ? window.localStorage : null;
}

function readAccountSettings(accountId: string | null | undefined, reader?: SettingsReader): Record<string, unknown> | null {
  if (!accountId || accountId === "local-ui-user") return null;
  try {
    const storage = settingsReader(reader);
    if (!storage) return null;
    const raw = storage.getItem(accountSettingsKey(accountId));
    if (!raw) return null;
    const candidate: unknown = JSON.parse(raw);
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const snapshot = candidate as Record<string, unknown>;
    return snapshot.version === SETTINGS_DATE_FORMAT_VERSION ? snapshot : null;
  } catch {
    // Restricted iOS storage, malformed JSON or a migrated snapshot: fail closed.
    return null;
  }
}

export function resolvePostLoginStartPage(
  accountId: string | null | undefined,
  reader?: SettingsReader,
): string {
  const saved = readAccountSettings(accountId, reader)?.defaultPage;
  // Exact allowlist blocks open redirects, /login loops, query/hash smuggling,
  // prototype paths, and accidentally saved routes unsupported by Settings.
  return SETTINGS_START_PAGES.some((path) => path === saved)
    ? (saved as string)
    : SETTINGS_START_PAGE_DEFAULT;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number, integer: boolean): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max && (!integer || Number.isInteger(numeric))
    ? numeric
    : fallback;
}

export function readAccountFinancialTargets(
  accountId: string | null | undefined,
  reader?: SettingsReader,
): FinancialTargets {
  const data = readAccountSettings(accountId, reader);
  return {
    savingsGoalPercent: boundedNumber(data?.savingsGoal, 0, 100, DEFAULT_FINANCIAL_TARGETS.savingsGoalPercent, false),
    emergencyFundMonths: boundedNumber(data?.emergencyFund, 1, 24, DEFAULT_FINANCIAL_TARGETS.emergencyFundMonths, true),
  };
}
