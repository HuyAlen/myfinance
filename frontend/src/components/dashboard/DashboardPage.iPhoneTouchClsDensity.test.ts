import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-MOBILE-POLISH-4 — iPhone Touch, CLS & Compact Section Density.
 *
 * Source-inspection only, matching the Dashboard regression style already
 * used in this repo. This ticket is intentionally presentation-only:
 * - reserve the final chart heights before data/chunks are ready,
 * - keep the secondary Reports action at a 44px mobile touch target,
 * - avoid squeezing three full VND values into one 375-430px row,
 * - remove desktop-only subtitle height reservation from stacked mobile panels,
 * - make the horizontal KPI rail settle naturally after a finger swipe,
 * - clean up two month-context labels without touching calculation semantics.
 */
describe("DASH-MOBILE-POLISH-4 — iPhone ergonomics and layout stability", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("keeps the compact Reports action secondary but gives it a 44px mobile touch target", () => {
    const labelIndex = source.indexOf("Báo cáo&nbsp;→");
    expect(labelIndex).toBeGreaterThan(-1);
    const buttonStart = source.lastIndexOf("<button", labelIndex);
    const buttonSource = source.slice(buttonStart, labelIndex);

    expect(buttonSource).toContain("min-h-11");
    expect(buttonSource).toContain("font-semibold");
    expect(buttonSource).not.toContain(" h-9 ");
  });

  it("reserves the final Net Worth chart height before history readiness resolves, preventing the 96/128px -> 176px jump", () => {
    const historyStart = source.indexOf("Biến động tài sản ròng");
    const historyEnd = source.indexOf("{/* Operating KPIs */}", historyStart);
    expect(historyStart).toBeGreaterThan(-1);
    expect(historyEnd).toBeGreaterThan(historyStart);
    const historySource = source.slice(historyStart, historyEnd);

    expect(historySource).toContain(
      'className="mt-3 h-44 animate-pulse rounded-xl bg-slate-100 sm:rounded-2xl"',
    );
    expect(historySource).toContain("<NetWorthTrendChart trend={netWorthTrend} />");
    expect(historySource).not.toContain("mt-3 h-24 animate-pulse");
    expect(historySource).not.toContain("sm:h-32");
  });

  it("uses a 2 + 1 mobile cash-flow stat hierarchy and restores the 3-column layout at sm", () => {
    const cashFlowStart = source.indexOf('title="Dòng tiền trong kỳ"');
    const cashFlowEnd = source.indexOf('title="Cấu trúc tài chính"', cashFlowStart);
    expect(cashFlowStart).toBeGreaterThan(-1);
    expect(cashFlowEnd).toBeGreaterThan(cashFlowStart);
    const cashFlowSource = source.slice(cashFlowStart, cashFlowEnd);

    expect(cashFlowSource).toContain(
      'className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3"',
    );
    expect(cashFlowSource).toContain(
      'className="col-span-2 sm:col-span-1"',
    );
    expect(cashFlowSource).not.toContain(
      'className="mt-4 grid grid-cols-3 gap-3"',
    );
  });

  it("mirrors the 2 + 1 cash-flow hierarchy in loading state and reserves the chart's final 208px height", () => {
    const cashFlowStart = source.indexOf('title="Dòng tiền trong kỳ"');
    const cashFlowEnd = source.indexOf('title="Cấu trúc tài chính"', cashFlowStart);
    const cashFlowSource = source.slice(cashFlowStart, cashFlowEnd);

    expect(cashFlowSource).toContain(
      'className="col-span-2 h-16 animate-pulse rounded-2xl bg-slate-100 sm:col-span-1"',
    );
    expect(cashFlowSource).toContain(
      'className="mt-5 h-52 animate-pulse rounded-2xl bg-slate-100"',
    );
    expect(cashFlowSource).not.toContain(
      'className="mt-3 h-44 animate-pulse rounded-2xl bg-slate-100"',
    );
  });

  it("adds proximity snap behavior to the mobile KPI rail without replacing its desktop grid", () => {
    const kpiStart = source.indexOf("{/* Operating KPIs */}");
    const kpiEnd = source.indexOf("{/* Budget attention */}", kpiStart);
    expect(kpiStart).toBeGreaterThan(-1);
    expect(kpiEnd).toBeGreaterThan(kpiStart);
    const kpiSource = source.slice(kpiStart, kpiEnd);

    expect(kpiSource).toContain("snap-x snap-proximity");
    expect(kpiSource).toContain("overflow-x-auto");
    expect(kpiSource).toContain("overscroll-x-contain");
    expect(kpiSource).toContain("scroll-px-4");
    expect(kpiSource).toContain("scrollbar-none");
    expect(kpiSource).toContain("md:grid md:grid-cols-3");
    expect(kpiSource).toContain("xl:grid-cols-5");
  });

  it("makes both interactive and non-interactive KPI cards snap to the start of the mobile rail", () => {
    const start = source.indexOf("function KpiCard({");
    const end = source.indexOf("\nfunction Panel({", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const kpiCardSource = source.slice(start, end);

    expect(kpiCardSource.split("snap-start").length - 1).toBe(2);
    expect(kpiCardSource.split("min-w-52").length - 1).toBe(2);
    expect(kpiCardSource.split("md:min-w-0").length - 1).toBe(2);
  });

  it("uses the compact 16px mobile gap between stacked cash-flow/structure panels while restoring 20px from sm", () => {
    expect(source).toContain(
      '<section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.2fr_0.8fr]">',
    );
  });

  it("removes the repeated 40px subtitle reservation from stacked mobile Panels and keeps it only for xl side-by-side alignment", () => {
    const start = source.indexOf("function Panel({");
    const end = source.indexOf("\nfunction MiniStat({", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("xl:min-h-10");
    expect(panelSource).not.toContain("mt-1 min-h-10");
  });

  it("keeps MiniStat presentation reusable for the full-width mobile 'Còn lại' row", () => {
    const start = source.indexOf("function MiniStat({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("type AllocationKind", start);
    expect(end).toBeGreaterThan(start);
    const miniStatSource = source.slice(start, end);

    expect(miniStatSource).toContain('className = ""');
    expect(miniStatSource).toContain("className?: string;");
    expect(miniStatSource).toContain("${className}");
  });

  it("cleans up month-context copy without changing the underlying monthlyPulse or selected-period semantics", () => {
    expect(source).toContain("Theo thời gian");
    expect(source).toContain("Tiến độ tháng {monthlyPulse.month}");
    expect(source).toContain(
      'subtitle="Top danh mục trong tháng đang xem để nhận diện nơi cần tối ưu"',
    );
    expect(source).toContain("Chưa có chi tiêu trong tháng đang xem.");
    expect(source).not.toContain("Top danh mục trong tháng hiện tại");
  });

  it("does not alter the Dashboard readiness gates or chart data bindings", () => {
    expect(source).toContain("{isDashboardReady ? (");
    expect(source).toContain("{cashFlowReady ? (");
    expect(source).toContain("<NetWorthTrendChart trend={netWorthTrend} />");
    expect(source).toContain("<CashFlowChart data={cashFlowData} />");
  });
});
