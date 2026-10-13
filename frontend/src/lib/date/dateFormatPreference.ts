"use client";
/** Per-account date display preference. The ONLY persistent source remains
 * the existing versioned MyFinance settings snapshot. No second storage key.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import {
  DEFAULT_DATE_DISPLAY_FORMAT,
  isDateDisplayFormat,
  type DateDisplayFormat,
} from "@/src/lib/date/dateDisplay";

export const DATE_FORMAT_PREFERENCE_CHANGED = "myfinance:date-format-preference-changed";
export const SETTINGS_DATE_FORMAT_VERSION = 1;
export function accountSettingsKey(accountId: string): string {
  return `myfinance-settings-v${SETTINGS_DATE_FORMAT_VERSION}:${accountId}`;
}
export function readAccountDateFormat(accountId: string | null | undefined): DateDisplayFormat {
  if (!accountId || typeof window === "undefined") return DEFAULT_DATE_DISPLAY_FORMAT;
  try {
    const raw = window.localStorage.getItem(accountSettingsKey(accountId));
    if (!raw) return DEFAULT_DATE_DISPLAY_FORMAT;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_DATE_DISPLAY_FORMAT;
    const values = parsed as {version?:unknown;dateFormat?:unknown};
    return values.version === SETTINGS_DATE_FORMAT_VERSION && isDateDisplayFormat(values.dateFormat)
      ? values.dateFormat : DEFAULT_DATE_DISPLAY_FORMAT;
  } catch {
    return DEFAULT_DATE_DISPLAY_FORMAT;
  }
}
function subscribeDateFormat(accountId: string | null, callback:()=>void):()=>void {
  if (typeof window === "undefined" || !accountId) return () => undefined;
  const onLocal = () => callback();
  const onStorage = (event:StorageEvent) => {
    if (event.key === null || event.key === accountSettingsKey(accountId)) callback();
  };
  window.addEventListener(DATE_FORMAT_PREFERENCE_CHANGED,onLocal);
  window.addEventListener("storage",onStorage);
  return () => {
    window.removeEventListener(DATE_FORMAT_PREFERENCE_CHANGED,onLocal);
    window.removeEventListener("storage",onStorage);
  };
}
export function notifyDateFormatSaved():void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATE_FORMAT_PREFERENCE_CHANGED));
}
function serverDateFormat(): DateDisplayFormat { return DEFAULT_DATE_DISPLAY_FORMAT; }
export function useAccountDateFormat():DateDisplayFormat {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const subscribe = useCallback((cb:()=>void)=>subscribeDateFormat(accountId,cb),[accountId]);
  const getSnapshot = useCallback(()=>readAccountDateFormat(accountId),[accountId]);
  return useSyncExternalStore(subscribe,getSnapshot,serverDateFormat);
}
