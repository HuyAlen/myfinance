import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "BudgetsPage.tsx"), "utf8");

describe("BUDGET-AT-LIMIT-INTEGRITY-1 BudgetsPage", () => {
  it("uses the canonical status derivation for card fallback and period-rollup rows", () => {
    expect(source).toContain("deriveBudgetSpendingStatus");
    expect(source).not.toContain("spent >= budget.limitAmount * 0.85");
  });

  it("renders exact-limit cards with a dedicated reached-limit label and tone", () => {
    expect(source).toContain('"at-limit": {');
    expect(source).toContain('"at-limit": "Đã đạt giới hạn"');
    expect(source).toContain('status === "at-limit"');
  });

  it("does not tell the user they can keep spending when aggregate remaining is exactly zero", () => {
    expect(source).toContain('filteredSummary.remaining === 0');
    expect(source).toContain('"Đã dùng hết hạn mức"');
    expect(source).toContain('filteredSummary.status === "at-limit"');
    expect(source).not.toContain('filteredSummary.percent === 100');
    expect(source).toContain('"Đã đạt giới hạn"');
  });
});
