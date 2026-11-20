import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEASONAL_SCHEDULE_CHANGED,
  SEASONAL_SCHEDULE_PREFIX,
  SEASONAL_SCHEDULE_PRIORITY,
  isValidSeasonalDate,
  isValidSeasonalDateWindow,
  readSeasonalDateWindow,
  resolveScheduledSeason,
  saveSeasonalDateWindow,
  saveSeasonalScheduleDrafts,
  validateSeasonalScheduleDrafts,
  vietnamDate,
} from "./seasonalThemeSkins";

afterEach(() => vi.unstubAllGlobals());

function setupStorage() {
  const data = new Map<string, string>();
  const events: string[] = [];
  let failKey: string | null = null;
  class FakeEvent { constructor(public type: string) {} }
  vi.stubGlobal("Event", FakeEvent);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failKey) {
          failKey = null;
          throw new Error("Simulated storage failure");
        }
        data.set(key, value);
      },
      removeItem: (key: string) => { data.delete(key); },
    },
    dispatchEvent: (event: FakeEvent) => { events.push(event.type); return true; },
  });
  return { data, events, failNextWrite: (key: string) => { failKey = key; } };
}

describe("MYFINANCE-SEASONAL-SINGLE-SAVE-1", () => {
  it("accepts valid ISO dates and rejects invalid or reversed date ranges", () => {
    expect(isValidSeasonalDate("2026-11-20")).toBe(true);
    expect(isValidSeasonalDate("2028-02-29")).toBe(true);
    expect(isValidSeasonalDate("2026-02-29")).toBe(false);
    expect(isValidSeasonalDate("2026-13-01")).toBe(false);
    expect(isValidSeasonalDate("20 Nov 2026")).toBe(false);
    expect(isValidSeasonalDateWindow({ start: "2026-11-20", end: "2026-12-26" })).toBe(true);
    expect(isValidSeasonalDateWindow({ start: "2026-12-26", end: "2026-11-20" })).toBe(false);
  });

  it("stores multiple seasons under one Save and restores the automatic mode on Save", () => {
    const storage = setupStorage();
    const christmas = { start: "2026-11-20", end: "2026-12-26" };
    const tet = { start: "2027-02-01", end: "2027-02-12" };
    const drafts = { christmas, tet };
    expect(validateSeasonalScheduleDrafts(drafts)).toBeNull();
    expect(readSeasonalDateWindow("christmas")).toBeNull(); // edits are drafts
    saveSeasonalScheduleDrafts(drafts);
    expect(readSeasonalDateWindow("christmas")).toEqual(christmas);
    expect(readSeasonalDateWindow("tet")).toEqual(tet);
    expect(storage.events).toEqual([SEASONAL_SCHEDULE_CHANGED]);
    expect(resolveScheduledSeason(new Date("2026-11-19T17:00:00.000Z"))).toBe("christmas");

    saveSeasonalScheduleDrafts({ christmas: null });
    expect(readSeasonalDateWindow("christmas")).toBeNull();
    expect(readSeasonalDateWindow("tet")).toEqual(tet);
    expect(storage.events).toHaveLength(2);
  });

  it("activates the chosen Christmas skin window from November 20 to December 26 in Vietnam", () => {
    setupStorage();
    const christmas = { start: "2026-11-20", end: "2026-12-26" };
    saveSeasonalScheduleDrafts({ christmas });
    expect(readSeasonalDateWindow("christmas")).toEqual(christmas);
    expect(resolveScheduledSeason(new Date("2026-11-19T16:59:59.000Z"))).toBeNull();
    expect(resolveScheduledSeason(new Date("2026-11-19T17:00:00.000Z"))).toBe("christmas");
    expect(resolveScheduledSeason(new Date("2026-12-26T16:59:59.000Z"))).toBe("christmas");
    expect(resolveScheduledSeason(new Date("2026-12-26T17:00:00.000Z"))).toBeNull();
  });

  it("allows the user's overlapping Autumn + Christmas dates, with Christmas taking priority", () => {
    const storage = setupStorage();
    const autumn = { start: "2026-09-01", end: "2026-12-31" };
    const christmas = { start: "2026-11-20", end: "2026-12-26" };
    saveSeasonalScheduleDrafts({ autumn });
    expect(validateSeasonalScheduleDrafts({ christmas })).toBeNull();
    saveSeasonalScheduleDrafts({ christmas });
    expect(storage.data.has(SEASONAL_SCHEDULE_PREFIX + "christmas")).toBe(true);
    expect(readSeasonalDateWindow("autumn")).toEqual(autumn);
    expect(readSeasonalDateWindow("christmas")).toEqual(christmas);
    // 00:00 and 23:59:59 Vietnam time, including the first and last day.
    expect(resolveScheduledSeason(new Date("2026-11-19T16:59:59.000Z"))).toBe("autumn");
    expect(resolveScheduledSeason(new Date("2026-11-19T17:00:00.000Z"))).toBe("christmas");
    expect(resolveScheduledSeason(new Date("2026-12-26T16:59:59.000Z"))).toBe("christmas");
    expect(resolveScheduledSeason(new Date("2026-12-26T17:00:00.000Z"))).toBe("autumn");
    expect(storage.events).toHaveLength(2);
  });

  it("prioritizes special days consistently even when multiple holiday windows overlap", () => {
    setupStorage();
    expect(SEASONAL_SCHEDULE_PRIORITY.indexOf("christmas")).toBeLessThan(
      SEASONAL_SCHEDULE_PRIORITY.indexOf("autumn"),
    );
    saveSeasonalScheduleDrafts({
      autumn: { start: "2026-09-01", end: "2027-01-10" },
      christmas: { start: "2026-11-20", end: "2026-12-31" },
      newyear: { start: "2026-12-27", end: "2027-01-05" },
      birthday: { start: "2026-12-30", end: "2026-12-30" },
    });
    expect(resolveScheduledSeason(new Date("2026-12-25T05:00:00Z"))).toBe("christmas");
    expect(resolveScheduledSeason(new Date("2026-12-27T05:00:00Z"))).toBe("newyear");
    expect(resolveScheduledSeason(new Date("2026-12-30T05:00:00Z"))).toBe("birthday");
    expect(resolveScheduledSeason(new Date("2027-01-06T05:00:00Z"))).toBe("autumn");
  });

  it("retains invalid-date validation and does not touch saved seasons on failure", () => {
    const storage = setupStorage();
    saveSeasonalScheduleDrafts({ autumn: { start: "2026-09-01", end: "2026-12-31" } });
    const priorEvents = storage.events.length;
    const invalid = { christmas: { start: "2026-12-26", end: "2026-11-20" } };
    expect(validateSeasonalScheduleDrafts(invalid)).toContain("không hợp lệ");
    expect(() => saveSeasonalScheduleDrafts(invalid)).toThrow("không hợp lệ");
    expect(storage.data.has(SEASONAL_SCHEDULE_PREFIX + "christmas")).toBe(false);
    expect(storage.events).toHaveLength(priorEvents);
  });

  it("keeps the single-season save helper compatible with overlapping windows", () => {
    setupStorage();
    expect(saveSeasonalDateWindow("autumn", { start: "2026-09-01", end: "2026-12-31" })).toBe(true);
    expect(saveSeasonalDateWindow("christmas", { start: "2026-11-20", end: "2026-12-26" })).toBe(true);
    expect(resolveScheduledSeason(new Date("2026-11-20T05:00:00Z"))).toBe("christmas");
  });

  it("rolls back the entire batch if a write fails, with no success event", () => {
    const storage = setupStorage();
    storage.data.set(
      SEASONAL_SCHEDULE_PREFIX + "spring",
      JSON.stringify({ start: "2026-03-01", end: "2026-03-31" }),
    );
    const savedBefore = new Map(storage.data);
    storage.failNextWrite(SEASONAL_SCHEDULE_PREFIX + "tet");
    expect(() => saveSeasonalScheduleDrafts({
      spring: { start: "2026-04-01", end: "2026-04-15" },
      tet: { start: "2027-02-01", end: "2027-02-15" },
    })).toThrow("Simulated storage failure");
    expect(storage.data).toEqual(savedBefore);
    expect(storage.events).toEqual([]);
  });

  it("produces ISO Vietnamese dates across UTC midnight, independent of browser locale", () => {
    expect(vietnamDate(new Date("2026-11-19T16:59:59.000Z"))).toBe("2026-11-19");
    expect(vietnamDate(new Date("2026-11-19T17:00:00.000Z"))).toBe("2026-11-20");
  });
});
