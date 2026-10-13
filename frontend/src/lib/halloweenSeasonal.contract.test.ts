import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSeasonalAuthTheme, SEASONAL_AUTH_PREVIEWS } from "./seasonal-auth";
import { SKIN_CHOICES, SKIN_SEASONS, seasonalSkinKey } from "./seasonalThemeSkins";
import { nextSeasonalMotionPlan, resolveFlybySeason } from "./seasonalFlyby";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const workspace = read("app/seasonal-workspace.css");
const atmosphere = read("app/seasonal-page-atmosphere.css");
const skins = read("app/seasonal-skins.css");
const auth = read("src/components/auth/SeasonalAuthShell.module.css");
const flyby = read("app/seasonal-flyby.css");
const picker = read("src/components/settings/SeasonalSkinPicker.tsx");

describe("MYFINANCE-SEASONAL-HALLOWEEN-1 integration", () => {
  it("keeps Halloween alongside all account and calendar themes", () => {
    expect(SEASONAL_AUTH_PREVIEWS).toContain("halloween");
    expect(SEASONAL_AUTH_PREVIEWS).toHaveLength(8);
    expect(SKIN_SEASONS.map((season) => season.value)).toContain("halloween");
    expect(SKIN_SEASONS).toHaveLength(8);
    expect(SKIN_CHOICES.map((choice) => choice.value)).toEqual(["classic", "pastel", "festival"]);
    expect(seasonalSkinKey("halloween")).toBe("myfinance-seasonal-skin-v1:halloween");
  });

  it("gives Halloween a finite October 20-31 calendar window, local dates and explicit preview", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 19))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 20))).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 31))).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 10, 1))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 13), "halloween")).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 31), "off")).toBe("off");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 31), "autumn")).toBe("autumn");
  });

  it("reuses the existing skin picker with a temporary URL preview and reset", () => {
    expect(picker).toContain("SKIN_SEASONS.map");
    expect(picker).toContain('data-seasonal-season-preview="true"');
    expect(picker).toContain('data-seasonal-preview-reset="true"');
    expect(picker).toContain('url.searchParams.set("season", selectedSeason)');
    expect(picker).toContain('url.searchParams.delete("season")');
    expect(picker).toContain('router.replace(`${url.pathname}${url.search}`, { scroll: false })');
    expect(picker).toContain('disabled={!enabled || isPreviewing}');
  });

  it("only uses scoped background art, never overlays or finance semantic colors", () => {
    for (const area of ["sidebar", "topbar", "page"]) {
      const name = `public/seasonal-workspace/halloween-${area}.svg`;
      const svg = read(name);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('data-season-scene="halloween"');
      expect(statSync(resolve(process.cwd(), name)).size).toBeLessThan(22000);
      expect(workspace).toContain(`/seasonal-workspace/halloween-${area}.svg`);
    }
    const extras = [
      ["public/seasonal-workspace/page-atmosphere/halloween-hero.svg", 15000],
      ["public/seasonal-workspace/motion/halloween-a.svg", 3000],
      ["public/seasonal-workspace/motion/halloween-b.svg", 3000],
      ["public/seasonal-workspace/flyby/halloween-bats.svg", 8000],
      ["public/seasonal-auth/halloween-scene.svg", 15000],
    ] as const;
    for (const [name, limit] of extras) {
      const svg = read(name);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
      expect(statSync(resolve(process.cwd(), name)).size).toBeLessThan(limit);
    }
    expect(atmosphere).toContain('data-finance-workspace-season="halloween"');
    expect(auth).toContain('data-myfinance-auth-season="halloween"');
    for (const skin of ["pastel", "festival"]) {
      expect(skins).toContain(`data-finance-workspace-season="halloween"][data-finance-season-skin="${skin}"]`);
    }
    expect(skins).not.toMatch(/--finance-primary:|position:\s*fixed|pointer-events:\s*auto/);
    for (const name of [
      "public/seasonal-workspace/halloween-sidebar.svg",
      "public/seasonal-workspace/halloween-topbar.svg",
      "public/seasonal-workspace/halloween-page.svg",
      ...extras.map(([name]) => name),
    ]) {
      expect(read(name)).not.toMatch(/<script|<image|<foreignObject|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
    }
  });

  it("plays a single finite Halloween bat flyby on initial eligible mount", () => {
    expect(resolveFlybySeason("halloween")).toBe("halloween");
    const plan = nextSeasonalMotionPlan({ season: "halloween", mobile: true, random: () => 0.5 });
    expect(plan.season).toBe("halloween");
    expect(plan.mode).toBe("glide");
    expect(plan.durationMs).toBeGreaterThan(0);
    expect(plan.durationMs).toBeLessThan(13000);
    expect(flyby).toContain('data-seasonal-flyby="halloween"');
    expect(flyby).toContain('halloween-bats.svg');
  });
});
