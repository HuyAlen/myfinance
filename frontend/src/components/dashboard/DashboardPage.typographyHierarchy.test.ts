import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASH-MOBILE-POLISH-2.2 — Typography Hierarchy Reinforcement", () => {
  const dashboard = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );
  const header = readFileSync(
    path.resolve(__dirname, "../layout/Header.tsx"),
    "utf8",
  );
  const bottomNav = readFileSync(
    path.resolve(__dirname, "../layout/BottomNav.tsx"),
    "utf8",
  );

  function extractHeroMiniSource() {
    const start = dashboard.indexOf("function HeroMini({");
    expect(start).toBeGreaterThan(-1);
    const end = dashboard.indexOf("\nfunction KpiCard(", start);
    expect(end).toBeGreaterThan(start);
    return dashboard.slice(start, end);
  }

  it("strengthens the main Net Worth title and value without darkening the soft-blue palette", () => {
    expect(dashboard).toContain(
      'text-[22px] font-bold tracking-tight text-[#36536B]',
    );
    expect(dashboard).toContain(
      'text-[clamp(1.85rem,8.8vw,2.35rem)] font-extrabold leading-none tracking-[-0.045em] tabular-nums text-[#2F80ED]',
    );
    expect(dashboard).toContain(
      'text-[13px] leading-5 text-[#687E93]',
    );
  });

  it("makes HeroMini labels and values easier to scan on mobile while preserving lighter desktop density", () => {
    const heroMini = extractHeroMiniSource();
    expect(heroMini).toContain(
      'text-[11.5px] font-bold leading-tight tracking-[-0.01em] text-[#61788F] sm:font-semibold',
    );
    expect(heroMini).toContain(
      'text-[clamp(12px,3.3vw,15px)] font-extrabold leading-5 tracking-[-0.03em] tabular-nums sm:font-bold',
    );
  });

  it("promotes the Net Worth trend section title while keeping its explanatory copy secondary", () => {
    expect(dashboard).toContain(
      '<p className="text-sm font-bold text-[#36536B]">',
    );
    expect(dashboard).toContain(
      'className="mt-1 text-[11px] leading-4 text-[#687E93] sm:text-xs"',
    );
  });

  it("keeps the page title strong and makes the selected month visibly bold", () => {
    expect(header).toContain(
      'text-[15px] font-bold tracking-tight text-[#36536B]',
    );
    expect(header).toContain(
      'text-[16px] font-bold text-[#3F5F79]',
    );
  });

  it("uses bold only for the active bottom-nav destination and keeps inactive labels medium", () => {
    expect(bottomNav).toContain('? "font-bold text-[#2F80ED]"');
    expect(bottomNav).toContain(
      ': "font-medium text-[#7C91A5] active:bg-[#F3F7FB]"',
    );
    expect(bottomNav).not.toContain(
      'text-[10px] font-bold transition-all duration-200',
    );
  });

  it("keeps the Reports action secondary instead of competing with the emphasized financial data", () => {
    const reportLabel = dashboard.indexOf("Báo cáo&nbsp;→");
    expect(reportLabel).toBeGreaterThan(-1);
    const buttonStart = dashboard.lastIndexOf("<button", reportLabel);
    const buttonRegion = dashboard.slice(buttonStart, reportLabel);
    expect(buttonRegion).toContain("font-semibold");
    expect(buttonRegion).not.toContain("font-bold");
    expect(buttonRegion).not.toContain("font-extrabold");
  });
});
