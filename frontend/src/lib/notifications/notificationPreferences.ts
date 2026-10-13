"use client";

/**
 * MYFINANCE-NOTIFICATION-SETTINGS-SSOT-1.
 * The existing versioned per-account Settings snapshot is the ONLY storage
 * source. No second storage key, Supabase table or finance-data writes.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  accountSettingsKey,
  SETTINGS_DATE_FORMAT_VERSION,
} from "@/src/lib/date/dateFormatPreference";

export const NOTIFICATION_PREFERENCES_CHANGED =
  "myfinance:notification-preferences-changed";

export type SupportedNotificationPreferences = {
  notifBudget: boolean;
  notifGoal: boolean;
  notifDebt: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<SupportedNotificationPreferences> =
  Object.freeze({ notifBudget: true, notifGoal: true, notifDebt: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fromSnapshot(snapshot: Record<string, unknown>): SupportedNotificationPreferences {
  return {
    notifBudget:
      typeof snapshot.notifBudget === "boolean"
        ? snapshot.notifBudget
        : DEFAULT_NOTIFICATION_PREFERENCES.notifBudget,
    notifGoal:
      typeof snapshot.notifGoal === "boolean"
        ? snapshot.notifGoal
        : DEFAULT_NOTIFICATION_PREFERENCES.notifGoal,
    notifDebt:
      typeof snapshot.notifDebt === "boolean"
        ? snapshot.notifDebt
        : DEFAULT_NOTIFICATION_PREFERENCES.notifDebt,
  };
}

export function readAccountNotificationPreferences(
  accountId: string | null | undefined,
): SupportedNotificationPreferences {
  if (!accountId || typeof window === "undefined") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(accountSettingsKey(accountId));
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const snapshot: unknown = JSON.parse(raw);
    return isRecord(snapshot) && snapshot.version === SETTINGS_DATE_FORMAT_VERSION
      ? fromSnapshot(snapshot)
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

/**
 * Saves ONLY supported notification preferences, preserving profile, birthday,
 * theme, date format, numeric settings and any unknown snapshot fields.
 * Never reports success after a failed localStorage write.
 */
export function saveAccountNotificationPreferences(
  accountId: string | null | undefined,
  preferences: SupportedNotificationPreferences,
): void {
  if (!accountId || typeof window === "undefined") {
    throw new Error("Không có tài khoản để lưu thông báo.");
  }
  const key = accountSettingsKey(accountId);
  const raw = window.localStorage.getItem(key);
  let previous: Record<string, unknown> = {};
  if (raw) {
    const decoded: unknown = JSON.parse(raw);
    if (!isRecord(decoded) || decoded.version !== SETTINGS_DATE_FORMAT_VERSION) {
      throw new Error("Cấu hình hiện tại không hợp lệ; chưa ghi đè dữ liệu cũ.");
    }
    previous = decoded;
  }
  window.localStorage.setItem(
    key,
    JSON.stringify({
      ...previous,
      version: SETTINGS_DATE_FORMAT_VERSION,
      notifBudget: preferences.notifBudget,
      notifGoal: preferences.notifGoal,
      notifDebt: preferences.notifDebt,
    }),
  );
  // localStorage 'storage' fires on OTHER tabs only. Notify this tab explicitly.
  window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_CHANGED));
}

function preferenceMask(preferences: SupportedNotificationPreferences): number {
  return (preferences.notifBudget ? 1 : 0) |
    (preferences.notifGoal ? 2 : 0) |
    (preferences.notifDebt ? 4 : 0);
}

function subscribeAccountNotificationPreferences(
  accountId: string | null | undefined,
  callback: () => void,
): () => void {
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
}

/** Stable primitive snapshot; avoids useSyncExternalStore re-render loops. */
export function useAccountNotificationPreferences(
  accountId: string | null | undefined,
): SupportedNotificationPreferences {
  const subscribe = useCallback(
    (listener: () => void) => subscribeAccountNotificationPreferences(accountId, listener),
    [accountId],
  );
  const getSnapshot = useCallback(
    () => preferenceMask(readAccountNotificationPreferences(accountId)),
    [accountId],
  );
  const mask = useSyncExternalStore(subscribe, getSnapshot, () => 7);
  return useMemo(
    () => ({
      notifBudget: Boolean(mask & 1),
      notifGoal: Boolean(mask & 2),
      notifDebt: Boolean(mask & 4),
    }),
    [mask],
  );
}

const FINANCE_BASE_KINDS = new Set(["budget", "goal", "debt", "cash-flow", "finance"]);

/**
 * Filter at the VIEW boundary, leaving the complete active alert set intact.
 * Inactive preferences do NOT delete read IDs or reset first-seen timestamps.
 * Apply the canonical finance cap AFTER filtering, so disabled categories
 * cannot consume the eight slots intended for visible finance alerts.
 * Actionable review, recurring and household invite notifications are exempt.
 */
export function filterNotificationsByPreferences<T extends { id: string; kind?: string }>(
  notifications: readonly T[],
  preferences: SupportedNotificationPreferences,
  maxFinanceAlerts = 8,
): T[] {
  let shownFinance = 0;
  return notifications.filter((notification) => {
    if (notification.kind === "budget" && !preferences.notifBudget) return false;
    if (notification.kind === "goal" && !preferences.notifGoal) return false;
    if (notification.kind === "debt" && !preferences.notifDebt) return false;
    if (FINANCE_BASE_KINDS.has(notification.kind ?? "")) {
      if (shownFinance >= maxFinanceAlerts) return false;
      shownFinance += 1;
    }
    return true;
  });
}
