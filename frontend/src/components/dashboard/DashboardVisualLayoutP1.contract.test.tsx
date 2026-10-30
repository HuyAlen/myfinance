import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BudgetSpending } from "@/src/services/finance/financeCalculations";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";
import { getDashboardWalletVisualRows } from "./DashboardVisualOverview";
import { getDashboardWalletDistribution } from "./DashboardVisualMetrics";

const categories: Category[] = [
  { id: "family", name: "Gia Đình Phát Sinh", type: "expense" },
  { id: "shopping", name: "Mua Sắm Tiêu Dùng", type: "expense" },
  { id: "entertainment", name: "Giải Trí Linh Hoạt", type: "expense" },
  { id: "food", name: "Ăn Uống + Sinh Hoạt", type: "expense" },
  { id: "housing", name: "Nhà ở", type: "expense" },
  { id: "kids", name: "Con cái", type: "expense" },
];
const spentValues = [7_224_900, 1_855_891, 1_392_210, 6_876_750, 900_000, 200_000];
const budgets: BudgetSpending[] = categories.map((category, index) => {
  const spent = spentValues[index];
  const limit = 1_000_000;
  return {
    budgetId: "budget-" + category.id,
    categoryId: category.id,
    month: "2026-10",
    limit,
    spent,
    remaining: limit - spent,
    usagePercent: Math.round((spent / limit) * 100),
    isOverBudget: spent > limit,
    overAmount: Math.max(0, spent - limit),
    status: spent > limit ? "over" : "on-track",
  };
});
const wallets: Wallet[] = [
  { id: "cash", name: "Tiền Mặt", balance: 150_000, type: "cash" },
  { id: "vnpay", name: "VN Pay Giải Trí + Thuốc", balance: 98_699, type: "ewallet" },
  { id: "momo", name: "Momo Con cái", balance: 61_108, type: "ewallet" },
  { id: "tpbank", name: "TP Bank Ăn uống Sinh hoạt", balance: 36_685, type: "bank" },
  { id: "vcb", name: "Vietcombank", balance: 8_325, type: "bank" },
  { id: "other", name: "Ví phụ", balance: 1_200, type: "cash" },
  { id: "negative", name: "Ví âm", balance: -5_000, type: "bank" },
];
const transactions: Transaction[] = [{
  id: "actual-expense",
  type: "expense",
  categoryId: "family",
  walletId: "cash",
  amount: 7_224_900,
  date: "2026-10-20",
  note: "",
}];

function render(
  budgetData = budgets,
  walletData = wallets,
  monthMode = true,
) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "actual cash-flow plot"),
    cashFlowReady: true,
    spendingReady: true,
    budgetReady: true,
    walletsReady: true,
    monthMode,
    year: 2026,
    month: 10,
    categories,
    transactions,
    budgetSpending: budgetData,
    wallets: walletData,
  }));
}

describe("MYFINANCE DASHBOARD VISUAL LAYOUT P1", () => {
  it("puts actionable budgets and wallets ahead of the cash-flow and expense charts in DOM order", () => {
    const html = render();
    const ids = ["budgets", "wallets", "cash-flow", "expenses"].map(
      (chart) => html.indexOf('data-dashboard-visual-chart="' + chart + '"'),
    );
    expect(ids.every((index) => index > 0)).toBe(true);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect((html.match(/data-dashboard-polish-panel="true"/g) ?? [])).toHaveLength(4);
  });

  it("keeps the four highest over-budget categories prominent with correct month/category/expense links", () => {
    const html = render();
    expect((html.match(/data-dashboard-budget-row="true"/g) ?? [])).toHaveLength(4);
    for (const category of categories.slice(0, 4)) {
      expect(html).toContain(
        'href="/transactions?categoryId=' + category.id + '&amp;month=2026-10&amp;type=expense"',
      );
    }
    expect(html).toContain("Xem tất cả 6 danh mục ngân sách");
    expect(html).toContain('href="/budgets"');
    expect(html).toContain("Vượt 6.224.900 đ");
    expect(html).toContain("722% đã dùng");
    expect(html).toContain('aria-valuemax="100"');
  });

  it("renders the exact positive-wallet sum, shares and wallet focus targets, never invented sample figures", () => {
    const html = render([], wallets);
    const total = wallets.reduce((sum, wallet) => sum + Math.max(0, wallet.balance), 0);
    expect(html).toContain(total.toLocaleString("vi-VN") + " đ");
    expect(html).toContain('href="/wallets?walletId=cash"');
    expect(html).toContain('href="/wallets?walletId=tpbank"');
    expect(html).toContain('href="/wallets"');
    expect(html).toContain("Ví khác");
    expect(html).toContain("1 ví số dư âm không nằm trong tổng số dư dương");

    const visualRows = getDashboardWalletDistribution(getDashboardWalletVisualRows(wallets));
    const actualSum = visualRows.reduce((sum, wallet) => sum + wallet.balance, 0);
    expect(actualSum).toBe(total);
  });

  it("preserves responsive financial labels, real-amount fields and keyboard navigation", () => {
    const html = render();
    expect(html).toContain('data-dashboard-budget-value="true"');
    expect(html).toContain('data-dashboard-budget-limit="true"');
    expect(html).toContain('data-dashboard-wallet-amount="true"');
    expect(html).toContain('data-dashboard-wallet-percent="true"');
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
    expect(html).toContain("sm:grid-cols-[44px_minmax(0,1fr)_112px]");
    expect(html).toContain("focus-visible:ring-2");
  });

  it("retains the month-mode empty state rather than constructing artificial budgets", () => {
    expect(render([], [], false)).toContain("Chọn bộ lọc Tháng để xem ngân sách");
    expect(render([], [], true)).toContain("Tháng này chưa có ngân sách");
  });

  it("reuses existing financial KPI data without manufacturing the mockup's sample change percentages", () => {
    const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
    expect(source).toContain('data-dashboard-polish-kpi="true"');
    expect(source).toContain("const kpiCards = [");
    expect(source).toContain("periodOperatingCashFlow.net");
    expect(source).toContain("savingsSnapshot.totalSavings");
    expect(source).toContain("forexSnapshot.profitLoss");
    const css = readFileSync(path.resolve(__dirname, "../../../app/dashboard-professional-polish.css"), "utf8");
    expect(css).toContain(':root[data-theme="dark"] .finance-shell [data-dashboard-polish-panel]');
    expect(css).toContain(':root[data-theme="dark"] .finance-shell [data-dashboard-polish-row="true"]');
    expect(css).toContain("@media (max-width: 639px)");
  });
});
