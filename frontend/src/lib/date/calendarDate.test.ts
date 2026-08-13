import { describe, expect, it } from "vitest";
import {
  getMonthDateRange,
  isValidISODate,
  isValidYearMonth,
} from "./calendarDate";

describe("isValidYearMonth", () => {
  it("accepts valid months", () => {
    expect(isValidYearMonth("2026-01")).toBe(true);
    expect(isValidYearMonth("2026-12")).toBe(true);
    expect(isValidYearMonth("2026-02")).toBe(true);
  });

  it("rejects month 00 and month 13", () => {
    expect(isValidYearMonth("2026-00")).toBe(false);
    expect(isValidYearMonth("2026-13")).toBe(false);
  });

  it("rejects a completely invalid shape", () => {
    expect(isValidYearMonth("0000-00")).toBe(false);
    expect(isValidYearMonth("not-a-month")).toBe(false);
    expect(isValidYearMonth("2026-1")).toBe(false);
    expect(isValidYearMonth("2026/01")).toBe(false);
  });
});

describe("getMonthDateRange — calendar-correct month expansion", () => {
  it.each([
    ["2026-01", "2026-01-01", "2026-01-31"],
    ["2026-02", "2026-02-01", "2026-02-28"], // non-leap February
    ["2028-02", "2028-02-01", "2028-02-29"], // leap February
    ["2026-04", "2026-04-01", "2026-04-30"],
    ["2026-06", "2026-06-01", "2026-06-30"],
    ["2026-09", "2026-09-01", "2026-09-30"],
    ["2026-11", "2026-11-01", "2026-11-30"],
    ["2026-12", "2026-12-01", "2026-12-31"],
  ])("%s -> %s .. %s", (month, expectedFrom, expectedTo) => {
    const range = getMonthDateRange(month);
    expect(range?.dateFrom).toBe(expectedFrom);
    expect(range?.dateTo).toBe(expectedTo);
  });

  it("returns undefined for an invalid month rather than a fabricated date", () => {
    expect(getMonthDateRange("2026-13")).toBeUndefined();
    expect(getMonthDateRange("2026-00")).toBeUndefined();
    expect(getMonthDateRange("not-a-month")).toBeUndefined();
  });

  describe("Gregorian leap-year rules (divisible by 4, except by 100, unless by 400)", () => {
    it.each([
      ["2000-02", 29], // divisible by 400 -> leap
      ["2024-02", 29], // divisible by 4, not by 100 -> leap
      ["2028-02", 29], // divisible by 4, not by 100 -> leap
      ["1900-02", 28], // divisible by 100, not by 400 -> not leap
      ["2026-02", 28], // not divisible by 4 -> not leap
      ["2100-02", 28], // divisible by 100, not by 400 -> not leap
    ])("%s has %i days", (month, expectedDays) => {
      const range = getMonthDateRange(month);
      const [, , dayStr] = range!.dateTo.split("-");
      expect(Number(dayStr)).toBe(expectedDays);
    });
  });
});

describe("isValidISODate", () => {
  it("accepts real calendar dates, including leap-day February", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-12-31")).toBe(true);
    expect(isValidISODate("2026-04-30")).toBe(true);
  });

  it("rejects a non-existent Feb 29 in a non-leap year", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
  });

  it("rejects impossible days for short/30-day months", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-02-31")).toBe(false);
    expect(isValidISODate("2026-04-31")).toBe(false);
    expect(isValidISODate("2026-06-31")).toBe(false);
    expect(isValidISODate("2026-09-31")).toBe(false);
    expect(isValidISODate("2026-11-31")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidISODate("2026-00-10")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("rejects an out-of-range day", () => {
    expect(isValidISODate("2026-01-00")).toBe(false);
    expect(isValidISODate("2026-01-32")).toBe(false);
  });

  it("rejects non-ISO shapes rather than normalizing them", () => {
    expect(isValidISODate("08/12/2026")).toBe(false);
    expect(isValidISODate("2026-8-1")).toBe(false);
  });

  it("does not rely on JS Date's silent month-rollover normalization", () => {
    // new Date(2026, 1, 31) would silently normalize to March 3 — this must
    // be rejected outright instead of being treated as a valid date.
    expect(isValidISODate("2026-02-31")).toBe(false);
  });
});
