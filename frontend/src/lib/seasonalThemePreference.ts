"use client";

import { useSyncExternalStore } from "react";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";

/**
 * MYFINANCE-SEASONAL-THEME-SETTINGS-1
 * Per-browser seasonal presentation preference, independent of Light/Dark/System.
 * ON is the backward-compatible default; OFF is authoritative even for ?season=
 * preview URLs. No auth, household, finance or database state is affected.
 */
export const SEASONAL_THEME_STORAGE_KEY = "myfinance-seasonal-theme-enabled";
const CHANGE_EVENT = "myfinance:seasonal-theme-preference-changed";
const WORKSPACE_ATTRIBUTE = "data-finance-workspace-season";

let ephemeralPreference: boolean | null = null;

export function parseSeasonalThemeEnabled(stored: string | null): boolean {
  return stored !== "off" && stored !== "false" && stored !== "0";
}

export function readSeasonalThemeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  if (ephemeralPreference !== null) return ephemeralPreference;
  try {
    return parseSeasonalThemeEnabled(window.localStorage.getItem(SEASONAL_THEME_STORAGE_KEY));
  } catch {
    return true;
  }
}

function subscribeSeasonalThemeChange(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleLocalChange = () => onStoreChange();
  const handleCrossTabChange = (event: StorageEvent) => {
    if (event.key !== null && event.key !== SEASONAL_THEME_STORAGE_KEY) return;
    // The other tab is authoritative when localStorage is available.
    ephemeralPreference = null;
    // Apply the cross-tab change immediately; React subscribers follow.
    syncSeasonalWorkspaceVisuals(readSeasonalThemeEnabled());
    onStoreChange();
  };

  window.addEventListener(CHANGE_EVENT, handleLocalChange);
  window.addEventListener("storage", handleCrossTabChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleLocalChange);
    window.removeEventListener("storage", handleCrossTabChange);
  };
}

function serverSnapshot(): boolean {
  return true;
}

/** React 19 hydration-safe, reactive across components and browser tabs. */
export function useSeasonalThemeEnabled(): boolean {
  return useSyncExternalStore(
    subscribeSeasonalThemeChange,
    readSeasonalThemeEnabled,
    serverSnapshot,
  );
}

/**
 * Avoid a frame where the switch has changed but the old wallpaper remains.
 * A new attribute value is written only when it actually differs. This also
 * prevents resetting the flyby MutationObserver on redundant refreshes.
 */
function syncSeasonalWorkspaceVisuals(enabled: boolean): void {
  const root = document.documentElement;
  if (!enabled) {
    root.removeAttribute(WORKSPACE_ATTRIBUTE);
    return;
  }

  const requested = new URLSearchParams(window.location.search).get("season");
  const nextSeason = resolveSeasonalAuthTheme(new Date(), requested);
  if (nextSeason === "off") {
    root.removeAttribute(WORKSPACE_ATTRIBUTE);
  } else if (root.getAttribute(WORKSPACE_ATTRIBUTE) !== nextSeason) {
    root.setAttribute(WORKSPACE_ATTRIBUTE, nextSeason);
  }
}

export function setSeasonalThemeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (readSeasonalThemeEnabled() === enabled) return;

  try {
    window.localStorage.setItem(SEASONAL_THEME_STORAGE_KEY, enabled ? "on" : "off");
    ephemeralPreference = null;
  } catch {
    // Storage may be blocked. Keep the switch operational in this tab.
    ephemeralPreference = enabled;
  }

  // Update the visible theme before broadcasting the new store snapshot.
  // This eliminates the old ON-lag / OFF-now asymmetry during rapid taps.
  syncSeasonalWorkspaceVisuals(enabled);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Re-read the store on EACH click rather than toggling a stale React render. */
export function toggleSeasonalThemeEnabled(): void {
  setSeasonalThemeEnabled(!readSeasonalThemeEnabled());
}
