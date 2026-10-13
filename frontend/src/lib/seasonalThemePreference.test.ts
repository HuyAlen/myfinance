import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSeasonalThemeEnabled,
  readSeasonalThemeEnabled,
  SEASONAL_THEME_STORAGE_KEY,
  setSeasonalThemeEnabled,
  toggleSeasonalThemeEnabled,
} from "./seasonalThemePreference";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MYFINANCE-SEASONAL-THEME-SETTINGS-1", () => {
  it("preserves default-enabled behavior for existing users", () => {
    expect(parseSeasonalThemeEnabled(null)).toBe(true);
    expect(parseSeasonalThemeEnabled("on")).toBe(true);
    expect(parseSeasonalThemeEnabled("other")).toBe(true);
  });

  it("honors OFF across legacy representations", () => {
    for (const value of ["off", "false", "0"]) {
      expect(parseSeasonalThemeEnabled(value)).toBe(false);
    }
  });

  it("reads the browser preference without requiring auth or DB", () => {
    const values = new Map([[SEASONAL_THEME_STORAGE_KEY, "off"]]);
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => values.get(key) ?? null },
    });
    expect(readSeasonalThemeEnabled()).toBe(false);
    values.set(SEASONAL_THEME_STORAGE_KEY, "on");
    expect(readSeasonalThemeEnabled()).toBe(true);
  });

  it("clears workspace decoration synchronously when turned off", () => {
    const values = new Map<string, string>();
    const removed: string[] = [];
    const events: string[] = [];
    let appliedSeason: string | null = null;
    class FakeEvent { constructor(public type: string) {} }
    vi.stubGlobal("Event", FakeEvent);
    vi.stubGlobal("document", {
      documentElement: {
        removeAttribute: (name: string) => { removed.push(name); appliedSeason = null; },
        getAttribute: () => appliedSeason,
        setAttribute: (_name: string, value: string) => { appliedSeason = value; },
      },
    });
    vi.stubGlobal("window", {
      localStorage: {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key) ?? null,
      },
      location: { search: "?season=autumn" },
      dispatchEvent: (event: FakeEvent) => { events.push(event.type); return true; },
    });
    setSeasonalThemeEnabled(false);
    expect(values.get(SEASONAL_THEME_STORAGE_KEY)).toBe("off");
    expect(readSeasonalThemeEnabled()).toBe(false);
    expect(removed).toEqual(["data-finance-workspace-season"]);
    expect(events).toEqual(["myfinance:seasonal-theme-preference-changed"]);
    setSeasonalThemeEnabled(true);
    expect(readSeasonalThemeEnabled()).toBe(true);
    expect(appliedSeason).toBe("autumn");
    expect(removed).toHaveLength(1);
  });

  it("handles immediate double toggle without waiting for React rerender", () => {
    const values = new Map<string, string>();
    const events: string[] = [];
    let applied: string | null = "autumn";
    class FakeEvent { constructor(public type: string) {} }
    vi.stubGlobal("Event", FakeEvent);
    vi.stubGlobal("document", {
      documentElement: {
        getAttribute: () => applied,
        setAttribute: (_key: string, value: string) => { applied = value; },
        removeAttribute: () => { applied = null; },
      },
    });
    vi.stubGlobal("window", {
      location: { search: "?season=autumn" },
      localStorage: {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key) ?? null,
      },
      dispatchEvent: (event: FakeEvent) => { events.push(event.type); return true; },
    });

    toggleSeasonalThemeEnabled();
    expect(readSeasonalThemeEnabled()).toBe(false);
    expect(applied).toBeNull();
    toggleSeasonalThemeEnabled();
    expect(readSeasonalThemeEnabled()).toBe(true);
    expect(applied).toBe("autumn");
    expect(events).toEqual([
      "myfinance:seasonal-theme-preference-changed",
      "myfinance:seasonal-theme-preference-changed",
    ]);

    // A no-op setter must not cause another React update / flyby restart.
    setSeasonalThemeEnabled(true);
    expect(events).toHaveLength(2);
  });

  it("respects ?season=off even after the ON switch is restored", () => {
    const values = new Map<string, string>();
    const removed: string[] = [];
    const writes: string[] = [];
    class FakeEvent { constructor(public type: string) {} }
    vi.stubGlobal("Event", FakeEvent);
    vi.stubGlobal("document", {
      documentElement: {
        getAttribute: () => "autumn",
        setAttribute: (_key: string, value: string) => writes.push(value),
        removeAttribute: (key: string) => removed.push(key),
      },
    });
    vi.stubGlobal("window", {
      location: { search: "?season=off" },
      localStorage: {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key) ?? null,
      },
      dispatchEvent: () => true,
    });

    setSeasonalThemeEnabled(false);
    setSeasonalThemeEnabled(true);
    expect(writes).toEqual([]);
    expect(removed).toEqual([
      "data-finance-workspace-season",
      "data-finance-workspace-season",
    ]);
  });

  it("remains operable when localStorage writes are blocked", () => {
    const events: string[] = [];
    class FakeEvent { constructor(public type: string) {} }
    vi.stubGlobal("Event", FakeEvent);
    vi.stubGlobal("document", {
      documentElement: {
        removeAttribute: () => undefined,
        getAttribute: () => null,
        setAttribute: () => undefined,
      },
    });
    vi.stubGlobal("window", {
      location: { search: "?season=autumn" },
      localStorage: {
        setItem: () => { throw new Error("disabled"); },
        getItem: () => { throw new Error("disabled"); },
      },
      dispatchEvent: (event: FakeEvent) => { events.push(event.type); return true; },
    });
    setSeasonalThemeEnabled(false);
    expect(readSeasonalThemeEnabled()).toBe(false);
    setSeasonalThemeEnabled(true);
    expect(readSeasonalThemeEnabled()).toBe(true);
    expect(events).toHaveLength(2);
  });
});
