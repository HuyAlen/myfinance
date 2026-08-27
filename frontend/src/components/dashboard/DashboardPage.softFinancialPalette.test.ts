import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASH-MOBILE-POLISH-2 — Soft Financial Palette & Visual Hierarchy", () => {
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

  it("uses soft blue/slate Hero typography instead of near-black/navy-heavy tokens", () => {
    const start = dashboard.indexOf("DASH-MOBILE-POLISH-2");
    const end = dashboard.indexOf("{/* Operating KPIs */}", start);
    const hero = dashboard.slice(start, end);

    expect(hero).toContain("text-[#334E68]");
    expect(hero).toContain("text-[#274A6D]");
    expect(hero).toContain("text-[#64748B]");
    expect(hero).not.toContain("text-black");
    expect(hero).not.toContain("text-slate-950");
    expect(hero).not.toContain("text-slate-900");
    expect(hero).not.toContain("text-[#173A6A]");
  });

  it("demotes Reports and balances the mobile asset grid with a full-width debt row", () => {
    expect(dashboard).toContain("Báo cáo&nbsp;→");
    expect(dashboard).toContain("bg-blue-50/70");
    expect(dashboard).toContain('className="col-span-2 sm:col-span-1"');
    expect(dashboard).toContain('label="Nợ phải trả"');
  });

  it("softens mobile Header and BottomNav chrome", () => {
    expect(header).toContain('text-[#334E68] sm:text-[22px]');
    expect(header).toContain('bg-[#F8FAFC] text-[#64748B]');
    expect(header).toContain('text-[#1677FF]');
    expect(bottomNav).toContain('text-[#94A3B8] active:bg-[#F8FAFC]');
    expect(bottomNav).toContain('? "text-[#1677FF]"');
    expect(bottomNav).not.toContain("rgba(15,23,42,0.08)");
  });

  it("reduces Quick Action prominence without changing its drag/panel architecture", () => {
    expect(fab).toContain("const FAB_SIZE = 48;");
    expect(fab).toContain("flex size-12 touch-none");
    expect(fab).toContain("shadow-[0_6px_18px_rgba(37,99,235,0.22)]");
    expect(fab).not.toContain("bg-slate-700");
    expect(fab).toContain("computeQuickActionPanelPosition(");
    expect(fab).toContain("clampFabPosition(");
  });

  it("uses the same soft financial blue across Net Worth and cash-flow chart chrome", () => {
    expect(netWorthChart).toContain('stopColor="#1677FF"');
    expect(netWorthChart).toContain('stroke="#1677FF"');
    expect(netWorthChart).toContain('tick={{ fill: "#64748B" }}');
    expect(cashFlowChart).toContain('stroke="#1677FF"');
    expect(cashFlowChart).toContain('fill="#34D399"');
    expect(cashFlowChart).toContain('fill="#FB7185"');
    expect(cashFlowChart).toContain('tick={{ fill: "#64748B" }}');
  });
});
