import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCashFlowMobileTickValue,
  formatCashFlowTickValue,
  getCashFlowMobileYAxisWidth,
  getCashFlowYAxisWidth,
  getCashFlowDomain,
  getCashFlowTicks,
  type CashFlowChartPoint,
} from "./CashFlowChart";

const source = readFileSync(
  path.resolve(__dirname, "CashFlowChart.tsx"),
  "utf8",
);
const ticks = [-20_000_000, 0, 20_000_000, 40_000_000, 60_000_000];

describe("MYFINANCE CASH FLOW IPHONE WIDE PLOT P4", () => {
  it("cuts mobile gutter width in half while retaining real scale and desktop full-VND ticks", () => {
    expect(getCashFlowYAxisWidth(ticks)).toBe(94);
    expect(getCashFlowMobileYAxisWidth(ticks)).toBe(42);
    expect(getCashFlowMobileYAxisWidth(ticks)).toBeLessThan(getCashFlowYAxisWidth(ticks) / 2);
    expect(formatCashFlowTickValue(-20_000_000)).toBe("-20.000.000 đ");
    expect(formatCashFlowTickValue(60_000_000)).toBe("60.000.000 đ");
  });

  it("uses readable abbreviated Vietnamese amounts on mobile including signed and fractional magnitudes", () => {
    expect(ticks.map(formatCashFlowMobileTickValue)).toEqual(["-20tr", "0", "20tr", "40tr", "60tr"]);
    expect(formatCashFlowMobileTickValue(2_500_000)).toBe("2,5tr");
    expect(formatCashFlowMobileTickValue(-250_000)).toBe("-250k");
    expect(formatCashFlowMobileTickValue(1_500_000_000)).toBe("1,5tỷ");
    expect(formatCashFlowMobileTickValue(850)).toBe("850đ");
    expect(formatCashFlowMobileTickValue(Number.NaN)).toBe("");
    expect(getCashFlowMobileYAxisWidth([-1_500_000_000, 0, 2_500_000_000])).toBeGreaterThanOrEqual(42);
  });

  it("keeps all tick values accurate and does not fabricate chart points to enlarge the plot", () => {
    const example: CashFlowChartPoint[] = [
      { label: "T7", cashIn: 24_000_000, cashOut: 42_000_000, netCashMovement: -18_000_000 },
      { label: "T8", cashIn: 28_000_000, cashOut: 29_000_000, netCashMovement: -1_000_000 },
      { label: "T9", cashIn: 44_000_000, cashOut: 36_000_000, netCashMovement: 8_000_000 },
    ];
    const axis = getCashFlowTicks(example);
    const domain = getCashFlowDomain(example);
    expect(axis.every((tick) => tick >= domain[0] && tick <= domain[1])).toBe(true);
    expect(source).toContain("data.map(normalizeCashFlowPointForChart)");
    expect(source).toContain('domain={cashFlowDomain}');
    expect(source).toContain('ticks={cashFlowTicks}');
  });

  it("switches responsively at 640px, not by changing the desktop axis or format", () => {
    expect(source).toContain('const COMPACT_CASH_FLOW_MEDIA = "(max-width: 639px)"');
    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain("getServerCompactCashFlowSnapshot");
    expect(source).toContain("getCashFlowMobileYAxisWidth(cashFlowTicks)");
    expect(source).toContain("getCashFlowYAxisWidth(cashFlowTicks)");
    expect(source).toContain("tick={<CashFlowMoneyTick compact={compactAxis} />}");
    expect(source).toContain("fontSize={compact ? 9 : 10}");
    expect(source).toContain("barCategoryGap={compactAxis ? 8 : 12}");
    expect(source).toContain("maxBarSize={compactAxis ? 30 : 24}");
  });

  it("exposes exact full-VND values for accessibility and tooltips despite compact mobile labels", () => {
    expect(source).toContain('<g role="img" aria-label={fullVND}>');
    expect(source).toContain("<title>{fullVND}</title>");
    expect(source).toContain("textAnchor=\"end\"");
    expect(source).toContain("tickFormatter={(value) => formatVND(Number(value))}");
    expect(source).toContain("formatVND(Number(value))");
    expect(source).toContain('dataKey="cashIn"');
    expect(source).toContain('dataKey="cashOut"');
    expect(source).toContain('dataKey="netCashMovement"');
    expect(source).toContain("getVisibleCashFlowPoints(");
  });
});
