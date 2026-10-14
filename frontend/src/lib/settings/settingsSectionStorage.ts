/**
 * SETTINGS-SAVE-BOUNDARY-1 — Per-section updates of the existing versioned
 * account Settings snapshot. Never replaces other sections with stale React
 * draft values, never creates another key, and refuses malformed old storage.
 */
import {
  accountSettingsKey,
  SETTINGS_DATE_FORMAT_VERSION,
} from "@/src/lib/date/dateFormatPreference";

export type ProfileSection = {
  profileName: string;
  profilePhone: string;
  timezone: string;
  currency: string;
};

export type PreferencesSection = {
  lang: string;
  dateFormat: string;
  defaultPage: string;
};

export type FinancialSection = {
  finMonth: string;
  savingsGoal: string;
  budgetAlert: string;
  debtAlert: string;
  emergencyFund: string;
};

export type AIFeaturesSection = {
  aiInsights: boolean;
  aiForecast: boolean;
  aiRisk: boolean;
  aiGoalCoach: boolean;
  aiInvestCoach: boolean;
};

export type SettingsSectionData = {
  profile: ProfileSection;
  preferences: PreferencesSection;
  financial: FinancialSection;
  aiFeatures: AIFeaturesSection;
};
export type SettingsSaveSection = keyof SettingsSectionData;

const SECTION_KEYS: { [K in SettingsSaveSection]: readonly (keyof SettingsSectionData[K])[] } = {
  profile: ["profileName", "profilePhone", "timezone", "currency"],
  preferences: ["lang", "dateFormat", "defaultPage"],
  financial: ["finMonth", "savingsGoal", "budgetAlert", "debtAlert", "emergencyFund"],
  aiFeatures: ["aiInsights", "aiForecast", "aiRisk", "aiGoalCoach", "aiInvestCoach"],
};

export type SettingsStoragePort = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** One synchronous read/merge/write; no async gap in localStorage RMW. */
export function saveAccountSettingsSection<S extends SettingsSaveSection>(
  accountId: string | null | undefined,
  section: S,
  draft: Partial<SettingsSectionData[S]>,
  storage?: SettingsStoragePort,
): void {
  if (!accountId || accountId === "anonymous") {
    throw new Error("Không có tài khoản để lưu thiết lập.");
  }
  const allowed = SECTION_KEYS[section];
  if (!allowed || !draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("Nhóm cài đặt không hợp lệ.");
  }
  const keys = Object.keys(draft);
  if (keys.length === 0 || keys.some((key) => !allowed.includes(key as never))) {
    throw new Error("Có trường nằm ngoài nhóm cài đặt; không ghi đè dữ liệu.");
  }

  const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) throw new Error("Bộ nhớ cài đặt chưa sẵn sàng.");

  const key = accountSettingsKey(accountId);
  const raw = target.getItem(key);
  let previous: Record<string, unknown> = {};
  if (raw !== null) {
    const decoded: unknown = JSON.parse(raw);
    if (
      !decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      (decoded as Record<string, unknown>).version !== SETTINGS_DATE_FORMAT_VERSION
    ) {
      throw new Error("Cài đặt đã lưu không hợp lệ; chưa ghi đè dữ liệu cũ.");
    }
    previous = decoded as Record<string, unknown>;
  }
  target.setItem(key, JSON.stringify({ ...previous, version: SETTINGS_DATE_FORMAT_VERSION, ...draft }));
}
