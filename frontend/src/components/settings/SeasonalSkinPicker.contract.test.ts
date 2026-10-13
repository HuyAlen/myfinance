import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const page = read("src/components/settings/SettingsPage.tsx");
const picker = read("src/components/settings/SeasonalSkinPicker.tsx");
const controller = read("src/components/layout/SeasonalWorkspaceThemeController.tsx");
const skins = read("src/lib/seasonalThemeSkins.ts");
const layout = read("app/layout.tsx");
const css = read("app/seasonal-skins.css");

describe("MYFINANCE-SEASONAL-SKINS-1 settings and presentation contract", () => {
  it("places compact picker directly under the existing on/off control", () => {
    const start = page.indexOf('id="settings-preferences"');
    const end = page.indexOf('id="settings-financial"');
    const segment = page.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(page).toContain('import SeasonalSkinPicker from "@/src/components/settings/SeasonalSkinPicker";');
    expect(segment).toContain("<SeasonalThemeSettingsCard />");
    expect(segment).toContain("<SeasonalSkinPicker />");
    expect(segment.indexOf("<SeasonalSkinPicker />")).toBeGreaterThan(segment.indexOf("<SeasonalThemeSettingsCard />"));
    expect(page.match(/<SeasonalSkinPicker \/>/g)).toHaveLength(1);
  });

  it("renders all six tabs and three previews with full-area buttons and accessible labels", () => {
    expect(picker).toContain("SKIN_SEASONS.map");
    expect(picker).toContain("SKIN_CHOICES.map");
    expect(picker).toContain('role="group"');
    expect(picker).toContain("aria-pressed={selected}");
    expect(picker).toContain("aria-pressed={selectedSeason === season.value}");
    expect(picker).toContain("grid-cols-3");
    expect(picker).toContain("overflow-x-auto");
    expect(picker).toContain("min-h-10");
    expect(picker).toContain("setSeasonalSkin(selectedSeason");
  });

  it("loads the saved seasonal skin on refresh and on external updates", () => {
    expect(skins).toContain("useSyncExternalStore");
    expect(skins).toContain("window.localStorage.setItem");
    expect(skins).toContain('window.addEventListener("storage", onStorage)');
    expect(skins).toContain('const activeSeason = root.getAttribute(SEASON_ATTRIBUTE)');
    expect(controller).toContain("syncSeasonalSkinForDocument()");
    expect(controller).toContain("handleSeasonalSkinStorage(event)");
    expect(controller).toContain('window.addEventListener("storage", onSkinStorage)');
    expect(controller).toContain('window.addEventListener("myfinance:seasonal-theme-preference-changed", onPreferenceChange)');
  });

  it("keeps classic presentation backward compatible; two extra skins for each season", () => {
    expect(layout).toContain('import "./seasonal-skins.css";');
    for (const season of ["spring", "summer", "autumn", "christmas", "newyear", "tet"]) {
      for (const skin of ["pastel", "festival"]) {
        expect(css).toContain(`data-finance-workspace-season="${season}"][data-finance-season-skin="${skin}"]`);
      }
    }
    expect(css).not.toContain("data-finance-season-skin=\"classic\"");
    expect(css).not.toMatch(/(?:finance-main|finance-shell)\s+(?:button|input|select)|--finance-primary:/);
    expect(css).not.toContain("pointer-events: auto");
    expect(css).not.toContain("position: fixed");
  });

  it("keeps login imagery, dark mode, reduced-motion and finance state intact", () => {
    expect(css).toContain("[data-myfinance-auth-season]");
    expect(css).toContain('data-theme="dark"');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(skins).not.toMatch(/supabase|fetch\(|indexedDB|sessionStorage|financeStorage/);
    expect(picker).not.toMatch(/fetch\(|supabase|<dialog|<form/);
  });
});
