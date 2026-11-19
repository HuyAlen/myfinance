"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ActiveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";

/**
 * MYFINANCE-SEASONAL-SKINS-1
 * Three visual treatments PER season, independent of light/dark preference.
 * Only chrome and decoration are themed; finance data and semantic colors aren't.
 * Older installations have no skin keys, so the original look is preserved.
 */
export type SeasonalSkin = "classic" | "pastel" | "festival";
export type SeasonalSkinSeason = ActiveSeasonalAuthTheme;

export const SKIN_STORAGE_PREFIX = "myfinance-seasonal-skin-v1:";
export const SKIN_ATTRIBUTE = "data-finance-season-skin";
const SEASON_ATTRIBUTE = "data-finance-workspace-season";
const SKIN_CHANGE_EVENT = "myfinance:seasonal-skin-changed";

export const SKIN_CHOICES = [
  { value: "classic", label: "Nguyên bản", description: "Giao diện hiện tại" },
  { value: "pastel", label: "Pastel", description: "Nhẹ nhàng, dịu mắt" },
  { value: "festival", label: "Lễ hội", description: "Sắc màu nổi bật" },
] as const satisfies ReadonlyArray<{ value: SeasonalSkin; label: string; description: string }>;

export const SKIN_SEASONS = [
  { value: "spring", label: "Xuân", icon: "🌸", art: "/seasonal-workspace/spring-page.svg", colors: ["#f9e9f2", "#cbead9", "#e579a5"] },
  { value: "summer", label: "Hạ", icon: "☀️", art: "/seasonal-workspace/summer-page.svg", colors: ["#d9f6fd", "#fff0c8", "#159cca"] },
  { value: "autumn", label: "Thu", icon: "🍁", art: "/seasonal-workspace/autumn-page.svg", colors: ["#ffeddb", "#f9d9b9", "#db7839"] },
  { value: "halloween", label: "Halloween", icon: "🎃", art: "/seasonal-workspace/halloween-page.svg", colors: ["#f3eaf9", "#ffe5cb", "#ba72ca"] },
  { value: "birthday", label: "Sinh nhật", icon: "🎂", art: "/seasonal-workspace/birthday-page.svg", colors: ["#f9e9f6", "#e2eafe", "#d878ac"] },
  { value: "christmas", label: "Giáng sinh", icon: "🎄", art: "/seasonal-workspace/christmas-page.svg", colors: ["#e2f5ec", "#fce0e1", "#2b9471"] },
  { value: "newyear", label: "Năm mới", icon: "✨", art: "/seasonal-workspace/newyear-page.svg", colors: ["#ece6ff", "#fff0c7", "#8d72d5"] },
  { value: "tet", label: "Tết", icon: "🧧", art: "/seasonal-workspace/tet-page.svg", colors: ["#ffe4e7", "#fff0cd", "#df576d"] },
] as const satisfies ReadonlyArray<{
  value: SeasonalSkinSeason;
  label: string;
  icon: string;
  art: string;
  colors: readonly [string, string, string];
}>;

const ephemeral = new Map<SeasonalSkinSeason, SeasonalSkin>();

export function isSkinSeason(value: string | null): value is SeasonalSkinSeason {
  return SKIN_SEASONS.some((season) => season.value === value);
}

export function parseSeasonalSkin(value: string | null): SeasonalSkin {
  return value === "pastel" || value === "festival" ? value : "classic";
}

export function seasonalSkinKey(season: SeasonalSkinSeason): string {
  return `${SKIN_STORAGE_PREFIX}${season}`;
}

export function readSeasonalSkin(season: SeasonalSkinSeason): SeasonalSkin {
  if (typeof window === "undefined") return "classic";
  const inMemory = ephemeral.get(season);
  if (inMemory) return inMemory;
  try {
    return parseSeasonalSkin(window.localStorage.getItem(seasonalSkinKey(season)));
  } catch {
    return "classic";
  }
}

/** Idempotent, safe to call on mount, route change, toggle and cross-tab updates. */
export function syncSeasonalSkinForDocument(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const activeSeason = root.getAttribute(SEASON_ATTRIBUTE);
  const next = isSkinSeason(activeSeason) ? readSeasonalSkin(activeSeason) : "classic";
  const current = root.getAttribute(SKIN_ATTRIBUTE);
  if (next === "classic") {
    if (current !== null) root.removeAttribute(SKIN_ATTRIBUTE);
  } else if (current !== next) {
    root.setAttribute(SKIN_ATTRIBUTE, next);
  }
}

/** Unknown storage keys never trigger seasonal updates. Null means storage.clear(). */
export function isSeasonalSkinStorageKey(key: string | null): boolean {
  return key === null || (key.startsWith(SKIN_STORAGE_PREFIX) && isSkinSeason(key.slice(SKIN_STORAGE_PREFIX.length)));
}

