import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCashFlowTickValue,
  getCashFlowYAxisWidth,
} from "./CashFlowChart";

const source = readFileSync(
  path.resolve(__dirname, "CashFlowChart.tsx"),
  "utf8",
);

describe("MYFINANCE DASHBOARD CASH-FLOW COMPACT AXIS P3", () => {
  it("reclaims horizontal room at the October 2026 cash-flow scale without shortening VND labels", () => {
    const ticks = [-20_000_000, 0, 20_000_000, 40_000_000, 60_000_000];
    expect(getCashFlowYAxisWidth(ticks)).toBe(94);
    expect(getCashFlowYAxisWidth(ticks)).toBeLessThan(127);
    expect(formatCashFlowTickValue(60_000_000)).toBe("60.000.000 đ");
    expect(formatCashFlowTickValue(-20_000_000)).toBe("-20.000.000 đ");
  });

  it("grows the gutter only when real values need longer labels", () => {
    const ordinary = getCashFlowYAxisWidth([60_000_000, -20_000_000]);
    const large = getCashFlowYAxisWidth([1_000_000_000, -1_000_000_000]);
    expect(large).toBeGreaterThan(ordinary);
    expect(getCashFlowYAxisWidth([])).toBe(88);
  });

  it("keeps one readable full-VND SVG tick instead of using clipped or abbreviated axis labels", () => {
    expect(source).toContain('tick={<CashFlowMoneyTick compact={compactAxis} />}');
    expect(source).toContain('width={cashFlowAxisWidth}');
    expect(source).toContain('tickFormatter={(value) => formatVND(Number(value))}');
    expect(source).toContain('textAnchor="end"');
    expect(source).toContain('fontSize={compact ? 9 : 10}');
    expect(source).not.toContain('width={127}');
    expect(source).not.toContain("truncate");
    expect(source).not.toContain("formatCompactVND");
  });

  it("keeps the month count accessible while shortening its visible headline", () => {
    expect(source).toContain('data-dashboard-cash-flow-months="compact"');
    expect(source).toContain('aria-label={`${activeMonthCount}/12 tháng có dòng tiền`}');
    expect(source).toContain('{activeMonthCount}/12 tháng');
    expect(source).toContain('aria-label="Chú thích biểu đồ dòng tiền"');
  });

  it("preserves the same honest cash-flow scale and all three series", () => {
    expect(source).toContain('domain={cashFlowDomain}');
    expect(source).toContain('ticks={cashFlowTicks}');
    expect(source).toContain('getVisibleCashFlowPoints');
    expect(source).toContain('<ReferenceLine y={0}');
    expect(source).toContain('dataKey="cashIn"');
    expect(source).toContain('dataKey="cashOut"');
    expect(source).toContain('dataKey="netCashMovement"');
    expect(source).toContain('margin={{ top: 12, right: 4, bottom: 0, left: 0 }}');
  });
});
