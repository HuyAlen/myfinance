"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";
import {
  handleSeasonalSkinStorage,
  syncSeasonalSkinForDocument,
} from "@/src/lib/seasonalThemeSkins";
import {
  readSeasonalThemeEnabled,
  useSeasonalThemeEnabled,
} from "@/src/lib/seasonalThemePreference";

/**
 * MYFINANCE-WORKSPACE-SEASONAL-ALL-PAGES-1
 * One passive document theme signal for the authenticated AppShell.
 * The CSS targets only .finance-shell .finance-main, never auth forms,
 * widgets, fixed header, navigation, charts, or overlays.
 */
const ATTRIBUTE = "data-finance-workspace-season";

export default function SeasonalWorkspaceThemeController() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSeason = searchParams?.get("season") ?? null;
  const seasonalEnabled = useSeasonalThemeEnabled();

  useEffect(() => {
    let nextMidnightTimer: number | undefined;

    const refresh = () => {
      const now = new Date();
      const theme = resolveSeasonalAuthTheme(now, requestedSeason);
      const root = document.documentElement;

      // Always consult the latest store value: a pending React effect from
      // the previous render must never restore an already-disabled theme.
      if (theme === "off" || !readSeasonalThemeEnabled()) {
        if (root.hasAttribute(ATTRIBUTE)) root.removeAttribute(ATTRIBUTE);
      } else if (root.getAttribute(ATTRIBUTE) !== theme) {
        root.setAttribute(ATTRIBUTE, theme);
      }

      // Match the saved visual treatment to the ACTIVE season, including OFF.
      syncSeasonalSkinForDocument();

      // The next day is evaluated in the browser's local time, including DST.
      // Do not use a fixed 24-hour interval to detect a calendar boundary.
      if (nextMidnightTimer !== undefined) {
        window.clearTimeout(nextMidnightTimer);
      }
      const nextMidnight = new Date(
        now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1,
      );
      const delay = Math.max(1_000, nextMidnight.getTime() - now.getTime());
      nextMidnightTimer = window.setTimeout(refresh, delay);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const onSkinStorage = (event: StorageEvent) => handleSeasonalSkinStorage(event);
    // The existing seasonal on/off setter updates the season attribute before
    // dispatching this event. Apply the saved skin in the same event turn.
    const onPreferenceChange = () => syncSeasonalSkinForDocument();

    refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("storage", onSkinStorage);
    window.addEventListener("myfinance:seasonal-theme-preference-changed", onPreferenceChange);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (nextMidnightTimer !== undefined) window.clearTimeout(nextMidnightTimer);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("storage", onSkinStorage);
      window.removeEventListener("myfinance:seasonal-theme-preference-changed", onPreferenceChange);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [pathname, requestedSeason, seasonalEnabled]);

  // Only the AppShell consumes this attribute. Clear it if this controller
  // unmounts, but do not flicker the background on ordinary route changes.
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute(ATTRIBUTE);
      syncSeasonalSkinForDocument();
    };
  }, []);

  return null;
}
