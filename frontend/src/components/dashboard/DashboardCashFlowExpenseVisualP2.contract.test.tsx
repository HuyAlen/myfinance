import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import { getDashboardObservedCashFlowTotals } from "./DashboardVisualMetrics";
import DashboardVisualOverview from "./DashboardVisualOverview";

const categories: Category[] = [
  { id: "family", name: "Gia Đình Phát Sinh", type: "expense" },
  { id: "food", name: "Ăn Uống + Sinh Hoạt", type: "expense" },
];
const transactions: Transaction[] = [
  { id: "one", categoryId: "family", type: "expense", amount: 7_224_900, date: "2026-10-01", walletId: "cash", note: "" },
  { id: "two", categoryId: "food", type: "expense", amount: 6_876_750, date: "2026-10-01", walletId: "cash", note: "" },
];
const flow = [
  { label: "T9", cashIn: 12_000_000, cashOut: 3_000_000, netCashMovement: 9_000_000 },
  { label: "T10", cashIn: 4_000_000, cashOut: 7_000_000, netCashMovement: -3_000_000 },
  { label: "T11", cashIn: null, cashOut: null, netCashMovement: null },
];

function render(data = flow) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("div", null, "chart with real data"),
    cashFlowData: data,
    cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
    monthMode: true, year: 2026, month: 10, categories, transactions,
    budgetSpending: [], wallets: [],
  }));
}

describe("MYFINANCE CASHFLOW + EXPENSE VISUAL P2", () => {
  it("aggregates observed year-to-date amounts and never inserts placeholder zeros for future months", () => {
    expect(getDashboardObservedCashFlowTotals(flow)).toEqual({
      cashIn: 16_000_000, cashOut: 10_000_000, netCashMovement: 6_000_000,
    });
    expect(getDashboardObservedCashFlowTotals([{ label: "T11", cashIn: null, cashOut: null, netCashMovement: null }])).toBeNull();
    expect(getDashboardObservedCashFlowTotals([{ cashIn: 0, cashOut: 0, netCashMovement: 0 }])).toEqual({
      cashIn: 0, cashOut: 0, netCashMovement: 0,
    });
  });

  it("renders each true total from the same data passed to the chart", () => {
    const html = render();
    expect(html).toContain('data-dashboard-cashflow-summary="true"');
    expect(html).toContain("16.000.000 đ");
    expect(html).toContain("10.000.000 đ");
    expect(html).toContain("6.000.000 đ");
    expect(html).toContain('data-dashboard-insight-surface="cash-flow"');
    expect(html).toContain("chart with real data");
  });

  it("omits cashflow summary for unavailable data instead of showing invented amounts", () => {
    expect(render([])).not.toContain('data-dashboard-cashflow-summary="true"');
  });

  it("retains the treemap exact amounts, source-driven area weighting and readable labels", () => {
    const html = render();
    expect(html).toContain('data-dashboard-insight-card="expenses"');
    expect(html).toContain("14.101.650 đ");
    expect(html).toContain("7.224.900 đ");
    expect(html).toContain("6.876.750 đ");
    expect(html).toContain('data-dashboard-expense-name="true"');
    expect(html).toContain('data-dashboard-expense-amount="true"');
    expect(html).toContain("sm:text-[13px]");
    expect(html).toContain('role="img"');
  });

  it("integrates the same canonical cashFlowData and scopes dark-mode styles", () => {
    const page = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
    const css = readFileSync(path.resolve(__dirname, "../../../app/dashboard-professional-polish.css"), "utf8");
    expect(page).toContain('cashFlowChart={<CashFlowChart data={cashFlowData} />}');
    expect(page).toContain("cashFlowData={cashFlowData}");
    expect(css).toContain('[data-dashboard-insight-surface]');
    expect(css).toContain(':root[data-theme="dark"]');
  });
});
