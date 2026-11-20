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
/** Unsaved skin choices, committed with Settings > Lưu tùy chỉnh. */
export type SeasonalSkinDrafts = Partial<Record<SeasonalSkinSeason, SeasonalSkin>>;

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

/** Apply pending choices to the active page without writing to localStorage. */
export function previewSeasonalSkinDrafts(drafts: SeasonalSkinDrafts): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const active = root.getAttribute(SEASON_ATTRIBUTE);
  if (!isSkinSeason(active)) return;
  const skin = drafts[active];
  if (skin === undefined) {
    syncSeasonalSkinForDocument();
  } else if (skin === "classic") {
    root.removeAttribute(SKIN_ATTRIBUTE);
  } else if (skin === "pastel" || skin === "festival") {
    root.setAttribute(SKIN_ATTRIBUTE, skin);
  }
}

/** Notify page and React subscribers after either a commit or a rollback. */
export function refreshSeasonalSkinFromStorage(): void {
  if (typeof window === "undefined") return;
  ephemeral.clear();
  syncSeasonalSkinForDocument();
  window.dispatchEvent(new Event(SKIN_CHANGE_EVENT));
}

/** Persist all pending skins with verification and rollback on partial failure. */
export function saveSeasonalSkinDrafts(drafts: SeasonalSkinDrafts): void {
  if (Object.keys(drafts).some((key) => !isSkinSeason(key))) {
    throw new Error("Mùa skin không hợp lệ.");
  }
  const changed = SKIN_SEASONS.filter(({ value }) => Object.prototype.hasOwnProperty.call(drafts, value));
  if (changed.length === 0) return;
  if (typeof window === "undefined") throw new Error("Bộ nhớ skin chưa sẵn sàng.");
  for (const { value } of changed) {
    const skin = drafts[value];
    if (skin !== "classic" && skin !== "pastel" && skin !== "festival") {
      throw new Error("Lựa chọn skin không hợp lệ cho mùa " + value + ".");
    }
  }

  const storage = window.localStorage;
  const before = changed.map(({ value }) => ({
    key: seasonalSkinKey(value),
    oldValue: storage.getItem(seasonalSkinKey(value)),
  }));
  try {
    for (const { value } of changed) {
      const key = seasonalSkinKey(value);
      const skin = drafts[value]!;
      storage.setItem(key, skin);
      if (storage.getItem(key) !== skin) {
        throw new Error("Không xác nhận được skin đã lưu cho mùa " + value + ".");
      }
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const { key, oldValue } of before) {
      try {
        if (oldValue === null) storage.removeItem(key);
        else storage.setItem(key, oldValue);
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      throw new Error("Lưu skin thất bại và chưa thể khôi phục toàn bộ lựa chọn cũ.");
    }
    throw error;
  }
  refreshSeasonalSkinFromStorage();
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
/** Unsaved per-season overrides. null means restore the automatic calendar. */
export type SeasonalScheduleDrafts = Partial<Record<SeasonalSkinSeason, SeasonalDateWindow | null>>;
export const SEASONAL_SCHEDULE_PREFIX = "myfinance-seasonal-date-window-v1:";
export const SEASONAL_SCHEDULE_CHANGED = "myfinance:seasonal-schedule-changed";
/** Higher-priority schedules take over overlapping days without deleting other seasons.
 * Named holidays and birthdays override broad seasonal themes. This order never
 * depends on which tab edited first, storage insertion order or device locale.
 */
export const SEASONAL_SCHEDULE_PRIORITY = [
  "birthday", "tet", "newyear", "christmas", "halloween",
  "autumn", "summer", "spring",
] as const satisfies readonly SeasonalSkinSeason[];
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
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
/** Informational only; overlapping custom windows are allowed and resolved by priority. */
export function getSeasonalScheduleConflict(season: SeasonalSkinSeason, window: SeasonalDateWindow): SeasonalSkinSeason | null {
  const other = readAllSeasonalDateWindows();
  return SKIN_SEASONS.find(({ value }) => value !== season && other[value] && window.start <= other[value]!.end && other[value]!.start <= window.end)?.value ?? null;
}
export function saveSeasonalDateWindow(season: SeasonalSkinSeason, dateWindow: SeasonalDateWindow | null): boolean {
  if (typeof window === "undefined" || !isSkinSeason(season)) return false;
  if (dateWindow && !isValidSeasonalDateWindow(dateWindow)) return false;
  try {
    if (dateWindow) window.localStorage.setItem(SEASONAL_SCHEDULE_PREFIX + season, JSON.stringify(dateWindow));
    else window.localStorage.removeItem(SEASONAL_SCHEDULE_PREFIX + season);
  } catch { return false; }
  window.dispatchEvent(new Event(SEASONAL_SCHEDULE_CHANGED));
  return true;
}
/** Asia/Ho_Chi_Minh is UTC+7 without daylight-saving transitions. */
export function vietnamDate(now: Date): string {
  // formatToParts avoids locale-dependent order/separators on iOS Safari.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function resolveScheduledSeason(now: Date): SeasonalSkinSeason | null {
  const today = vietnamDate(now);
  for (const season of SEASONAL_SCHEDULE_PRIORITY) {
    const window = readSeasonalDateWindow(season);
    if (window && window.start <= today && today <= window.end) return season;
  }
  return null;
}


/** Validate only date syntax/ranges. Overlaps are legal: season priority decides. */
export function validateSeasonalScheduleDrafts(drafts: SeasonalScheduleDrafts): string | null {
  if (Object.keys(drafts).some((key) => !isSkinSeason(key))) {
    return "Mùa tùy chỉnh không hợp lệ.";
  }
  for (const { value, label } of SKIN_SEASONS) {
    if (!Object.prototype.hasOwnProperty.call(drafts, value)) continue;
    const candidate = drafts[value];
    if (candidate !== null && candidate !== undefined && !isValidSeasonalDateWindow(candidate)) {
      return "Ngày bắt đầu/kết thúc của mùa " + label + " không hợp lệ.";
    }
  }
  return null;
}

/** Persist a complete pending schedule edit in one verified batch, with rollback. */
export function saveSeasonalScheduleDrafts(drafts: SeasonalScheduleDrafts): void {
  const changed = SKIN_SEASONS.filter(({ value }) => Object.prototype.hasOwnProperty.call(drafts, value));
  if (changed.length === 0) return;
  if (typeof window === "undefined") throw new Error("Bộ nhớ lịch chưa sẵn sàng.");
  const error = validateSeasonalScheduleDrafts(drafts);
  if (error) throw new Error(error);

  const storage = window.localStorage;
  const before = changed.map(({ value }) => {
    const key = SEASONAL_SCHEDULE_PREFIX + value;
    return { key, original: storage.getItem(key) };
  });
  try {
    for (const { value } of changed) {
      const key = SEASONAL_SCHEDULE_PREFIX + value;
      const next = drafts[value] ?? null;
      if (next) storage.setItem(key, JSON.stringify(next));
      else storage.removeItem(key);
      const written = storage.getItem(key);
      if (next === null ? written !== null : written !== JSON.stringify(next)) {
        throw new Error("Không xác nhận được lịch đã lưu cho mùa " + value + ".");
      }
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const { key, original } of before) {
      try {
        if (original === null) storage.removeItem(key);
        else storage.setItem(key, original);
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) throw new Error("Lưu lịch thất bại và chưa thể khôi phục hoàn toàn dữ liệu cũ.");
    throw error;
  }
  window.dispatchEvent(new Event(SEASONAL_SCHEDULE_CHANGED));
}
