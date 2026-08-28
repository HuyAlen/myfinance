import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateFinancialStructureSummary,
  getTotalExpense,
} from "@/src/services/finance/financeCalculations";
import type { Category, Transaction } from "@/src/types/finance";
import { isInternalTransferTransaction } from "@/src/lib/transactions/transactionClassification";

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

  it("period flow KPIs and future allocation are derived from one canonical flow snapshot", () => {
    const start = source.indexOf("const periodFinanceFlow = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const periodFlowSummary = useMemo(", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).toContain("calculateFinanceFlowSnapshot({");
    expect(body).toContain("transactions: nonTransferFilteredTransactions");
    expect(body).toContain("savingMovements: savingTransactions");
    expect(body).toContain("forexCashTransactions");
    expect(body).toContain("dateRange");
    expect(source).toContain("expense: periodFinanceFlow.realExpense");
    expect(source).toContain("savingAmount: periodFinanceFlow.savingAllocation");
    expect(source).toContain(
      "investmentAmount: periodFinanceFlow.investmentAllocation",
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

  it("does not compute or render a 50/30/20 allocation on Dashboard", () => {
    expect(source).not.toContain("calculateRule503020");
    expect(source).not.toContain("allocation5030");
    expect(source).not.toContain("AllocationRow");
    expect(source).not.toContain("50/30/20");
  });

  it("keeps canonical Financial Structure independent from the removed allocation rule", () => {
    expect(source).toContain("calculateFinancialStructureSummary,");
    expect(source).not.toContain("function calculateFinancialStructureSummary");
    expect(source).not.toContain("calculateRule503020,");
  });
});

describe("Dashboard uses the shared canonical transfer classifier", () => {
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

  it("does not misclassify a real expense as an internal transfer just because its note says chuyển khoản", () => {
    const expense = makeTransaction({
      id: "expense",
      amount: 1_000_000,
      note: "Chuyển khoản học phí con",
    });
    const categories = [makeCategory({})];

    expect(isInternalTransferTransaction(expense)).toBe(false);
    expect(getTotalExpense([expense], categories)).toBe(1_000_000);
    expect(
      calculateFinancialStructureSummary({
        transactions: [expense],
        categories,
      }).expense,
    ).toBe(1_000_000);
  });

  it("removes true transfer rows without changing canonical income/expense totals", () => {
    const income = makeTransaction({
      id: "income",
      type: "income",
      amount: 5_000_000,
    });
    const expense = makeTransaction({
      id: "expense",
      amount: 1_000_000,
    });
    const transfer = makeTransaction({
      id: "transfer",
      type: "transfer",
      amount: 2_000_000,
      note: "Chuyển tiền nội bộ",
    });
    const categories = [makeCategory({})];
    const sharedNonTransferTransactions = [income, expense, transfer].filter(
      (transaction) => !isInternalTransferTransaction(transaction),
    );

    expect(sharedNonTransferTransactions.map((item) => item.id)).toEqual([
      "income",
      "expense",
    ]);
    expect(getTotalExpense(sharedNonTransferTransactions, categories)).toBe(
      1_000_000,
    );
    expect(
      calculateFinancialStructureSummary({
        transactions: sharedNonTransferTransactions,
        categories,
      }).expense,
    ).toBe(1_000_000);
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
    // NETWORTH-HISTORY-1 leaves exactly the 2 real transaction call sites
    // (reloadData/reloadPeriod). Historical Net Worth has its own reader now.
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });

  it("Budget Attention (UI-DASH-2) is untouched — same readiness composition as before", () => {
    expect(source).toContain(
      "const budgetAttentionReady = isBudgetAttentionReady(",
    );
    expect(source).toContain("budgetAttention.overBudgetItems.map(");
  });

  it("the intentionally removed KPI period-comparison UI stays absent", () => {
    expect(source).not.toContain("const periodComparison = useMemo(");
    expect(source).not.toContain("cashFlowComparisonLabel");
    expect(source).not.toContain("savingRateComparisonLabel");
  });

  it("the intentionally removed Action Center stays absent", () => {
    expect(source).not.toContain("Ưu tiên tài chính");
    expect(source).not.toContain("priorityActions");
    expect(source).not.toContain("selectDashboardPriorityActions([");
    expect(source).not.toContain("generateDashboardActions");
  });
});
