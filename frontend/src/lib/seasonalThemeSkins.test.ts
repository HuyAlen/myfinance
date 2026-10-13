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
      setItem: (key: string, value: string) => { saved.set(key, value); },
    },
    dispatchEvent: (e: FakeEvent) => { changes.push(e.type); return true; },
  });
  return { saved, attributes, changes, writes };
}

describe("MYFINANCE-SEASONAL-SKINS-1", () => {
  it("offers 3 skins for each of the 6 supported seasons and no arbitrary values", () => {
    expect(SKIN_CHOICES.map((item) => item.value)).toEqual(["classic", "pastel", "festival"]);
    expect(SKIN_SEASONS.map((item) => item.value)).toEqual([
      "spring", "summer", "autumn", "christmas", "newyear", "tet",
    ]);
    expect(SKIN_SEASONS).toHaveLength(6);
    expect(isSkinSeason("autumn")).toBe(true);
    expect(isSkinSeason("../../theme")).toBe(false);
    expect(parseSeasonalSkin("pastel")).toBe("pastel");
    expect(parseSeasonalSkin("festival")).toBe("festival");
    expect(parseSeasonalSkin("classic")).toBe("classic");
    expect(parseSeasonalSkin("script")).toBe("classic");
  });

  it("defaults to the old classic look, independently for all six seasons", () => {
    setup();
    for (const season of SKIN_SEASONS) expect(readSeasonalSkin(season.value)).toBe("classic");
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

  it("rejects unrecognized season or skin at runtime", () => {
    const runtime = setup();
    const season = "summer" as SeasonalSkinSeason;
    setSeasonalSkin(season, "../bad" as never);
    setSeasonalSkin("../bad" as SeasonalSkinSeason, "pastel");
    expect(runtime.saved.size).toBe(0);
  });
});
