import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SKIN_ATTRIBUTE,
  SKIN_CHOICES,
  SKIN_SEASONS,
  handleSeasonalSkinStorage,
  isSeasonalSkinStorageKey,
  isSkinSeason,
  parseSeasonalSkin,
  readSeasonalSkin,
  previewSeasonalSkinDrafts,
  saveSeasonalSkinDrafts,
  seasonalSkinKey,
  setSeasonalSkin,
  syncSeasonalSkinForDocument,
  type SeasonalSkinSeason,
} from "./seasonalThemeSkins";

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const saved = new Map<string, string>();
  const attributes = new Map<string, string>();
  const changes: string[] = [];
  const writes: string[] = [];
  let failureKey: string | null = null;
  let ignoredKey: string | null = null;
  class FakeEvent { constructor(public type: string) {} }
  vi.stubGlobal("Event", FakeEvent);
  vi.stubGlobal("document", {
    documentElement: {
      getAttribute: (key: string) => attributes.get(key) ?? null,
      setAttribute: (key: string, value: string) => { attributes.set(key, value); writes.push(`${key}:${value}`); },
      removeAttribute: (key: string) => { attributes.delete(key); writes.push(`${key}:removed`); },
    },
  });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failureKey) {
          failureKey = null;
          throw new Error("Simulated storage failure");
        }
        if (key === ignoredKey) {
          ignoredKey = null;
          return;
        }
        saved.set(key, value);
      },
      removeItem: (key: string) => { saved.delete(key); },
    },
    dispatchEvent: (e: FakeEvent) => { changes.push(e.type); return true; },
  });
  return {
    saved, attributes, changes, writes,
    failNextWrite: (key: string) => { failureKey = key; },
    ignoreNextWrite: (key: string) => { ignoredKey = key; },
  };
}

