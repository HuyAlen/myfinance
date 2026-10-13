import { describe, expect, it } from "vitest";
import { resolveSeasonalAuthTheme } from "./seasonal-auth";
import {
  isAccountBirthdayToday, isValidBirthDateInput, parseAccountBirthDate,
  readAccountBirthDate, resolveAccountSeasonalTheme,
} from "./accountBirthdayTheme";

describe("MYFINANCE-ACCOUNT-BIRTHDAY-1 account authority", () => {
  it("validates account birth dates without using device persistence", () => {
    expect(parseAccountBirthDate("1990-07-12")).toBe("1990-07-12");
    expect(parseAccountBirthDate("2000-02-29")).toBe("2000-02-29");
    for (const invalid of [null, "", "2026-02-29", "1900-02-29", "2024-13-01", "2024-04-31", "../../image", "2024-1-1"]) {
      expect(parseAccountBirthDate(invalid)).toBeNull();
    }
    expect(readAccountBirthDate({ birth_date: "1995-03-08" })).toBe("1995-03-08");
    expect(readAccountBirthDate({ name: "Example" })).toBeNull();
    expect(isValidBirthDateInput("", new Date(2026, 9, 13))).toBe(true);
    expect(isValidBirthDateInput("2027-01-01", new Date(2026, 9, 13))).toBe(false);
    expect(isValidBirthDateInput("2026-10-13", new Date(2026, 9, 13))).toBe(true);
  });

  it("activates only on account birthday, with calendar and preview precedence", () => {
    const date = new Date(2026, 9, 25);
    const calendar = resolveSeasonalAuthTheme(date);
    expect(calendar).toBe("halloween");
    expect(resolveAccountSeasonalTheme(calendar, date, null, "1990-10-25")).toBe("birthday");
    expect(resolveAccountSeasonalTheme(calendar, date, null, "1994-10-26")).toBe("halloween");
    expect(resolveAccountSeasonalTheme(calendar, date, "halloween", "1990-10-25")).toBe("halloween");
    expect(resolveAccountSeasonalTheme(calendar, date, "off", "1990-10-25")).toBe("halloween");
    expect(resolveAccountSeasonalTheme("off", date, "off", "1990-10-25")).toBe("off");
    expect(resolveAccountSeasonalTheme("birthday", date, "birthday", null)).toBe("birthday");
  });

  it("handles leap-day birthdays on Feb 28 in ordinary years", () => {
    expect(isAccountBirthdayToday("2000-02-29", new Date(2026, 1, 28))).toBe(true);
    expect(isAccountBirthdayToday("2000-02-29", new Date(2028, 1, 28))).toBe(false);
    expect(isAccountBirthdayToday("2000-02-29", new Date(2028, 1, 29))).toBe(true);
  });

  it("does not leak one account's birthday into another account", () => {
    const alice = readAccountBirthDate({ birth_date: "1990-10-25" });
    const bob = readAccountBirthDate({ birth_date: "1995-03-08" });
    expect(resolveAccountSeasonalTheme("halloween", new Date(2026, 9, 25), null, alice)).toBe("birthday");
    expect(resolveAccountSeasonalTheme("halloween", new Date(2026, 9, 25), null, bob)).toBe("halloween");
    expect(resolveAccountSeasonalTheme("halloween", new Date(2026, 9, 25), null, null)).toBe("halloween");
  });
});
