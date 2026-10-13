import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const css = read("app/seasonal-page-atmosphere.css");
const layout = read("app/layout.tsx");
const originalTheme = read("app/seasonal-workspace.css");
const appShell = read("src/components/layout/AppShell.tsx");
const dashboard = read("src/components/dashboard/DashboardPage.tsx");
const transactions = read("src/components/transactions/TransactionsPage.tsx");
const wallets = read("src/components/wallets/WalletsPage.tsx");
const reports = read("src/components/reports/ReportsPage.tsx");
const seasons = ["spring", "summer", "autumn", "halloween", "birthday", "christmas", "newyear", "tet"] as const;

describe("MYFINANCE-SEASONAL-PAGE-ATMOSPHERE-1", () => {
  it("imports the new layer after workspace chrome and retains the existing resolver", () => {
    expect(layout).toContain('import "./seasonal-workspace.css";');
    expect(layout).toContain('import "./seasonal-page-atmosphere.css";');
    expect(layout.indexOf('import "./seasonal-page-atmosphere.css";'))
      .toBeGreaterThan(layout.indexOf('import "./seasonal-workspace.css";'));
    expect(layout).toContain("<SeasonalWorkspaceThemeController />");
    expect(originalTheme).toContain("data-finance-workspace-season");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "off")).toBe("off");
  });

  it("styles the real scroll owner and four opt-in page heroes rather than all cards", () => {
    expect(appShell).toContain('className="finance-main');
    expect(appShell).toContain("overflow-y-auto");
    expect(dashboard).toContain('data-dashboard-surface="hero-gradient"');
    expect(transactions).toContain('data-seasonal-page-surface="primary"');
    expect(wallets).toContain('data-wallets-section="overview"');
    expect(reports).toContain('data-seasonal-page-surface="primary"');
    for (const target of [
      ".finance-shell .finance-main",
      '[data-dashboard-surface="hero-gradient"]',
      '[data-seasonal-page-surface="primary"]',
      '[data-wallets-section="overview"]',
    ]) expect(css).toContain(target);
  });

  it("has eight small local transparent hero illustrations with distinct visuals", () => {
    for (const season of seasons) {
      const name = `public/seasonal-workspace/page-atmosphere/${season}-hero.svg`;
      const asset = read(name);
      expect(asset.startsWith("<svg"), name).toBe(true);
      expect(asset).toContain("</svg>");
      expect(asset).toContain(`data-season-scene="${season}"`);
      expect(asset).toContain('data-motif="');
      expect(statSync(resolve(process.cwd(), name)).size, name).toBeLessThan(15000);
      expect(asset).not.toMatch(/<script|<image|<foreignObject|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
      expect(css).toContain(`url("/seasonal-workspace/page-atmosphere/${season}-hero.svg")`);
      expect(css).toContain(`data-finance-workspace-season="${season}"`);
    }
  });

  it("keeps seasonal art as backgrounds only and never recolors financial semantics", () => {
    expect(css).toContain("background-image:");
    expect(css).toContain("var(--finance-atmo-art)");
    expect(css).not.toMatch(/-cinematic\.webp|-pastel\.webp|background-attachment:\s*fixed/i);
    expect(css).not.toMatch(/\.finance-main::(?:before|after)/);
    expect(css).not.toMatch(/\.finance-main\s+(?:button|input|select|canvas|svg)/);
    expect(css).not.toMatch(/\.text-(?:rose|emerald)|\.bg-(?:rose|emerald)|--finance-primary\s*:/);
    expect(css).not.toContain("pointer-events:");
  });

  it("scopes every visual selector under active season and keeps off pristine", () => {
    expect(css).not.toContain('data-finance-workspace-season="off"');
    expect(css).not.toMatch(/(^|\})\s*\.finance-main\s*\{/m);
    expect(css).toContain(":root[data-finance-workspace-season]");
    expect(css).toContain('data-theme="dark"][data-finance-workspace-season]');
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media print");
    expect(css).toContain("background-attachment: scroll;");
  });


  it("keeps the canvas seasonal and continuous in every gutter between cards", () => {
    // Before this fix, the 2.5rem/2rem header gutter and content after 60rem
    // fell back to original blue-gray --finance-page, creating the visible seam.
    expect(css).toContain("background-color: var(--finance-atmo-canvas-mid);");
    expect(css).not.toContain("var(--finance-page)");
    expect(css.match(/linear-gradient\(180deg, var\(--finance-atmo-canvas-top\) 0%, var\(--finance-atmo-canvas-mid\) 22rem\)/g)?.length).toBe(2);
    expect(css.match(/linear-gradient\(180deg, var\(--finance-atmo-canvas-top\) 0%, var\(--finance-atmo-canvas-mid\) 18rem\)/g)?.length).toBe(2);
    expect(css).toContain("border-top-color: var(--finance-border)");
    expect(css).not.toContain("0 3px 0 -1px");
    expect(css).not.toMatch(/border-top-color:\s*rgb\(var\(--finance-season-primary\)/);
    expect(css).toContain("var(--finance-atmo-art)");
    expect(css).toContain("var(--finance-season-page-art)");
  });

  it("preserves all six gentle seasonal canvas colors without turning KPI cards seasonal", () => {
    for (const color of ["#fcf5f8", "#f3fbfc", "#fbf5ee", "#f3faf9", "#f8f5fc", "#fff6f4"]) {
      expect(css).toContain(`--finance-atmo-canvas-top: ${color}`);
    }
    expect(css).toContain('data-theme="dark"][data-finance-workspace-season]');
    expect(css).toContain("background-color: transparent !important;"); // print only
    expect(css).not.toMatch(/\.finance-main\s+(?:button|input|select|canvas|svg)/);
  });


  it("removes cast shadows that create blue-gray seams beneath the topbar and cards", () => {
    const globals = read("app/globals.css");
    expect(globals).toContain("--finance-shadow-soft:");
    expect(globals).toContain("--finance-shadow-card:");
    expect(originalTheme).toContain(".finance-shell .finance-header");
    expect(css).toContain("--finance-shadow-soft: none;");
    expect(css).toContain("--finance-shadow-card: none;");
    expect(css).toContain(':root[data-finance-workspace-season] .finance-shell .finance-header,');
    expect(css).toContain(':root[data-theme="dark"][data-finance-workspace-season] .finance-shell .finance-header {');
    expect(css).toMatch(/\.finance-header\s*\{\s*box-shadow:\s*none;/);
    for (const marker of [
      '[data-dashboard-surface="hero-shell"]',
      '[data-dashboard-surface="hero-mini"]',
      '[data-dashboard-surface="networth-history"]',
      '[data-dashboard-depth-card="kpi"]',
      '[data-dashboard-depth-card="panel"]',
      '[data-seasonal-page-surface="primary"]',
      '[data-wallets-section="overview"]',
    ]) expect(css).toContain(marker);
    expect(css).not.toMatch(/0 15px 34px rgb\(45 76 102/);
    expect(css).not.toMatch(/0 14px 32px rgb\(0 0 0/);
    expect(css).toContain('[data-dashboard-depth-card="kpi"]:focus-visible');
    expect(css).toContain('outline: 2px solid #2f80ed;');
    expect(css).toContain('border-top-color: var(--finance-border);');
  });

  it("limits seam suppression to active seasons without overlays or input changes", () => {
    expect(css).not.toContain('data-finance-workspace-season="off"');
    expect(css).not.toMatch(/(^|\})\s*\.finance-header\s*\{\s*box-shadow:\s*none;/m);
    expect(css).not.toMatch(/\.finance-main::(before|after)/);
    expect(css).toContain('var(--finance-atmo-art)');
    expect(css).toContain('var(--finance-season-page-art)');
    expect(css).not.toMatch(/\.finance-main\s+(?:button|input|select|canvas|svg)/);
    expect(css).toContain('--finance-atmo-canvas-top: #fbf5ee;');
    expect(css).toContain('background-attachment: scroll;');
  });

  it("preserves the existing dashboard data and render logic via markers", () => {
    expect(dashboard).toContain('data-dashboard-number="hero-net-worth"');
    expect(dashboard).toContain('data-dashboard-surface="hero-shell"');
    expect(transactions).toContain('data-transaction-income-expense-scope="true"');
    expect(wallets).toContain('data-wallets-section="reconciliation"');
    expect(reports).toContain("exportCSV()");
  });
});
