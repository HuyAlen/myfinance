import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASHBOARD-ACTIONCENTER-1 — Action Center Readiness Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.budgetAttentionWiring.test.ts.
 *
 * Before this patch, Action Center rendered off `priorityActions.length >
 * 0` alone — with `generateDashboardActions`' own internal
 * `hasFinancialData` gate being a loose OR across six raw arrays, a
 * partial readiness state (e.g. transactions/budgets already loaded,
 * wallets/debts/investments/goals still their initial []) could present a
 * genuinely incomplete recommendation set as if it were the complete,
 * authoritative one. These tests prove the fix: Action Center's body is
 * now withheld behind `isActionCenterReady`'s six-flag union — the exact
 * union `isActionCenterReady`'s own doc comment derives field-by-field
 * from `generateDashboardActions`' seven rules — until every required
 * domain has loaded at least once.
 */
describe("DashboardPage Action Center readiness wiring (DASHBOARD-ACTIONCENTER-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports isActionCenterReady from the canonical dashboardReadiness module", () => {
    expect(source).toContain("isActionCenterReady");
    expect(source).toContain(
      '} from "@/src/lib/dashboard/dashboardReadiness";',
    );
  });

  it("computes actionCenterReady from exactly the six required domains, in the function's documented parameter order", () => {
    const start = source.indexOf("const actionCenterReady = isActionCenterReady(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);

    const order = [
      "isDashboardReady",
      "cashFlowReady",
      "savingInvestmentReady",
      "emergencyFundReady",
      "goalsReady",
      "budgetsLoaded",
    ];
    let lastIndex = -1;
    for (const arg of order) {
      const idx = callSource.indexOf(arg);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("does not include forexReady in the actionCenterReady call — no Action Center rule reads a Forex-ledger-derived field", () => {
    const start = source.indexOf("const actionCenterReady = isActionCenterReady(");
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);
    expect(callSource).not.toContain("forexReady");
  });

  it("the Action Center section gates its body on !actionCenterReady before the priorityActions ternary", () => {
    const sectionStart = source.indexOf("{/* Action center */}");
    const sectionEnd = source.indexOf("{/* Operating KPIs */}", sectionStart);
    expect(sectionStart).toBeGreaterThan(-1);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("{!actionCenterReady ? (");
    const notReadyIdx = sectionSource.indexOf("{!actionCenterReady ? (");
    const priorityIdx = sectionSource.indexOf("priorityActions.length > 0 ? (");
    expect(priorityIdx).toBeGreaterThan(notReadyIdx);
  });

  it("the not-ready branch renders a loading placeholder, not the legitimate-zero-actions message or the action cards", () => {
    const sectionStart = source.indexOf("{/* Action center */}");
    const sectionEnd = source.indexOf("{/* Operating KPIs */}", sectionStart);
    const sectionSource = source.slice(sectionStart, sectionEnd);

    const notReadyIdx = sectionSource.indexOf("{!actionCenterReady ? (");
    const priorityIdx = sectionSource.indexOf("priorityActions.length > 0 ? (");
    const notReadyBranch = sectionSource.slice(notReadyIdx, priorityIdx);

    expect(notReadyBranch).toContain("animate-pulse");
    expect(notReadyBranch).not.toContain("ActionCard");
    expect(notReadyBranch).not.toContain("Tài chính đang trong trạng thái ổn định");
  });

  it("does not introduce a new Date()/current-month fallback into Action Center readiness or its call site", () => {
    const start = source.indexOf("const actionCenterReady = isActionCenterReady(");
    const end = source.indexOf("const upcomingMoneyEvents = useMemo(", start);
    const regionSource = source.slice(start, end);
    expect(regionSource).not.toContain("new Date()");
  });

  it("dashboardMonthKey wiring into generateDashboardActions remains untouched (FINANCE-CORRECTNESS-1)", () => {
    const callStart = source.indexOf("generateDashboardActions({");
    const callEnd = source.indexOf("}),", callStart);
    const callSource = source.slice(callStart, callEnd);
    expect(callSource).toContain("monthKey: dashboardMonthKey");
  });

  it("does not add a new getWallets/getDebts/getInvestments/getGoals/getBudgets call site — readiness reuses existing fetched state only", () => {
    for (const fn of ["getWallets(", "getDebts(", "getInvestments(", "getGoals(", "getBudgets("]) {
      const occurrences = source.split(fn).length - 1;
      // Each of these is fetched exactly once in reloadData, same as before this patch.
      expect(occurrences).toBe(1);
    }
  });

  it("does not add a new useEffect merely to synchronize actionCenterReady", () => {
    const start = source.indexOf("const actionCenterReady = isActionCenterReady(");
    const end = source.indexOf("const upcomingMoneyEvents = useMemo(", start);
    const regionSource = source.slice(start, end);
    expect(regionSource).not.toContain("useEffect(");
  });
});
