import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const appShell = read("src/components/layout/AppShell.tsx");
const layout = read("app/layout.tsx");
const component = read("src/components/layout/SeasonalWorkspaceFlyby.tsx");
const css = read("app/seasonal-flyby.css");
const lib = read("src/lib/seasonalFlyby.ts");

describe("MYFINANCE-SEASONAL-THEMED-MOTION-1 integration", () => {
  it("keeps fly-by in authenticated shell but OUTSIDE sole page scroller", () => {
    expect(appShell).toContain('import SeasonalWorkspaceFlyby from "./SeasonalWorkspaceFlyby";');
    expect(appShell).toContain('<SeasonalWorkspaceFlyby />');
    expect(appShell.indexOf('<SeasonalWorkspaceFlyby />')).toBeGreaterThan(appShell.indexOf('</main>'));
    for (const guard of ['!shellChromeOverlayOpen &&', '!isGlobalFabSuppressed &&', '!aiAgentOpen &&', 'wizardDone &&', 'tourDone &&']) {
      expect(appShell).toContain(guard);
    }
    expect(appShell).toContain('className="finance-main');
    expect(appShell).toContain('overflow-y-auto');
    expect(layout).toContain('import "./seasonal-flyby.css";');
  });

  it("dispatches exactly one mode per season, not one generic horizontal animation", () => {
    expect(lib).toContain('mode: "fall"');
    expect(lib).toContain('mode: "glide"');
    expect(lib).toContain('mode: "launch-burst"');
    expect(component).toContain('nextSeasonalMotionPlan({');
    expect(component).toContain('plan.mode === "fall"');
    expect(component).toContain('plan.mode === "glide"');
    expect(component).toContain('plan.mode === "launch-burst"');
    expect(css).not.toContain('@keyframes financeSeasonFlybyRightToLeft');
    expect(css).not.toContain('@keyframes financeSeasonFlybyLeftToRight');
    expect(css).not.toContain('width: min(47%, 650px)');
  });

  it("Autumn leaves individually fall from ABOVE viewport to BELOW it", () => {
    expect(component).toContain('className="finance-season-autumn-leaf"');
    expect(css).toContain('@keyframes financeSeasonAutumnLeafFall');
    expect(css).toContain('translate3d(0, -110px, 0)');
    expect(css).toContain('calc(100dvh + 90px)');
    expect(css).toContain('--leaf-drift');
    expect(css).toContain('--leaf-sway');
    expect(css).toContain('--leaf-duration');
    expect(css).toContain('url("/seasonal-workspace/flyby/autumn-single-leaf.svg")');
    const leaf = read('public/seasonal-workspace/flyby/autumn-single-leaf.svg');
    expect(leaf.startsWith('<svg')).toBe(true);
    expect(leaf).toContain('</svg>');
    expect(statSync(resolve(process.cwd(), 'public/seasonal-workspace/flyby/autumn-single-leaf.svg')).size).toBeLessThan(2_000);
    expect(leaf).not.toMatch(/<script|<foreignObject|<image|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
  });

  it("Christmas crosses BOTH edges diagonally while bobbing up and down", () => {
    expect(css).toContain('@keyframes financeSeasonSleighRightToLeft');
    expect(css).toContain('@keyframes financeSeasonSleighLeftToRight');
    expect(css).toContain('calc(100vw + 30px)');
    expect(css).toContain('calc(-100% - 30px)');
    expect(css).toContain('--sleigh-end-y');
    expect(css).toContain('--sleigh-mid-y');
    expect(css).toContain('--sleigh-late-y');
    expect(css).toContain('@keyframes financeSeasonSleighFloat');
    expect(css).toContain('1700ms ease-in-out 6 alternate both');
    expect(css).toContain('christmas-reindeer.svg');
    expect(component).toContain('className="finance-season-sleigh-bob"');
  });

  it("Tet rocket RISES BEFORE a 12-ray radial BURST, then both fade away", () => {
    expect(css).toContain('@keyframes financeTetRocketLaunch');
    expect(css).toContain('@keyframes financeTetBurstVisibility');
    expect(css).toContain('@keyframes financeTetSparkSpread');
    expect(css).toContain('@keyframes financeTetBurstRing');
    expect(css).toContain('var(--firework-rise, -560px)');
    expect(css).toContain('var(--firework-travel, 560px)');
    expect(css).toContain('0%, 7%');
    expect(css).toContain('35%');
    expect(css).toContain('41%');
    expect(css).toContain('89%, 100%');
    expect(component).toContain('className="finance-season-tet-rocket"');
    expect(component).toContain('className="finance-season-tet-spark"');
    expect(component).toContain('SPARK_ANGLES.map');
    expect(component).toContain('length: 12');
  });

  it("never intercepts interaction, never touches finance data, respects off/quiet/mobile/reduced motion", () => {
    expect(css).toContain('.finance-shell > .finance-season-flyby {');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('height: 100%;');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('contain: layout paint;');
    expect(css).not.toMatch(/position:\s*fixed|z-index:\s*(?:50|100)\b/);
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media print');
    expect(css).toContain(':root:not([data-finance-workspace-season])');
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(component).toContain('get("flyby") === "preview"');
    expect(component).toContain('document.hidden');
    expect(component).toContain('main.addEventListener("scroll"');
    expect(component).toContain('document.addEventListener("pointerdown"');
    expect(component).toContain('document.addEventListener("keydown"');
    expect(component).toContain('document.addEventListener("focusin"');
    expect(component).toContain('MutationObserver');
    expect(component).toContain('aria-modal="true"');
    expect(component).not.toMatch(/fetch\(|supabase|wallet|amount|useAuth|localStorage|sessionStorage|setInterval/);
    expect(css).not.toContain('animation-iteration-count: infinite');
    expect(css).not.toContain('background-attachment: fixed');
  });

  it("retains the original small SVGs for backwards compatibility, including Santa sleigh", () => {
    for (const file of ["autumn-leaves.svg", "christmas-reindeer.svg", "tet-blossoms.svg"]) {
      const path = `public/seasonal-workspace/flyby/${file}`;
      const svg = read(path);
      expect(svg.startsWith('<svg'), path).toBe(true);
      expect(svg).toContain('</svg>');
      expect(svg).not.toMatch(/<script|<foreignObject|<image|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
      expect(statSync(resolve(process.cwd(), path)).size).toBeLessThan(8_000);
    }
    expect(css).toContain('url("/seasonal-workspace/flyby/christmas-reindeer.svg")');
  });
});
