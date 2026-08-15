import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateFinancialStructureSummary,
  getTotalExpense,
} from "@/src/services/finance/financeCalculations";
import type { Category, Transaction } from "@/src/types/finance";

/**
 * DASH-POLISH-1 — Canonical Summary & Readiness Consistency.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.budgetAttentionWiring.test.ts and
 * DashboardPage.periodComparisonWiring.test.ts.
 */
describe("DashboardPage canonical Financial Structure consistency (DASH-POLISH-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("defines ONE shared accepted non-transfer transaction collection", () => {
    expect(source).toContain(
      "const nonTransferFilteredTransactions = useMemo(",
    );
  });

  it("periodFlowSummary (the canonical KPI source) is built from the shared collection", () => {
    const start = source.indexOf("const periodFlowSummary = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [nonTransferFilteredTransactions, categories]);", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).toContain("getTotalIncome(nonTransferFilteredTransactions)");
    expect(body).toContain(
      "getTotalExpense(nonTransferFilteredTransactions, categories)",
    );
  });

  it("Financial Structure now uses the SAME shared collection, not raw filteredTransactions", () => {
    const start = source.indexOf("const financialStructure = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const financialStructureAdjusted", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    expect(body).toContain("transactions: nonTransferFilteredTransactions");
    expect(body).not.toContain("transactions: filteredTransactions,");
  });

  it("the 50/30/20 allocation also reuses the shared collection instead of re-deriving its own transfer filter", () => {
    const start = source.indexOf("const allocation5030 = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const financialStructure = useMemo(", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    expect(body).toContain("transactions: nonTransferFilteredTransactions");
    expect(body).not.toContain("isInternalTransferTransaction(transaction)");
  });

  it("no formula inside calculateFinancialStructureSummary/calculateRule503020 was touched — only the input transaction set changed", () => {
    // The canonical functions themselves are imported, never redefined
    // locally — a redefinition would indicate the formulas were rewritten
    // rather than just fed a different (correctly-filtered) input.
    expect(source).toContain("calculateFinancialStructureSummary,");
    expect(source).toContain("calculateRule503020,");
    expect(source).not.toContain("function calculateFinancialStructureSummary");
    expect(source).not.toContain("function calculateRule503020");
  });
});

describe("canonical helpers do not themselves apply the Dashboard's transfer-note heuristic (why a shared pre-filter is required)", () => {
  // Mirrors DashboardPage.tsx's private isInternalTransferTransaction
  // verbatim (keyword list + type==="transfer" check) — not a new
  // heuristic. It is private to the page component and this repo's test
  // convention reads DashboardPage.tsx as source text rather than
  // importing it as a module (see the describe block above), so this
  // fixture-construction helper mirrors the real predicate instead.
  const INTERNAL_TRANSFER_KEYWORDS = [
    "transfer",
    "internal",
    "chuyển tiền",
    "chuyen tien",
    "chuyển khoản",
    "chuyen khoan",
    "chuyển nội bộ",
    "chuyen noi bo",
    "sang vietcombank",
    "sang tp bank",
    "sang tpbank",
  ];

  function isInternalTransferTransaction(transaction: Transaction): boolean {
    const record = transaction as unknown as Record<string, unknown>;
    const searchableText = [record.type, record.note]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      transaction.type === "transfer" ||
      INTERNAL_TRANSFER_KEYWORDS.some((keyword) =>
        searchableText.includes(keyword),
      )
    );
  }

  function makeCategory(overrides: Partial<Category>): Category {
    return {
      id: "c1",
      name: "Chi tiêu",
      type: "expense",
      planningGroup: "variable",
      ...overrides,
    } as Category;
  }

  function makeTransaction(overrides: Partial<Transaction>): Transaction {
    return {
      id: "t1",
      type: "expense",
      amount: 0,
      categoryId: "c1",
      walletId: "w1",
      note: "",
      date: "2026-08-01",
      ...overrides,
    } as Transaction;
  }

  it("a mislabeled transfer (type=expense, note matching the transfer heuristic) is included by getTotalExpense/calculateFinancialStructureSummary when NOT pre-filtered — this is the exact divergence the patch fixes", () => {
    const income = makeTransaction({
      id: "income",
      type: "income",
      amount: 5_000_000,
      note: "Lương tháng 8",
    });
    const mislabeledTransfer = makeTransaction({
      id: "transfer",
      type: "expense",
      amount: 2_000_000,
      note: "Chuyển khoản sang Vietcombank",
    });
    const realExpense = makeTransaction({
      id: "expense",
      type: "expense",
      amount: 1_000_000,
      note: "Ăn uống",
    });
    const categories = [makeCategory({})];
    const rawTransactions = [income, mislabeledTransfer, realExpense];

    // Confirm the fixture actually matches the heuristic (sanity check on
    // the fixture itself, not the assertion under test).
    expect(isInternalTransferTransaction(mislabeledTransfer)).toBe(true);
    expect(isInternalTransferTransaction(realExpense)).toBe(false);

    // BEFORE this patch: Financial Structure received raw transactions
    // with no pre-filter — the mislabeled transfer inflates its expense.
    const beforeFixExpense = getTotalExpense(rawTransactions, categories);
    expect(beforeFixExpense).toBe(3_000_000); // 2,000,000 + 1,000,000 — polluted

    // AFTER this patch: both the canonical KPI pipeline and Financial
    // Structure receive the SAME pre-filtered collection.
    const sharedNonTransferTransactions = rawTransactions.filter(
      (transaction) => !isInternalTransferTransaction(transaction),
    );
    const canonicalKpiExpense = getTotalExpense(
      sharedNonTransferTransactions,
      categories,
    );
    const financialStructureExpense = calculateFinancialStructureSummary({
      transactions: sharedNonTransferTransactions,
      categories,
    }).expense;

    expect(canonicalKpiExpense).toBe(1_000_000); // mislabeled transfer correctly excluded
    expect(financialStructureExpense).toBe(canonicalKpiExpense); // the two can no longer disagree
  });

  it("income agrees between the canonical KPI pipeline and Financial Structure once both share the same pre-filtered input", () => {
    const income = makeTransaction({
      id: "income",
      type: "income",
      amount: 5_000_000,
    });
    const mislabeledTransferIncome = makeTransaction({
      id: "transfer-income",
      type: "income",
      amount: 500_000,
      note: "Chuyển tiền nội bộ giữa các ví",
    });
    const categories = [makeCategory({})];
    const rawTransactions = [income, mislabeledTransferIncome];

    const sharedNonTransferTransactions = rawTransactions.filter(
      (transaction) => !isInternalTransferTransaction(transaction),
    );

    const canonicalKpiIncome = sharedNonTransferTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const financialStructureIncome = calculateFinancialStructureSummary({
      transactions: sharedNonTransferTransactions,
      categories,
    }).income;

    expect(canonicalKpiIncome).toBe(5_000_000);
    expect(financialStructureIncome).toBe(canonicalKpiIncome);
  });
});

