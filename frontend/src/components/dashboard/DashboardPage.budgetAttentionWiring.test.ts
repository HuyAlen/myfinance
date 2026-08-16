import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-DASH-2 Budget Attention Layer — wiring contracts.
 *
 * `dashboardBudgetAttention.test.ts` already proves the pure helper itself
 * uses the canonical `calculateBudgetSpendingCollection` engine (including
 * a test that fails if a naive expense-only reduce replaced it). This file
 * proves the DASHBOARD PAGE actually wires up that helper correctly:
 * imports it (rather than reimplementing budget-spend math inline),
 * routes its one CTA through the existing contextual navigation builder
 * with the worst offender's budgetId, and — critically — does not
 * introduce a second `getBudgets()` call site, which would violate the
 * "zero new network queries" requirement.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.perfOutcomeClassification.test.ts.
 */
describe("DashboardPage Budget Attention wiring (UI-DASH-2)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports the canonical buildDashboardBudgetAttention helper rather than reimplementing budget spend math inline", () => {
    expect(source).toContain(
      'import { buildDashboardBudgetAttention } from "@/src/lib/dashboard/dashboardBudgetAttention"',
    );
  });

  it("does not add a second getBudgets() call site — budgets remain fetched exactly once, in reloadData", () => {
    const occurrences = source.split("getBudgets(").length - 1;
    expect(occurrences).toBe(1);
  });

  it("the Budget Attention CTA uses the existing contextual navigation builder (buildBudgetsHref), not a bare route", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("buildBudgetsHref(");
    expect(sectionSource).not.toMatch(/router\.push\(\s*"\/budgets"\s*\)/);
  });

  it("the worst-offender CTA carries the specific budgetId, not just a generic budgets link", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("buildBudgetsHref({");
    expect(sectionSource).toContain(
      "budgetId: budgetAttention.worstOffender.budgetId",
    );
  });

  it("Budget Attention shares the same active-month key as Monthly Progress (dashboardMonthKey), rather than deriving its own drifting month filter", () => {
    expect(source).toContain(
      "budgets.filter((budget) => budget.month.startsWith(dashboardMonthKey))",
    );
  });

  // UI-DASH-2 Readiness Correctness patch additions below.

  it("imports isBudgetAttentionReady from the shared dashboard readiness module (not a locally reinvented composition)", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*isBudgetAttentionReady[^}]*\}\s*from\s*"@\/src\/lib\/dashboard\/dashboardReadiness"/,
    );
  });

  it("computes budgetAttentionReady exactly once, from isBudgetAttentionReady(budgetsLoaded, cashFlowReady)", () => {
    const occurrences = source.split("isBudgetAttentionReady(").length - 1;
    // Once for the import statement match above is a separate substring
    // (`isBudgetAttentionReady` alone, not `isBudgetAttentionReady(`), so
    // this only counts actual call sites.
    expect(occurrences).toBe(1);
    // Line-ending-agnostic (the file may be CRLF on this checkout):
    // require the call and both of its arguments to appear, in order,
    // within a small window — not that they share one exact byte-for-byte
    // literal newline style.
    const callIndex = source.indexOf("isBudgetAttentionReady(");
    const windowSource = source.slice(callIndex, callIndex + 80);
    expect(windowSource).toContain("budgetsLoaded");
    expect(windowSource).toContain("cashFlowReady");
  });

  it("the Budget Attention section renders a loading branch (skeleton) before the ready content, gated on budgetAttentionReady", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("!budgetAttentionReady ? (");
    // The ready branch still renders the existing UI-DASH-2 model fields —
    // confirming this patch didn't replace them, only added a gate.
    expect(sectionSource).toContain("budgetAttention.totalBudgets === 0");
    expect(sectionSource).toContain("budgetAttention.worstOffender");
  });

  it("budget readiness is never folded into Hero/Net Worth/Cash Flow readiness — PERF-4B's netWorthTrendReady call site does not reference budgetsLoaded", () => {
    const start = source.indexOf(
      "const netWorthTrendReady = isNetWorthTrendReady(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);
    expect(callSource).not.toContain("budgetsLoaded");
  });

  // UI-DASH-2 Show All Over-Budget Items patch additions below.

  it("renders every item in overBudgetItems (no arbitrary slice/cap) when one or more budgets are over", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("budgetAttention.overBudgetItems.map(");
    expect(sectionSource).not.toMatch(
      /overBudgetItems\s*\.\s*slice\(/,
    );
  });

  it("each over-budget row navigates using its own item.budgetId, not a reused first-item id", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    const mapIndex = sectionSource.indexOf("budgetAttention.overBudgetItems.map(");
    expect(mapIndex).toBeGreaterThan(-1);
    const mapWindow = sectionSource.slice(mapIndex, mapIndex + 600);
    expect(mapWindow).toContain("buildBudgetsHref({ budgetId: item.budgetId })");
    expect(mapWindow).toContain("key={item.budgetId}");
  });

  it("when zero budgets are over but one is near-limit, only the single topWarning row renders — over and near are never mixed", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("budgetAttention.overBudgetItems.length > 0 ? (");
    expect(sectionSource).toContain("budgetAttention.topWarning && (");
  });

  it("the bottom CTA routes to the general budgets page (no budgetId) when multiple items are over budget, since no single item represents the whole state", () => {
    const sectionStart = source.indexOf("{/* Budget attention */}");
    const sectionEnd = source.indexOf(
      "{/* UI-DASH-1: monthly progress",
      sectionStart,
    );
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("budgetAttention.overBudgetItems.length > 1");
  });

  it("budgetsLoaded is set only from the existing secondary budgets fetch, never from a new query", () => {
    const budgetsFetchStart = source.indexOf(
      "// Secondary content (Budget recommendation) resolves and paints",
    );
    expect(budgetsFetchStart).toBeGreaterThan(-1);
    const budgetsFetchEnd = source.indexOf(
      "}, [selectedYear, invalidatePeriodReadinessForNewContext]);",
      budgetsFetchStart,
    );
    const budgetsFetchSource = source.slice(budgetsFetchStart, budgetsFetchEnd);

    expect(budgetsFetchSource).toContain("setBudgetsLoaded(true)");
    expect(budgetsFetchSource).toContain("await budgetsPromise");
    // No second fetch call introduced alongside the readiness bookkeeping.
    expect(budgetsFetchSource.split("await ").length - 1).toBe(1);
  });
});
