"use client";
/**
 * Notification settings sync via Supabase Auth USER metadata. No new table,
 * financial records, SQL policy or privileged service key is involved.
 * The versioned local Settings snapshot remains the on-device cache. The
 * authenticated metadata wins when it exists; absent data does not silently
 * upload another device's defaults. First-time cloud sync uses explicit Save.
 */
import { accountSettingsKey, SETTINGS_DATE_FORMAT_VERSION } from "@/src/lib/date/dateFormatPreference";
import {
  notifyNotificationPreferencesSaved,
  type SupportedNotificationPreferences,
} from "./notificationPreferences";
import type { NotificationAlertThresholds } from "./notificationAlertThresholds";

export const NOTIFICATION_CLOUD_METADATA_KEY = "myfinance_notification_preferences_v1";
export type NotificationCloudSettings = SupportedNotificationPreferences & NotificationAlertThresholds & { version: 1 };

export type AuthNotificationPort = {
  getUser: () => Promise<{
    data: { user: { id: string; user_metadata?: unknown } | null };
    error: { message: string } | null;
  }>;
  updateUser: (attributes: { data: Record<string, unknown> }) => Promise<{
    error: { message: string } | null;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validPercent(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}
export function toNotificationCloudSettings(
  preferences: SupportedNotificationPreferences,
  thresholds: NotificationAlertThresholds,
): NotificationCloudSettings {
  const payload: NotificationCloudSettings = { version: 1, ...preferences, ...thresholds };
  if (typeof payload.notifBudget !== "boolean" || typeof payload.notifGoal !== "boolean" ||
      typeof payload.notifDebt !== "boolean" || !validPercent(payload.budgetAlert, 100) ||
      !validPercent(payload.debtAlert, 200)) {
    throw new Error("Cấu hình thông báo không hợp lệ.");
  }
  return payload;
}
export function notificationCloudSettingsFromMetadata(metadata: unknown): NotificationCloudSettings | null {
  if (!isRecord(metadata)) return null;
  const data = metadata[NOTIFICATION_CLOUD_METADATA_KEY];
  if (!isRecord(data) || data.version !== 1 || typeof data.notifBudget !== "boolean" ||
      typeof data.notifGoal !== "boolean" || typeof data.notifDebt !== "boolean" ||
      !validPercent(data.budgetAlert, 100) || !validPercent(data.debtAlert, 200)) return null;
  return {
    version: 1,
    notifBudget: data.notifBudget,
    notifGoal: data.notifGoal,
    notifDebt: data.notifDebt,
    budgetAlert: data.budgetAlert,
    debtAlert: data.debtAlert,
  };
}

async function verifiedUser(accountId: string, auth: AuthNotificationPort) {
  const { data, error } = await auth.getUser();
  if (error || !data.user || data.user.id !== accountId) {
    throw new Error("Không thể xác minh tài khoản đồng bộ thông báo.");
  }
  return data.user;
}

/** Requires server authentication and exact account identity. Cloud errors are NOT reported as success. */
export async function pushNotificationCloudSettings(
  accountId: string,
  values: NotificationCloudSettings,
  auth: AuthNotificationPort,
): Promise<void> {
  if (!accountId || accountId === "local-ui-user") throw new Error("Không có phiên tài khoản đám mây.");
  const payload = toNotificationCloudSettings(values, values);
  await verifiedUser(accountId, auth);
  const { error } = await auth.updateUser({ data: { [NOTIFICATION_CLOUD_METADATA_KEY]: payload } });
  if (error) throw new Error("Lưu thông báo trên tài khoản không thành công.");
}
/** Returns null when cloud is not yet initialized. It never overwrites local preferences then. */
export async function pullNotificationCloudSettings(
  accountId: string,
  auth: AuthNotificationPort,
): Promise<NotificationCloudSettings | null> {
  if (!accountId || accountId === "local-ui-user") return null;
  const user = await verifiedUser(accountId, auth);
  return notificationCloudSettingsFromMetadata(user.user_metadata);
}

/** Preserve date format, account birthday, theme, AI flags and unknown local fields. */
export function applyNotificationCloudSettings(
  accountId: string,
  values: NotificationCloudSettings,
): boolean {
  if (!accountId || typeof window === "undefined") return false;
  const payload = toNotificationCloudSettings(values, values);
  const key = accountSettingsKey(accountId);
  const raw = window.localStorage.getItem(key);
  let previous: Record<string, unknown> = {};
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SETTINGS_DATE_FORMAT_VERSION) {
      throw new Error("Snapshot cục bộ không hợp lệ; không ghi đè.");
    }
    previous = parsed;
  }
  const next: Record<string, unknown> = {
    ...previous,
    version: SETTINGS_DATE_FORMAT_VERSION,
    notifBudget: payload.notifBudget,
    notifGoal: payload.notifGoal,
    notifDebt: payload.notifDebt,
    budgetAlert: String(payload.budgetAlert),
    debtAlert: String(payload.debtAlert),
  };
  if (Object.keys(next).every((field) => previous[field] === next[field]) &&
      Object.keys(next).length === Object.keys(previous).length) return false;
  window.localStorage.setItem(key, JSON.stringify(next));
  notifyNotificationPreferencesSaved();
  return true;
}
