/**
 * MYFINANCE-SEASONAL-AUTH-1
 * Presentation-only season selection for existing auth screens.
 * Dates use the browser's LOCAL calendar, not UTC ISO substrings.
 * Unknown preview values never become image paths or CSS classes.
 */
export type SeasonalAuthTheme =
  | "off"
  | "spring"
  | "summer"
  | "autumn"
  | "halloween"
  | "birthday"
  | "christmas"
  | "newyear"
  | "tet";

export type ActiveSeasonalAuthTheme = Exclude<SeasonalAuthTheme, "off">;

export const SEASONAL_AUTH_PREVIEWS: readonly ActiveSeasonalAuthTheme[] = [
  "spring",
  "summer",
  "autumn",
  "halloween",
  "birthday",
  "christmas",
  "newyear",
  "tet",
] as const;

/** Reviewed Vietnamese Gregorian dates for lunar New Year's Day. */
export const VIETNAMESE_TET_DAY: Readonly<Record<number, string>> = {
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-02",
  2031: "2031-01-23",
  2032: "2032-02-11",
  2033: "2033-01-31",
  2034: "2034-02-19",
  2035: "2035-02-08",
  2036: "2036-01-28",
};

function isTetWindow(now: Date): boolean {
  const localYear = now.getFullYear();
  const date = VIETNAMESE_TET_DAY[localYear];
  if (!date) return false; // Do not guess dates for unreviewed years.

  const [year, month, day] = date.split("-").map(Number);
  // Date.UTC only measures differences between LOCAL calendar day keys; it
  // never converts the user's actual clock or selected season to UTC.
  const todayKey = Date.UTC(localYear, now.getMonth(), now.getDate());
  const tetKey = Date.UTC(year, month - 1, day);
  const deltaDays = Math.round((todayKey - tetKey) / 86_400_000);
  return deltaDays >= -7 && deltaDays <= 7;
}

/** Explicit ?season=<allowlisted value> has priority over the calendar. */
export function resolveSeasonalAuthTheme(
  now: Date,
  requestedSeason?: string | null,
): SeasonalAuthTheme {
  const requested = requestedSeason?.trim().toLowerCase();
  if (requested === "off" || requested === "default") return "off";
  if (
    requested &&
    SEASONAL_AUTH_PREVIEWS.some((value) => value === requested)
  ) {
    return requested as ActiveSeasonalAuthTheme;
  }

  if (!Number.isFinite(now.getTime())) return "off";
  if (isTetWindow(now)) return "tet";

  const month = now.getMonth(); // 0 = January; browser-local.
  const day = now.getDate();
  if ((month === 11 && day >= 27) || (month === 0 && day <= 3)) {
    return "newyear";
  }
  if (month === 11) return "christmas";
  // Halloween takes priority over autumn during the final 12 days of October.
  if (month === 9 && day >= 20) return "halloween";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "spring";
}
