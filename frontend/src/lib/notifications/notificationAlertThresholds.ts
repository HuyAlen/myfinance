"use client";
/** Alert preferences use the existing account-scoped Settings snapshot. */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { accountSettingsKey, SETTINGS_DATE_FORMAT_VERSION } from "@/src/lib/date/dateFormatPreference";
import { NOTIFICATION_PREFERENCES_CHANGED } from "./notificationPreferences";

export type NotificationAlertThresholds = { budgetAlert: number; debtAlert: number };
export const DEFAULT_NOTIFICATION_ALERT_THRESHOLDS: Readonly<NotificationAlertThresholds> = Object.freeze({
  budgetAlert: 80,
  debtAlert: 50,
});
export function checkedPercent(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= max ? numeric : fallback;
}
export function readAccountNotificationAlertThresholds(accountId: string | null | undefined): NotificationAlertThresholds {
  if (!accountId || typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_ALERT_THRESHOLDS };
  try {
    const raw = window.localStorage.getItem(accountSettingsKey(accountId));
    if (!raw) return { ...DEFAULT_NOTIFICATION_ALERT_THRESHOLDS };
    const snapshot: unknown = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return { ...DEFAULT_NOTIFICATION_ALERT_THRESHOLDS };
    }
    const data = snapshot as Record<string, unknown>;
    if (data.version !== SETTINGS_DATE_FORMAT_VERSION) return { ...DEFAULT_NOTIFICATION_ALERT_THRESHOLDS };
    return {
      budgetAlert: checkedPercent(data.budgetAlert, DEFAULT_NOTIFICATION_ALERT_THRESHOLDS.budgetAlert, 100),
      debtAlert: checkedPercent(data.debtAlert, DEFAULT_NOTIFICATION_ALERT_THRESHOLDS.debtAlert, 200),
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_ALERT_THRESHOLDS };
  }
}
/** Stable string snapshot: useSyncExternalStore must never return a fresh object every render. */
export function useAccountNotificationAlertThresholds(accountId: string | null | undefined): NotificationAlertThresholds {
  const subscribe = useCallback((callback: () => void) => {
    if (!accountId || typeof window === "undefined") return () => undefined;
    const onLocal = () => callback();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === accountSettingsKey(accountId)) callback();
    };
    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [accountId]);
  const getSnapshot = useCallback(() => {
    const values = readAccountNotificationAlertThresholds(accountId);
    return `${values.budgetAlert}|${values.debtAlert}`;
  }, [accountId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "80|50");
  return useMemo(() => {
    const components = snapshot.split("|");
    return {
      budgetAlert: Number(components[0] ?? "80"),
      debtAlert: Number(components[1] ?? "50"),
    };
  }, [snapshot]);
}
