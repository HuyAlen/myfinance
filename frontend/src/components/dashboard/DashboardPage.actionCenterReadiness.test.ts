import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Dashboard Action Center / "Ưu tiên tài chính" block was intentionally
 * removed from the page. This file now acts as a regression guard so stale
 * readiness/action-generator wiring cannot silently bring it back.
 */
describe("DashboardPage Action Center removal", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("does not import or compute Action Center readiness", () => {
    expect(source).not.toContain("isActionCenterReady");
    expect(source).not.toContain("const actionCenterReady");
  });

  it("does not generate or rank Dashboard priority actions", () => {
    expect(source).not.toContain("generateDashboardActions");
    expect(source).not.toContain("selectDashboardPriorityActions");
    expect(source).not.toContain("DashboardActionCandidate");
    expect(source).not.toContain("priorityActions");
    expect(source).not.toContain("v3AdvisorActions");
    expect(source).not.toContain("aiActions");
  });

  it("does not render the removed Financial Priority section", () => {
    expect(source).not.toContain("{/* Action center */}");
    expect(source).not.toContain("Ưu tiên tài chính");
    expect(source).not.toContain("Tối đa 3 việc quan trọng");
    expect(source).not.toContain("Tài chính đang trong trạng thái ổn định");
  });

  it("does not retain Action Center-only icon/runtime wiring", () => {
    expect(source).not.toContain("AlertTriangle,");
    expect(source).not.toContain("Bot,");
    expect(source).not.toContain("TrendingDown,");
    expect(source).not.toContain("Zap,");
  });

  it("keeps the independent Budget Attention and KPI surfaces", () => {
    expect(source).toContain("const budgetAttentionReady = isBudgetAttentionReady(");
    expect(source).toContain("{/* Budget attention */}");
    expect(source).toContain("{/* Operating KPIs */}");
  });

  it("does not add new finance queries as part of the removal", () => {
    for (const fn of [
      "getWallets(",
      "getDebts(",
      "getInvestments(",
      "getGoals(",
      "getBudgets(",
    ]) {
      expect(source.split(fn).length - 1).toBe(1);
    }
  });
});
