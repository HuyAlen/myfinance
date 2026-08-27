import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASH-MOBILE-POLISH-3 — Stronger Financial Contrast & Surface Depth", () => {
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

  it("separates the Net Worth surface without returning to near-black UI", () => {
    const start = dashboard.indexOf(
      "DASH-MOBILE-POLISH-2.1: True Soft Blue hierarchy.",
    );
    const end = dashboard.indexOf("{/* Operating KPIs */}", start);
    const hero = dashboard.slice(start, end);

    expect(hero).toContain("DASH-MOBILE-POLISH-3");
    expect(dashboard).toContain("border-[#D7E3EE]");
    expect(dashboard).toContain("from-white via-[#F9FCFF] to-[#F1F6FB]");
    expect(hero).toContain("text-[#36536B]");
    expect(hero).toContain("text-[#687E93]");
    expect(hero).toContain("text-[#2F80ED]");
    expect(hero).not.toContain("text-black");
    expect(hero).not.toContain("text-slate-950");
    expect(hero).not.toContain("text-slate-900");
  });

  it("makes supporting asset cards easier to scan", () => {
    const start = dashboard.indexOf("function HeroMini({");
    const end = dashboard.indexOf("\nfunction KpiCard(", start);
    const heroMini = dashboard.slice(start, end);

    expect(heroMini).toContain("border-[#DCE6EF]");
    expect(heroMini).toContain("bg-white");
    expect(heroMini).toContain("text-[#61788F]");
    expect(dashboard).toContain('valueClass="text-[#3F5F79]"');
    expect(dashboard).toContain(
      'iconClass="bg-[#EAF3FC] text-[#2F80ED]"',
    );
  });

  it("adds depth to the Net Worth history surface", () => {
    expect(dashboard).toContain(
      "border border-[#DCE6EF] bg-white p-3.5 shadow-[0_5px_14px_rgba(54,83,107,0.07)]",
    );
    expect(dashboard).toContain(
      '<p className="text-sm font-bold text-[#36536B]">',
    );
    expect(dashboard).toContain(
      'className="mt-1 text-[11px] leading-4 text-[#687E93] sm:text-xs"',
    );
  });

  it("strengthens the mobile header and period controls", () => {
    expect(header).toContain("border-b border-[#DDE7F0]");
    expect(header).toContain(
      "text-[15px] font-bold tracking-tight text-[#36536B]",
    );
    expect(header).toContain(
      "border border-[#DCE6EF] bg-white text-[#61788F]",
    );
    expect(header).toContain("text-[16px] font-bold text-[#3F5F79]");
    expect(header).toContain("shiftMonth(-1)");
    expect(header).toContain("shiftMonth(1)");
  });

  it("raises inactive bottom-nav contrast while preserving the active state", () => {
    expect(bottomNav).toContain("border-t border-[#DDE7F0]");
    expect(bottomNav).toContain('? "font-bold text-[#2F80ED]"');
    expect(bottomNav).toContain(
      ': "font-medium text-[#7C91A5] active:bg-[#F3F7FB]"',
    );
    expect(bottomNav).toContain('? "bg-[#EAF3FC]"');
  });

  it("keeps secondary action and readiness semantics intact", () => {
    expect(dashboard).toContain("font-semibold text-[#2F80ED]");
    expect(dashboard).toContain("{isDashboardReady ? (");
    expect(dashboard).toContain("{cashFlowReady ? (");
  });
});
