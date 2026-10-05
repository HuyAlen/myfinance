import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "reports/ReportsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("REPORTS-IDENTIFIER-INTEGRITY-1", () => {
  it("keeps the ROI implementation identifier technical while the UI label stays Vietnamese", () => {
    expect(source).not.toContain("investmentTỷ suất lợi nhuận");
    expect(source).toContain("const investmentROI = useMemo(");
    expect(source).toContain('label="Tỷ suất lợi nhuận"');
  });
});
