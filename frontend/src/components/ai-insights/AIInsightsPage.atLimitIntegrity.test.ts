import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "AIInsightsPage.tsx"), "utf8");

describe("BUDGET-AT-LIMIT-INTEGRITY-1 AI Insights", () => {
  it("shows at-limit as reached, never as generic tracking or near-limit", () => {
    expect(source).toContain('c.status === "at-limit"');
    expect(source).toContain('"Đạt giới hạn"');
  });
});
