import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-HERO-POLISH-2
 *
 * Presentation-only contract for the Net Worth executive surface:
 * - richer HeroMini depth without changing compact density;
 * - clearer Net Worth history hierarchy;
 * - better sparse-history affordance;
 * - keep the full T1–T12 calendar context while preserving null months;
 * - expose values directly instead of making hover mandatory;
 * - more polished AreaChart chrome without changing data semantics.
 */
describe("DASH-HERO-POLISH-2 — Net Worth hero and chart polish", () => {
  const dashboard = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const chart = readFileSync(
    path.resolve(__dirname, "NetWorthTrendChart.tsx"),
    "utf8",
  );

  function heroMiniSource() {
    const start = dashboard.indexOf("function HeroMini({");
    const end = dashboard.indexOf("\nfunction KpiCard(", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    return dashboard.slice(start, end);
  }

  function historySource() {
    const start = dashboard.indexOf(
      'data-dashboard-surface="networth-history"',
    );
    const end = dashboard.indexOf("{/* Operating KPIs */}", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    return dashboard.slice(start, end);
  }

  it("adds subtle premium depth to compact HeroMini cards", () => {
    const source = heroMiniSource();

    expect(source).toContain("before:absolute");
    expect(source).toContain("before:via-[#8BC4F8]/70");
    expect(source).toContain(
      "shadow-[inset_0_0_0_1px_rgba(47,128,237,0.10)]",
    );

    // Existing density contract stays intact.
    expect(source).toContain("min-h-[78px]");
    expect(source).toContain(" p-3 ");
    expect(source).toContain("size-7 shrink-0");
  });

  it("gives Net Worth history an explicit accent, icon and delta surface", () => {
    const source = historySource();

    expect(source).toContain(
      'data-dashboard-surface="networth-history-accent"',
    );
    expect(source).toContain(
      'data-dashboard-surface="networth-history-icon"',
    );
    expect(source).toContain(
      'data-dashboard-surface="networth-history-delta"',
    );
  });

  it("keeps sparse-history guidance compact and below the chart", () => {
    const source = historySource();

    expect(source).toContain(
      "netWorthHistorySummary.snapshotCount < 3",
    );
    expect(source).toContain(
      'data-dashboard-ink="history-sparse-note"',
    );
    const chartIndex = source.indexOf(
      "<NetWorthTrendChart trend={netWorthTrend} />",
    );
    const noteIndex = source.indexOf(
      'data-dashboard-ink="history-sparse-note"',
    );

    expect(chartIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(chartIndex);
    expect(source).toContain('className="mt-2 flex items-start gap-1.5');
  });

  it("keeps the complete T1–T12 timeline instead of slicing to recorded months", () => {
    expect(chart).toContain("const trendWithDeltas");
    expect(chart).toContain("data={trendWithDeltas}");
    expect(chart).not.toContain("focusedTrend");
    expect(chart).not.toContain("slice(firstDataIndex, lastDataIndex + 1)");
    expect(chart).toContain('data-dashboard-chart="full-year-timeline"');
    expect(chart).toContain("{snapshotPoints.length}/12 tháng có snapshot");
    expect(chart).toContain("interval={0}");
  });

  it("uses a dynamic Y domain while preserving missing-month semantics", () => {
    expect(chart).toContain("const yDomain");
    expect(chart).toContain("domain={yDomain}");
    expect(chart).toContain('dataKey="value"');
    expect(chart).toContain("connectNulls={false}");
    expect(chart).toContain('className="mt-3 h-44"');
    expect(chart).toContain('height={148}');
  });

  it("makes recorded values visible without hover and emphasizes the latest point", () => {
    expect(chart).toContain("LabelList");
    expect(chart).toContain("ReferenceDot");
    expect(chart).toContain('data-dashboard-chart="latest-value"');
    expect(chart).toContain("formatCompactVND");
  });

  it("uses a richer but still restrained blue area treatment", () => {
    expect(chart).toContain("stopOpacity={0.3}");
    expect(chart).toContain('stop offset="55%"');
    expect(chart).toContain('strokeLinecap="round"');
    expect(chart).toContain('strokeLinejoin="round"');
    expect(chart).toContain("activeDot={{");
  });

  it("shows month, full value and snapshot delta in the tooltip", () => {
    expect(chart).toContain("cursor={{");
    expect(chart).toContain('strokeDasharray: "4 4"');
    expect(chart).toContain("function NetWorthTrendTooltip");
    expect(chart).toContain("formatVND(point.value)");
    expect(chart).toContain("deltaFromPrevious");
  });
});