import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "CashFlowChart.tsx"),
  "utf8",
);

describe("CashFlowChart dashboard polish contract", () => {
  it("keeps the full T1-T12 timeline visible without auto-skipping month labels", () => {
    expect(source).toContain('dataKey="label"');
    expect(source).toContain("interval={0}");
  });

  it("does not draw meaningless zero-only historical months as a flat blue line", () => {
    expect(source).toContain("normalizeCashFlowPointForChart");
    expect(source).toContain("hasCashFlowActivity");
    expect(source).toContain("netCashMovement: null");
  });

  it("keeps one chart with a shared, honest scale and visible zero baseline", () => {
    expect(source).toContain("getCashFlowDomain");
    expect(source).toContain("getCashFlowTicks");
    expect(source).toContain("getNiceCashFlowStep");
    expect(source).toContain("(paddedMax - paddedMin) / 5");
    expect(source).toContain("domain={cashFlowDomain}");
    expect(source).toContain("ticks={cashFlowTicks}");
    expect(source).toContain("<ReferenceLine");
    expect(source).toContain("y={0}");
    expect(source.match(/<ComposedChart/g)).toHaveLength(1);
    expect(source).not.toContain("data-dashboard-cash-flow-gross");
    expect(source).not.toContain("data-dashboard-cash-flow-net");
  });

  it("focuses sparse years on actual months without fabricating zero values", () => {
    expect(source).toContain("getVisibleCashFlowPoints");
    expect(source).toContain("data.findIndex(hasCashFlowActivity)");
    expect(source).toContain("firstActive - 1");
    expect(source).toContain("lastActive + 1");
    expect(source).toContain("if (firstActive === -1) return data");
    expect(source).toContain('className="mt-4 flex flex-1 flex-col"');
    expect(source).toContain('className="min-h-56 flex-1 xl:min-h-[300px]"');
    expect(source).toContain('height="100%"');
  });

  it("labels liquidity semantics explicitly", () => {
    expect(source).toContain("tháng có dòng tiền");
    expect(source).toContain("Thu vào");
    expect(source).toContain("Chi ra");
    expect(source).toContain("Dòng tiền ròng");
    expect(source).toContain('dataKey="cashIn"');
    expect(source).toContain('dataKey="cashOut"');
    expect(source).toContain('dataKey="netCashMovement"');
  });

  it("uses dashboard-balanced semantic cash-flow colors without changing chart density", () => {
    expect(source).toContain('fill="#34D399"');
    expect(source).toContain('stroke="#10B981"');
    expect(source).toContain('fill="#FB7185"');
    expect(source).toContain('stroke="#F43F5E"');
    expect(source).toContain('stroke="#3B82F6"');
    expect(source).toContain("maxBarSize={24}");
  });

  it("gives the net-cash line clear visual weight", () => {
    expect(source).toContain("strokeWidth={3.75}");
    expect(source).toContain("r: 4,");
    expect(source).toContain("r: 5.5,");
  });
});
