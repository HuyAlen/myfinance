/** MYFINANCE-ACCOUNT-BIRTHDAY-1
 * Birthday belongs to Supabase auth user_metadata.birth_date (YYYY-MM-DD).
 * Never save the date in browser theme preferences or household settings.
 * Only month/day drive the annually recurring, browser-local theme.
 */
import {
  SEASONAL_AUTH_PREVIEWS,
  type SeasonalAuthTheme,
} from "@/src/lib/seasonal-auth";

/** Reject impossible days and arbitrary strings, including invalid leap dates. */
export function parseAccountBirthDate(input: unknown): string | null {
  if (typeof input !== "string" || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(input)) return null;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return input;
}

export function readAccountBirthDate(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("birth_date" in metadata)) return null;
  return parseAccountBirthDate((metadata as { birth_date?: unknown }).birth_date);
}

/** Empty input clears the account field. Future and invalid dates are blocked. */
export function isValidBirthDateInput(value: string, today: Date = new Date()): boolean {
  if (value === "") return true;
  const parsed = parseAccountBirthDate(value);
  if (!parsed || !Number.isFinite(today.getTime())) return false;
  const [year, month, day] = parsed.split("-").map(Number);
  const birthLocal = new Date(year, month - 1, day);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return birthLocal.getTime() <= todayLocal.getTime();
}

/** Feb 29 birthdays are celebrated Feb 28 in non-leap years. */
export function isAccountBirthdayToday(value: unknown, now: Date): boolean {
  const parsed = parseAccountBirthDate(value);
  if (!parsed || !Number.isFinite(now.getTime()) || !isValidBirthDateInput(parsed, now)) return false;
  const [, month, day] = parsed.split("-").map(Number);
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  if (month === todayMonth && day === todayDay) return true;
  if (month !== 2 || day !== 29 || todayMonth !== 2 || todayDay !== 28) return false;
  const year = now.getFullYear();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return !leap;
}

/** Explicit ?season= always wins; birthday wins over Halloween, Tet and other calendar seasons. */
export function resolveAccountSeasonalTheme(
  calendar: SeasonalAuthTheme,
  now: Date,
  requestedSeason: string | null | undefined,
  accountBirthDate: unknown,
): SeasonalAuthTheme {
  const requested = requestedSeason?.trim().toLowerCase() ?? "";
  if (requested === "off" || requested === "default" ||
      SEASONAL_AUTH_PREVIEWS.some((item) => item === requested)) return calendar;
  return isAccountBirthdayToday(accountBirthDate, now) ? "birthday" : calendar;
}
