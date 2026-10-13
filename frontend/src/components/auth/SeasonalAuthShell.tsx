"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./SeasonalAuthShell.module.css";
import { useSeasonalThemeEnabled } from "@/src/lib/seasonalThemePreference";
import {
  resolveSeasonalAuthTheme,
  type SeasonalAuthTheme,
} from "@/src/lib/seasonal-auth";

/**
 * MYFINANCE-SEASONAL-AUTH-CINEMATIC-LIGHT-1
 * Full-bleed cinematic seasonal backgrounds with a clean light auth card.
 * Shared shell only; auth logic, routes, form handling, and Supabase flows
 * remain unchanged.
 */
function useSeasonalAuthTheme(): SeasonalAuthTheme {
  const seasonalEnabled = useSeasonalThemeEnabled();
  const [season, setSeason] = useState<SeasonalAuthTheme>("off");

  useEffect(() => {
    const refresh = () => {
      const requested = new URLSearchParams(window.location.search).get("season");
      setSeason(seasonalEnabled ? resolveSeasonalAuthTheme(new Date(), requested) : "off");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const initial = window.setTimeout(refresh, 0);
    const rollover = window.setInterval(refresh, 60 * 60 * 1000);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("popstate", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(rollover);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("popstate", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [seasonalEnabled]);

  return seasonalEnabled ? season : "off";
}

export function SeasonalAuthShell({ children }: { children: ReactNode }) {
  const season = useSeasonalAuthTheme();

  return (
    <main
      data-myfinance-auth-season={season}
      className={`${styles.shell} relative isolate flex min-h-screen min-h-dvh w-full items-center justify-center overflow-hidden p-4`}
    >
      {season !== "off" ? <div className={styles.scene} aria-hidden="true" /> : null}
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