describe("DashboardPage readiness gating for Monthly Progress and Financial Structure (DASH-POLISH-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports isMonthlyProgressReady alongside the existing readiness helpers", () => {
    const importIndex = source.indexOf(
      '"@/src/lib/dashboard/dashboardReadiness"',
    );
    expect(importIndex).toBeGreaterThan(-1);
    const importWindow = source.slice(Math.max(0, importIndex - 300), importIndex);
    expect(importWindow).toContain("isMonthlyProgressReady");
    expect(importWindow).toContain("isBudgetAttentionReady");
  });

  it("computes monthlyProgressReady via isMonthlyProgressReady(cashFlowReady, budgetsLoaded) — not a bare alias of budgetAttentionReady", () => {
    const declIndex = source.indexOf(
      "const monthlyProgressReady = isMonthlyProgressReady(",
    );
    expect(declIndex).toBeGreaterThan(-1);
    const window = source.slice(declIndex, declIndex + 120);
    expect(window).toContain("cashFlowReady");
    expect(window).toContain("budgetsLoaded");
    expect(source).not.toContain(
      "const monthlyProgressReady = budgetAttentionReady",
    );
  });

  it("Monthly Progress's spend/budget stat grid is gated on monthlyProgressReady with a skeleton fallback", () => {
    const sectionStart = source.indexOf("{/* Monthly progress */}");
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = source.indexOf("{/* Cash flow and structure */}", sectionStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const sectionSource = source.slice(sectionStart, sectionEnd);

    expect(sectionSource).toContain("monthlyProgressReady ? (");
    expect(sectionSource).toContain("animate-pulse");
    // The ready branch still renders the real fields — the gate didn't
    // replace them, only wrapped them.
    expect(sectionSource).toContain("monthlyPulse.expense");
    expect(sectionSource).toContain("monthlyPulse.budgetUsage");
  });

  it("Monthly Progress's calendar fields (elapsed days, time-progress bar) remain always visible — no fetch dependency, must not be gated", () => {
    const sectionStart = source.indexOf("{/* Monthly progress */}");
    const gateIndex = source.indexOf("monthlyProgressReady ? (", sectionStart);
    expect(gateIndex).toBeGreaterThan(sectionStart);
    const beforeGate = source.slice(sectionStart, gateIndex);

    expect(beforeGate).toContain("monthlyPulse.elapsedDays");
    expect(beforeGate).toContain("monthlyPulse.progress");
  });

  it("computes financialStructureReady as the union of cashFlowReady and savingInvestmentReady", () => {
    expect(source).toContain(
      "const financialStructureReady = cashFlowReady && savingInvestmentReady;",
    );
  });

  it("Financial Structure's card list is gated on financialStructureReady with a skeleton fallback", () => {
    const panelStart = source.indexOf('title="Cấu trúc tài chính"');
    expect(panelStart).toBeGreaterThan(-1);
    const panelEnd = source.indexOf("</Panel>", panelStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelSource = source.slice(panelStart, panelEnd);

    expect(panelSource).toContain("financialStructureReady ? (");
    expect(panelSource).toContain("animate-pulse");
    expect(panelSource).toContain("financialStructureCards.map(");
  });
});

describe("DASH-POLISH-1 preserves zero-new-query and prior UI-DASH contracts", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("does not add a new getTransactionsInRange or getBudgets call site", () => {
    // 3 textual occurrences: the 2 real call sites (reloadData/reloadPeriod)
    // plus one pre-existing code comment mentioning the function name.
    expect(source.split("getTransactionsInRange(").length - 1).toBe(3);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });

  it("Budget Attention (UI-DASH-2) is untouched — same readiness composition as before", () => {
    expect(source).toContain(
      "const budgetAttentionReady = isBudgetAttentionReady(",
    );
    expect(source).toContain("budgetAttention.overBudgetItems.map(");
  });

  it("UI-DASH-4 comparison wiring is untouched", () => {
    expect(source).toContain("const periodComparison = useMemo(");
    expect(source).toContain("buildDashboardComparison(netCashFlow, previousNetCashFlow)");
  });

  it("UI-DASH-3 Action Center identity wiring is untouched", () => {
    expect(source).toContain("deriveAggregateIssueKind(domain)");
    expect(source).toContain("selectDashboardPriorityActions([");
  });
});
