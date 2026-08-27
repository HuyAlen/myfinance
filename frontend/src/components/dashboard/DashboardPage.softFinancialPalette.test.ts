import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASH-MOBILE-POLISH-2.1 — True Soft Blue Palette", () => {
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

    expect(hero).toContain("text-[#4F6B85]");
    expect(hero).toContain("text-[#2F80ED]");
    expect(hero).toContain("text-[#879AAF]");
    expect(hero).toContain("text-[#4A6783]");
    expect(hero).not.toContain("text-[#274A6D]");
    expect(hero).not.toContain("text-[#334E68]");
    expect(hero).not.toContain("text-black");
    expect(hero).not.toContain("text-slate-950");
    expect(hero).not.toContain("text-slate-900");
    expect(hero).not.toContain("text-[#173A6A]");
  });

  it("demotes Reports and balances the mobile asset grid with a full-width debt row", () => {
    expect(dashboard).toContain("Báo cáo&nbsp;→");
    expect(dashboard).toContain("bg-[#F3F8FF]");
    expect(dashboard).toContain('className="col-span-2 sm:col-span-1"');
    expect(dashboard).toContain('label="Nợ phải trả"');
  });

  it("softens mobile Header and BottomNav chrome", () => {
    expect(header).toContain('text-[#526D87] sm:text-[22px]');
    expect(header).toContain('bg-[#FAFCFE] text-[#7D93A8]');
    expect(header).toContain('text-[#2F80ED]');
    expect(bottomNav).toContain('text-[#A0B1C2] active:bg-[#F8FBFF]');
    expect(bottomNav).toContain('? "font-bold text-[#2F80ED]"');
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

  it("uses the same soft financial blue across Net Worth and cash-flow chart chrome", () => {
    expect(netWorthChart).toContain('stopColor="#60A5FA"');
    expect(netWorthChart).toContain('stroke="#60A5FA"');
    expect(netWorthChart).toContain('tick={{ fill: "#8AA0B5" }}');
    expect(cashFlowChart).toContain('stroke="#60A5FA"');
    expect(cashFlowChart).toContain('fill="#6EDFB4"');
    expect(cashFlowChart).toContain('fill="#F8A1AE"');
    expect(cashFlowChart).toContain('tick={{ fill: "#8AA0B5" }}');
  });
});