export function handleSeasonalSkinStorage(event: StorageEvent): void {
  if (!isSeasonalSkinStorageKey(event.key)) return;
  if (event.key === null) {
    ephemeral.clear();
  } else {
    const season = event.key.slice(SKIN_STORAGE_PREFIX.length);
    if (isSkinSeason(season)) ephemeral.delete(season);
  }
  syncSeasonalSkinForDocument();
}

export function setSeasonalSkin(season: SeasonalSkinSeason, skin: SeasonalSkin): void {
  if (typeof window === "undefined" || !isSkinSeason(season)) return;
  if (skin !== "classic" && skin !== "pastel" && skin !== "festival") return;
  if (readSeasonalSkin(season) === skin) return;

  try {
    window.localStorage.setItem(seasonalSkinKey(season), skin);
    ephemeral.delete(season);
  } catch {
    // Private/managed browsers may deny storage. Keep this tab interactive.
    ephemeral.set(season, skin);
  }

  // The active season changes immediately; other seasons are saved for later.
  syncSeasonalSkinForDocument();
  window.dispatchEvent(new Event(SKIN_CHANGE_EVENT));
}

function subscribeToSeasonalSkin(season: SeasonalSkinSeason, changed: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onLocal = () => changed();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== seasonalSkinKey(season)) return;
    handleSeasonalSkinStorage(event);
    changed();
  };
  window.addEventListener(SKIN_CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SKIN_CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

function serverSkin(): SeasonalSkin {
  return "classic";
}

/** Hydration-safe reactive preview, with independent cross-tab updates. */
export function useSeasonalSkin(season: SeasonalSkinSeason): SeasonalSkin {
  const subscribe = useCallback((changed: () => void) => subscribeToSeasonalSkin(season, changed), [season]);
  const snapshot = useCallback(() => readSeasonalSkin(season), [season]);
  return useSyncExternalStore(subscribe, snapshot, serverSkin);
}

/** Optional date window per season; absent means the original automatic calendar. */
export type SeasonalDateWindow = { start: string; end: string };
export const SEASONAL_SCHEDULE_PREFIX = "myfinance-seasonal-date-window-v1:";
export const SEASONAL_SCHEDULE_CHANGED = "myfinance:seasonal-schedule-changed";
const datePattern = /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/;
export function isValidSeasonalDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function isValidSeasonalDateWindow(value: SeasonalDateWindow): boolean {
  return isValidSeasonalDate(value.start) && isValidSeasonalDate(value.end) && value.start <= value.end;
}
export function readSeasonalDateWindow(season: SeasonalSkinSeason): SeasonalDateWindow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEASONAL_SCHEDULE_PREFIX + season);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const candidate = value as SeasonalDateWindow;
    return isValidSeasonalDateWindow(candidate) ? candidate : null;
  } catch { return null; }
}
export function readAllSeasonalDateWindows(): Partial<Record<SeasonalSkinSeason, SeasonalDateWindow>> {
  return Object.fromEntries(SKIN_SEASONS.flatMap(({ value }) => {
    const window = readSeasonalDateWindow(value);
    return window ? [[value, window]] : [];
  })) as Partial<Record<SeasonalSkinSeason, SeasonalDateWindow>>;
}
export function getSeasonalScheduleConflict(season: SeasonalSkinSeason, window: SeasonalDateWindow): SeasonalSkinSeason | null {
  const other = readAllSeasonalDateWindows();
  return SKIN_SEASONS.find(({ value }) => value !== season && other[value] && window.start <= other[value]!.end && other[value]!.start <= window.end)?.value ?? null;
}
export function saveSeasonalDateWindow(season: SeasonalSkinSeason, dateWindow: SeasonalDateWindow | null): boolean {
  if (typeof window === "undefined" || !isSkinSeason(season)) return false;
  if (dateWindow && (!isValidSeasonalDateWindow(dateWindow) || getSeasonalScheduleConflict(season, dateWindow))) return false;
  try {
    if (dateWindow) window.localStorage.setItem(SEASONAL_SCHEDULE_PREFIX + season, JSON.stringify(dateWindow));
    else window.localStorage.removeItem(SEASONAL_SCHEDULE_PREFIX + season);
  } catch { return false; }
  window.dispatchEvent(new Event(SEASONAL_SCHEDULE_CHANGED));
  return true;
}
/** Asia/Ho_Chi_Minh is UTC+7 without daylight-saving transitions. */
export function vietnamDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function resolveScheduledSeason(now: Date): SeasonalSkinSeason | null {
  const today = vietnamDate(now);
  for (const { value } of SKIN_SEASONS) {
    const window = readSeasonalDateWindow(value);
    if (window && window.start <= today && today <= window.end) return value;
  }
  return null;
}
