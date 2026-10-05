import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "NetWorthTrendChart.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("NETWORTH-MONTH-LABEL-CONTINUITY-1", () => {
  it("keeps every recorded snapshot label, including middle months such as September, instead of limiting labels to first/latest", () => {
    expect(source).toContain("let snapshotLabelIndex = 0;");
    expect(source).toContain("chartLabelNear:");
    expect(source).toContain("chartLabelFar:");
    expect(source).not.toContain("const firstPoint = snapshotPoints[0] ?? null;");
  });

  it("stagger-labels adjacent snapshot values on two vertical lanes so consecutive months do not collide", () => {
    expect(source).toContain('dataKey="chartLabelNear"');
    expect(source).toContain('dataKey="chartLabelFar"');
    expect(source).toContain("offset={7}");
    expect(source).toContain("offset={20}");
    expect(source).toContain("margin={{ top: 34, right: 18, bottom: 0, left: 0 }}");
  });
});