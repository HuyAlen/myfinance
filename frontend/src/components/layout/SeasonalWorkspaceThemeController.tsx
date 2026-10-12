"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";

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

  useEffect(() => {
    let nextMidnightTimer: number | undefined;

    const refresh = () => {
      const now = new Date();
      const theme = resolveSeasonalAuthTheme(now, requestedSeason);
      const root = document.documentElement;

      if (theme === "off") {
        root.removeAttribute(ATTRIBUTE);
      } else {
        root.setAttribute(ATTRIBUTE, theme);
      }

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

    refresh();
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (nextMidnightTimer !== undefined) window.clearTimeout(nextMidnightTimer);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [pathname, requestedSeason]);

  // Only the AppShell consumes this attribute. Clear it if this controller
  // unmounts, but do not flicker the background on ordinary route changes.
  useEffect(() => {
    return () => document.documentElement.removeAttribute(ATTRIBUTE);
  }, []);

  return null;
}
