import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASHBOARD-VISUAL-CONTRAST-1
 * Source-inspection contract for stronger soft-blue financial hierarchy.
 * This deliberately avoids business/data assertions; existing Dashboard
 * correctness/readiness tests remain the source of truth for those flows.
 */
describe("Dashboard visual contrast hierarchy", () => {
  const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

  function extractHeroMiniSource() {
    const start = source.indexOf("function HeroMini({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\nfunction KpiCard(", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("marks the contrast polish without changing the Net Worth value palette", () => {
    expect(source).toContain("DASHBOARD-VISUAL-CONTRAST-1: stronger soft-blue surface depth");
    expect(source).toContain("tabular-nums text-[#2F80ED] sm:text-5xl");
  });

  it("gives the executive hero a clearer border and stronger soft shadow", () => {
    expect(source).toContain("border-[#C6D8E6]");
    expect(source).toContain("shadow-[0_16px_38px_rgba(45,76,102,0.14)]");
  });

  it("keeps HeroMini density while strengthening card separation and label ink", () => {
    const heroMini = extractHeroMiniSource();
    expect(heroMini).toContain("min-h-[78px]");
    expect(heroMini).toContain("border-[#CADAE7]");
    expect(heroMini).toContain("bg-[#FCFEFF]");
    expect(heroMini).toContain("text-[#506A82]");
  });

  it("strengthens the Net Worth history shell and sparse snapshot panel", () => {
    expect(source).toContain("border-[#CADAE7] bg-[#FCFEFF]");
    expect(source).toContain("border-[#BFD6EC] bg-[#F1F7FD]");
    expect(source).toContain("Biến động tài sản ròng");
  });

  it("keeps Hero status tied to canonical Net Worth history instead of period cash-flow chips", () => {
    const heroStart = source.indexOf("DASH-MOBILE-POLISH-2.1: True Soft Blue hierarchy.");
    expect(heroStart).toBeGreaterThan(-1);
    const heroEnd = source.indexOf("Mobile uses a flatter financial breakdown", heroStart);
    expect(heroEnd).toBeGreaterThan(heroStart);
    const hero = source.slice(heroStart, heroEnd);

    expect(source).toContain("So với snapshot trước");
    expect(source).toContain("netWorthHistorySummary.changeFromPrevious");
    expect(hero).not.toContain("Dòng tiền dương");
    expect(hero).not.toContain("Dòng tiền âm");
    expect(hero).not.toContain("cashMovementReady ? (");
  });

  it("exposes semantic Dashboard hooks so Dark mode never depends on generic white-card translation", () => {
    expect(source).toContain('data-dashboard-surface="hero-shell"');
    expect(source).toContain('data-dashboard-surface="hero-gradient"');
    expect(source).toContain('data-dashboard-surface="hero-mini"');
    expect(source).toContain('data-dashboard-surface="networth-history"');
    expect(source).toContain('data-dashboard-surface="networth-snapshot"');
    expect(source).toContain('data-dashboard-ink="hero-title"');
    expect(source).toContain('data-dashboard-ink="hero-mini-label"');
    expect(source).toContain('data-dashboard-action="reports"');
  });
});
