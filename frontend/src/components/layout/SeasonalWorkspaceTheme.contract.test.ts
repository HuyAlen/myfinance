import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEASONAL_AUTH_PREVIEWS,
  resolveSeasonalAuthTheme,
} from "@/src/lib/seasonal-auth";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const css = read("app/seasonal-workspace.css");
const layout = read("app/layout.tsx");
const appShell = read("src/components/layout/AppShell.tsx");
const controller = read("src/components/layout/SeasonalWorkspaceThemeController.tsx");
const authCss = read("src/components/auth/SeasonalAuthShell.module.css");

const motifs = {
  spring: ["#E27AA8", "#5FB693"],
  summer: ["#19A7D4", "#F2B54B"],
  autumn: ["#E58A3C", "#C85537"],
  halloween: ["#F38B43", "#74549C"],
  birthday: ["#D878AC", "#6686C9"],
  christmas: ["#17674C", "#D14E5B"],
  newyear: ["#8A71D1", "#F6C865"],
  tet: ["#DC596D", "#F0B64A"],
} as const;

describe("MYFINANCE-WORKSPACE-SEASONAL-ALL-SURFACES-1", () => {
  it("keeps calendar/override logic, root integration and off mode", () => {
    expect(layout).toContain('import "./seasonal-workspace.css";');
    expect(layout).toContain("<SeasonalWorkspaceThemeController />");
    expect(controller).toContain("resolveSeasonalAuthTheme(now, requestedSeason)");
    expect(controller).toContain('searchParams?.get("season")');
    expect(controller).toContain("root.removeAttribute(ATTRIBUTE)");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "off")).toBe("off");
  });

  it("removes the 56px banner without changing the single scroll owner", () => {
    expect(appShell).not.toContain('import SeasonalWorkspaceRibbon from "./SeasonalWorkspaceRibbon"');
    expect(appShell).not.toContain("<SeasonalWorkspaceRibbon />");
    expect(appShell).toContain('className="finance-main');
    expect(appShell).toContain("overflow-y-auto");
    expect(css).toContain(".finance-season-ribbon-layer,");
    expect(css).toContain("display: none !important;");
  });

  it("styles sidebar, topbar, page, and shared dashboard hero separately", () => {
    for (const target of [
      ".finance-shell .finance-sidebar",
      ".finance-shell .finance-header",
      ".finance-shell .finance-main",
      '[data-dashboard-surface="hero-shell"]',
      '[data-dashboard-surface="hero-gradient"]',
    ]) {
      expect(css).toContain(target);
    }
    expect(css).toContain("nav > div > p");
    expect(css).toContain(".finance-header h2");
    expect(css).toContain(".finance-bottom-nav");
  });

  it("has 24 tiny vector illustration assets, three for each season", () => {
    expect(SEASONAL_AUTH_PREVIEWS).toHaveLength(8);
    for (const season of SEASONAL_AUTH_PREVIEWS) {
      for (const area of ["sidebar", "topbar", "page"]) {
        const name = `public/seasonal-workspace/${season}-${area}.svg`;
        const asset = read(name);
        expect(asset.startsWith("<svg"), name).toBe(true);
        expect(asset).toContain("</svg>");
        expect(statSync(resolve(process.cwd(), name)).size, name).toBeLessThan(22_000);
        expect(asset).not.toMatch(/<script|<foreignObject|<image|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
        expect(css).toContain(`url("/seasonal-workspace/${season}-${area}.svg")`);
      }
      for (const color of motifs[season]) {
        expect(read(`public/seasonal-workspace/${season}-sidebar.svg`)).toContain(color);
      }
    }
  });

  it("does not use a full-page scenic image, opacity veil, or fixed scroll wallpaper", () => {
    expect(css).not.toMatch(/-cinematic\.webp|-pastel\.webp|background-attachment:\s*fixed/);
    expect(css).not.toMatch(/\.finance-main\s*\{[^}]*\bopacity:\s*0\./);
    expect(css).toContain("background-attachment: scroll;");
    expect(css).not.toContain(".finance-main::before");
    expect(css).not.toContain(".finance-main::after");
  });

  it("preserves auth cinematic scenes, all finance semantic colors, and accessible interactions", () => {
    expect(authCss).toContain("/seasonal-auth/autumn-cinematic.webp");
    expect(authCss).toContain("/seasonal-auth/tet-cinematic.webp");
    expect(css).not.toMatch(/\.finance-main (?:button|input|select)|\.finance-shell \.text-(?:rose|emerald)|--finance-primary:/);
    expect(css).not.toContain("pointer-events: auto");
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain(':root[data-theme="dark"][data-finance-workspace-season]');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});


describe("MYFINANCE-SEASONAL-WORKSPACE-FINAL-POLISH-1", () => {
  it("makes Christmas unmistakable with evergreen needles, glass baubles, golden stars and snow", () => {
    for (const area of ["sidebar", "topbar", "page"]) {
      const asset = read(`public/seasonal-workspace/christmas-${area}.svg`);
      for (const detail of ["pine-needles", "ornament-bauble", "gold-star", "ice-snowflake"]) {
        expect(asset, area).toContain(`data-motif="${detail}"`);
      }
      expect(asset, area).toContain("#17674C");
      expect(asset, area).toContain("#D14E5B");
      expect(asset, area).toContain("#E6BA55");
      expect(asset, area).toContain("#78B8D9");
      expect(statSync(resolve(process.cwd(), `public/seasonal-workspace/christmas-${area}.svg`)).size).toBeLessThan(22_000);
    }
  });

  it("protects sidebar navigation labels and topbar controls with soft local fades", () => {
    expect(css).toContain("rgb(251 253 255 / 0.96) 0%");
    expect(css).toContain("rgb(251 253 255 / 0.32) 82%");
    expect(css).toContain("rgb(255 255 255 / 0.76) 43%");
    expect(css).toContain("rgb(19 30 40 / 0.74) 43%");
    expect(css).toContain("background-size: 100% 100%, auto 100%, cover;");
    expect(css).toContain("background-attachment: scroll;");
    expect(css).not.toMatch(/\.finance-(?:sidebar|header)\s*::(?:before|after)/);
  });

  it("retains eight independent themes, contrast-safe dark Christmas and off mode", () => {
    for (const season of SEASONAL_AUTH_PREVIEWS) {
      expect(css).toContain(`data-finance-workspace-season="${season}"`);
    }
    expect(css).toContain('data-theme="dark"][data-finance-workspace-season="christmas"]');
    expect(css).toContain("color: #A6E8CD;");
    expect(css).toContain(".finance-season-ribbon");
    expect(css).toContain("display: none !important;");
    expect(css).not.toMatch(/-cinematic\.webp|-pastel\.webp|\.finance-main\s+(?:button|input|select)/);
    expect(css).not.toContain("--finance-primary:");
  });
});


describe("MYFINANCE-SEASONAL-WORKSPACE-AMBIENT-MOTION-1", () => {
  const motion = read("src/components/layout/SeasonalWorkspaceAmbientMotion.tsx");
  const sidebar = read("src/components/layout/Sidebar.tsx");
  const header = read("src/components/layout/Header.tsx");

  it("adds decorative particles to sidebar, topbar and page margins without layout changes", () => {
    expect(motion).toContain('type AmbientArea = "sidebar" | "topbar" | "page";');
    expect(motion).toContain('aria-hidden="true"');
    expect(motion).toContain('data-seasonal-motion-area={area}');
    expect(sidebar).toContain('<SeasonalWorkspaceAmbientMotion area="sidebar" />');
    expect(header).toContain('<SeasonalWorkspaceAmbientMotion area="topbar" />');
    expect(appShell).toContain('<SeasonalWorkspaceAmbientMotion area="page" />');
    expect(css).toContain("pointer-events: none;");
    expect(css).toContain("contain: layout paint;");
    expect(css).toContain("finance-season-motion--page");
    expect(css).not.toContain("animation: infinite");
  });

  it("uses twelve local transparent SVG sprites for distinct seasonal motions", () => {
    for (const season of SEASONAL_AUTH_PREVIEWS) {
      for (const motif of ["a", "b"]) {
        const file = `public/seasonal-workspace/motion/${season}-${motif}.svg`;
        const svg = read(file);
        expect(svg.startsWith("<svg"), file).toBe(true);
        expect(svg).toContain("</svg>");
        expect(svg).not.toMatch(/<script|<image|<foreignObject|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
        expect(statSync(resolve(process.cwd(), file)).size).toBeLessThan(3000);
        expect(css).toContain(`url("/seasonal-workspace/motion/${season}-${motif}.svg")`);
      }
    }
  });

  it("has distinct gentle motion for leaves, snow, shimmer, lanterns, and floating petals", () => {
    for (const name of [
      "financeSeasonGentleFall", "financeSeasonSnowDrift",
      "financeSeasonShimmer", "financeSeasonLanternSway",
    ]) expect(css).toContain(`@keyframes ${name}`);
    for (const season of ["spring", "summer", "autumn", "halloween", "birthday", "christmas", "newyear", "tet"]) {
      expect(css).toContain(`data-finance-workspace-season="${season}"`);
    }
  });

  it("disables all decorative motion for off, reduced-motion and mobile page data", () => {
    expect(css).toContain(".finance-season-motion {");
    expect(css).toContain("display: none;");
    expect(css).toContain(':root[data-finance-workspace-season] .finance-shell .finance-season-motion {');
    expect(css).toContain("@media (prefers-reduced-motion: reduce) {");
    expect(css).toContain(".finance-shell .finance-season-motion { display: none !important; }");
    expect(css).toContain(".finance-shell .finance-season-motion--page { display: none !important; }");
    expect(css).toContain(".finance-season-motion-particle:nth-child(n+4) { display: none; }");
    expect(motion).not.toMatch(/useEffect|setInterval|requestAnimationFrame|window\.|document\./);
    expect(css).not.toMatch(/background-attachment:\s*fixed/);
  });
});


describe("MYFINANCE-SEASONAL-WORKSPACE-MOTION-VISIBILITY-FIX-1", () => {
  const motion = read("src/components/layout/SeasonalWorkspaceAmbientMotion.tsx");

  it("uses six staggered particles in each of the existing three areas", () => {
    expect(motion.match(/className="finance-season-motion-particle"/g)).toHaveLength(6);
    expect(motion).toContain('aria-hidden="true"');
    expect(css).toContain('animation-delay: -2.5s;');
    expect(css).toContain('animation-delay: -6.7s;');
    expect(css).toContain('animation-duration: 7.4s;');
    expect(css).toContain('animation-duration: 9.6s;');
    expect(css).not.toContain('animation-duration: 21s;');
  });

  it("travels a perceptible distance rather than almost static motion", () => {
    expect(css).toContain('translate3d(13px, 160px, 0)');
    expect(css).toContain('translate3d(42px, 13px, 0)');
    expect(css).toContain('opacity: 0.94;');
    expect(css).toContain('width: 29px;');
    expect(css).toContain('financeSeasonTopbarGlide');
    expect(css).toContain('animation-iteration-count: infinite;');
    expect(css).toContain('animation-timing-function: linear;');
  });

  it("remains unobtrusive over finance data and honors reduced motion / off", () => {
    expect(css).toContain('contain: layout paint;');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('.finance-shell .finance-season-motion--page');
    expect(css).toContain('width: 68px;');
    expect(css).toContain('.finance-season-motion-particle:nth-child(n+4) { display: none; }');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.finance-shell .finance-season-motion { display: none !important; }');
    expect(css).not.toMatch(/background-attachment:\s*fixed/);
    expect(motion).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|window\.|document\./);
  });
});
