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
  const fab = readFileSync(
    path.resolve(__dirname, "../layout/QuickActionFab.tsx"),
    "utf8",
  );
  const netWorthChart = readFileSync(
    path.resolve(__dirname, "NetWorthTrendChart.tsx"),
    "utf8",
  );
  const cashFlowChart = readFileSync(
    path.resolve(__dirname, "CashFlowChart.tsx"),
    "utf8",
  );

  it("uses visibly lighter true-blue/slate Hero typography instead of navy-heavy tokens", () => {
    const start = dashboard.indexOf("DASH-MOBILE-POLISH-2.1");
    const end = dashboard.indexOf("{/* Operating KPIs */}", start);
    const hero = dashboard.slice(start, end);

    expect(hero).toContain("text-[#294A66]");
    expect(hero).toContain("text-[#2F80ED]");
    expect(hero).toContain("text-[#5C7388]");
    expect(hero).toContain("text-[#3F5F79]");
    expect(hero).not.toContain("text-[#274A6D]");
    expect(hero).not.toContain("text-[#334E68]");
    expect(hero).not.toContain("text-black");
    expect(hero).not.toContain("text-slate-950");
    expect(hero).not.toContain("text-slate-900");
    expect(hero).not.toContain("text-[#173A6A]");
  });

  it("demotes Reports and balances the mobile asset grid with a full-width debt row", () => {
    expect(dashboard).toContain("Báo cáo&nbsp;→");
    expect(dashboard).toContain("border border-[#C4D9EA] bg-white");
    expect(dashboard).toContain('className="col-span-2 sm:col-span-1"');
    expect(dashboard).toContain('label="Nợ phải trả"');
  });

  it("softens mobile Header and BottomNav chrome", () => {
    expect(header).toContain('text-[#36536B] sm:text-[22px]');
    expect(header).toContain('bg-white text-[#61788F]');
    expect(header).toContain('text-[#2F80ED]');
    expect(bottomNav).toContain('font-semibold text-[var(--finance-muted)] active:bg-[#F3F7FB]');
    expect(bottomNav).toContain('? "font-bold text-[var(--finance-primary-text)]"');
    expect(bottomNav).not.toContain("rgba(15,23,42,0.08)");
  });

  it("reduces Quick Action prominence without changing its drag/panel architecture", () => {
    expect(fab).toContain("const FAB_SIZE = 48;");
    expect(fab).toContain("flex size-12 touch-none");
    expect(fab).toContain("shadow-[0_6px_18px_rgba(47,128,237,0.20)]");
    expect(fab).toContain("bg-[#2F80ED]");
    expect(fab).toContain("bg-[#6F8AA3]");
    expect(fab).not.toContain("bg-slate-700");
    expect(fab).toContain("computeQuickActionPanelPosition(");
    expect(fab).toContain("clampFabPosition(");
  });

  it("keeps Net Worth soft while Cash Flow uses stronger semantic series colors", () => {
    expect(netWorthChart).toContain('stopColor="#60A5FA"');
    expect(netWorthChart).toContain('stroke="#60A5FA"');
    expect(netWorthChart).toContain('tick={{ fill: "#8AA0B5" }}');
    expect(cashFlowChart).toContain('stroke="#3B82F6"');
    expect(cashFlowChart).toContain('fill="#34D399"');
    expect(cashFlowChart).toContain('fill="#FB7185"');
    expect(cashFlowChart).toContain('tick={{ fill: "#8AA0B5" }}');
  });
});
