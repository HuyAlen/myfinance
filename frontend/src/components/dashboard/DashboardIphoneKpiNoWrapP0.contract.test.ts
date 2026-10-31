import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
);
const start = dashboard.indexOf("function KpiCard({");
const end = dashboard.indexOf("\nfunction ComparisonMetricRow(", start);
const kpi = dashboard.slice(start, end);

describe("MYFINANCE IPHONE KPI NO WRAP P0", () => {
  it("keeps the original five KPI names and their source values, including full signed Forex profit", () => {
    expect(dashboard).toContain('title: "Dòng tiền ròng"');
    expect(dashboard).toContain('title: "Tiết kiệm & Đầu tư"');
    expect(dashboard).toContain('title: "Quỹ khẩn cấp"');
    expect(dashboard).toContain('title: "Ngoại hối"');
    expect(dashboard).toContain('title: "Mục tiêu"');
    expect(dashboard).toContain("formatVND(forexSnapshot.profitLoss)");
    expect(dashboard).toContain("periodOperatingCashFlow.net");
    expect(dashboard).toContain("savingsSnapshot.totalSavings");
    expect(dashboard).toContain('className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:grid-cols-5"');
    expect(dashboard).toContain("last:col-span-2 md:last:col-span-1");
  });

  it("gives the mobile currency value the full card width while retaining desktop icon-left layout", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(kpi).toContain('data-dashboard-kpi-layout="mobile-compact"');
    expect(kpi).toContain("grid-cols-[36px_minmax(0,1fr)]");
    expect(kpi).toContain("col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2");
    expect(kpi).toContain("sm:row-span-2");
    expect(kpi).toContain('data-dashboard-kpi-title="true"');
  });

  it("never wraps the dong sign onto a separate line, allowing inner scrolling for exceptional huge numbers", () => {
    expect(kpi).toContain('data-dashboard-kpi-value="full-vnd"');
    expect(kpi).toContain("whitespace-nowrap");
    expect(kpi).toContain("overflow-x-auto");
    expect(kpi).toContain("text-[clamp(12px,3.4vw,17px)]");
    expect(kpi).not.toContain("break-words text-[clamp(15px,4vw,20px)]");
    expect(kpi).toContain("title={value}");
  });

  it("shows complete mobile emergency and forex notes, never clipping to two lines on an iPhone", () => {
    expect(kpi).toContain('data-dashboard-kpi-note="true"');
    expect(kpi).toContain("break-words text-[10px]");
    expect(kpi).toContain("sm:line-clamp-2");
    expect(kpi).not.toContain("mt-1 line-clamp-2 text-[10px]");
  });

  it("preserves semantic clickable vs nonclickable KPI cards and loading affordances", () => {
    expect(kpi).toContain("if (onClick && !isLoading)");
    expect(kpi).toContain('aria-label={`Xem chi tiết: ${title}`}');
    expect(kpi).toContain('data-dashboard-depth-card="kpi"');
    expect(kpi).toContain("animate-pulse");
  });
});
