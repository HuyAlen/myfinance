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
    expect(dashboard).toContain("border-[#C6D8E6]");
    expect(dashboard).toContain("from-white via-[#F9FCFF] to-[#F1F6FB]");
    expect(hero).toContain("text-[#294A66]");
    expect(hero).toContain("text-[#5C7388]");
    expect(hero).toContain("text-[#2F80ED]");
    expect(hero).not.toContain("text-black");
    expect(hero).not.toContain("text-slate-950");
    expect(hero).not.toContain("text-slate-900");
  });

  it("makes supporting asset cards easier to scan", () => {
    const start = dashboard.indexOf("function HeroMini({");
    const end = dashboard.indexOf("\nfunction KpiCard(", start);
    const heroMini = dashboard.slice(start, end);

    expect(heroMini).toContain("border-[#CADAE7]");
    expect(heroMini).toContain("bg-[#FCFEFF]");
    expect(heroMini).toContain("text-[#506A82]");
    expect(dashboard).toContain('valueClass="text-[#3F5F79]"');
    expect(dashboard).toContain(
      'iconClass="bg-[#EAF3FC] text-[#2F80ED]"',
    );
  });

  it("adds depth to the Net Worth history surface", () => {
    expect(dashboard).toContain(
      "border border-[#CADAE7] bg-[#FCFEFF] p-3.5 shadow-[0_8px_20px_rgba(45,76,102,0.10)]",
    );
    expect(dashboard).toContain(
      'className="text-sm font-extrabold text-[#294A66]"',
    );
    expect(dashboard).toContain(
      'className="mt-1 text-[11px] font-medium leading-4 text-[#5C7388] sm:text-xs"',
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
    expect(bottomNav).toContain('? "font-bold text-[var(--finance-primary-text)]"');
    expect(bottomNav).toContain(
      ': "font-semibold text-[var(--finance-muted)] active:bg-[#F3F7FB]"',
    );
    expect(bottomNav).toContain('? "bg-[#EAF3FC]"');
  });

  it("keeps secondary action and readiness semantics intact", () => {
    expect(dashboard).toContain('data-dashboard-action="reports"');
    expect(dashboard).toContain("{isDashboardReady ? (");
    expect(dashboard).toContain("{cashFlowReady ? (");
  });
});