describe("MYFINANCE-SEASONAL-SKINS-1", () => {
  it("offers 3 skins for each of the 8 supported themes and no arbitrary values", () => {
    expect(SKIN_CHOICES.map((item) => item.value)).toEqual(["classic", "pastel", "festival"]);
    expect(SKIN_SEASONS.map((item) => item.value)).toEqual([
      "spring", "summer", "autumn", "halloween", "birthday", "christmas", "newyear", "tet",
    ]);
    expect(SKIN_SEASONS).toHaveLength(8);
    expect(isSkinSeason("autumn")).toBe(true);
    expect(isSkinSeason("../../theme")).toBe(false);
    expect(parseSeasonalSkin("pastel")).toBe("pastel");
    expect(parseSeasonalSkin("festival")).toBe("festival");
    expect(parseSeasonalSkin("classic")).toBe("classic");
    expect(parseSeasonalSkin("script")).toBe("classic");
  });

  it("defaults to the old classic look, independently for all eight themes", () => {
    setup();
    for (const season of SKIN_SEASONS) expect(readSeasonalSkin(season.value)).toBe("classic");
  });

  it("persists Halloween independently from Autumn and updates an active Halloween immediately", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "halloween");
    setSeasonalSkin("halloween", "festival");
    setSeasonalSkin("autumn", "pastel");
    expect(readSeasonalSkin("halloween")).toBe("festival");
    expect(readSeasonalSkin("autumn")).toBe("pastel");
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("festival");
    expect(runtime.saved.get(seasonalSkinKey("halloween"))).toBe("festival");
    expect(isSeasonalSkinStorageKey(seasonalSkinKey("halloween"))).toBe(true);
  });

  it("stores a different skin for each season without changing another season", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "autumn");
    setSeasonalSkin("autumn", "pastel");
    setSeasonalSkin("tet", "festival");
    expect(readSeasonalSkin("autumn")).toBe("pastel");
    expect(readSeasonalSkin("tet")).toBe("festival");
    expect(readSeasonalSkin("summer")).toBe("classic");
    expect(runtime.saved.get(seasonalSkinKey("autumn"))).toBe("pastel");
    expect(runtime.saved.get(seasonalSkinKey("tet"))).toBe("festival");
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("pastel");
    expect(runtime.changes).toEqual([
      "myfinance:seasonal-skin-changed", "myfinance:seasonal-skin-changed",
    ]);
  });

  it("switches style immediately with no redundant DOM mutations", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "spring");
    setSeasonalSkin("spring", "festival");
    const firstWrites = runtime.writes.length;
    syncSeasonalSkinForDocument();
    setSeasonalSkin("spring", "festival");
    expect(runtime.writes.length).toBe(firstWrites);
    setSeasonalSkin("spring", "classic");
    expect(runtime.attributes.has(SKIN_ATTRIBUTE)).toBe(false);
  });

  it("does not keep a seasonal skin active when seasonal theme is disabled", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "christmas");
    setSeasonalSkin("christmas", "festival");
    runtime.attributes.delete("data-finance-workspace-season");
    syncSeasonalSkinForDocument();
    expect(runtime.attributes.has(SKIN_ATTRIBUTE)).toBe(false);
    expect(readSeasonalSkin("christmas")).toBe("festival");
  });

  it("updates the active style on cross-tab storage changes", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "tet");
    runtime.saved.set(seasonalSkinKey("tet"), "pastel");
    handleSeasonalSkinStorage({ key: seasonalSkinKey("tet") } as StorageEvent);
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("pastel");
    runtime.saved.set(seasonalSkinKey("tet"), "festival");
    handleSeasonalSkinStorage({ key: seasonalSkinKey("tet") } as StorageEvent);
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("festival");
    expect(isSeasonalSkinStorageKey("myfinance-theme-preference")).toBe(false);
    expect(isSeasonalSkinStorageKey(seasonalSkinKey("tet"))).toBe(true);
    expect(isSeasonalSkinStorageKey(null)).toBe(true);
  });

  it("previews without saving until one Settings Save commits all skins", () => {
    const runtime = setup();
    runtime.attributes.set("data-finance-workspace-season", "spring");
    previewSeasonalSkinDrafts({ spring: "festival", christmas: "pastel" });
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("festival");
    expect(readSeasonalSkin("spring")).toBe("classic");
    expect(runtime.saved.size).toBe(0);

    saveSeasonalSkinDrafts({ spring: "festival", christmas: "pastel" });
    expect(runtime.saved.get(seasonalSkinKey("spring"))).toBe("festival");
    expect(runtime.saved.get(seasonalSkinKey("christmas"))).toBe("pastel");
    expect(readSeasonalSkin("spring")).toBe("festival");
    expect(runtime.attributes.get(SKIN_ATTRIBUTE)).toBe("festival");
    expect(runtime.changes).toEqual(["myfinance:seasonal-skin-changed"]);
  });

  it("rolls back all skin changes if a later storage write fails", () => {
    const runtime = setup();
    runtime.saved.set(seasonalSkinKey("spring"), "pastel");
    runtime.failNextWrite(seasonalSkinKey("christmas"));
    expect(() => saveSeasonalSkinDrafts({ spring: "festival", christmas: "pastel" }))
      .toThrow("Simulated storage failure");
    expect(runtime.saved.get(seasonalSkinKey("spring"))).toBe("pastel");
    expect(runtime.saved.has(seasonalSkinKey("christmas"))).toBe(false);
    expect(runtime.changes).toEqual([]);
  });

  it("detects ignored storage writes instead of reporting a fake Save", () => {
    const runtime = setup();
    runtime.ignoreNextWrite(seasonalSkinKey("spring"));
    expect(() => saveSeasonalSkinDrafts({ spring: "festival" })).toThrow("Không xác nhận");
    expect(runtime.saved.size).toBe(0);
    expect(runtime.changes).toEqual([]);
  });

  it("rejects unrecognized season or skin at runtime", () => {
    const runtime = setup();
    const season = "summer" as SeasonalSkinSeason;
    setSeasonalSkin(season, "../bad" as never);
    setSeasonalSkin("../bad" as SeasonalSkinSeason, "pastel");
    expect(runtime.saved.size).toBe(0);
  });
});
