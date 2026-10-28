import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BudgetSpending } from "@/src/services/finance/financeCalculations";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";

const categories: Category[] = [
  { id: "family", name: "Gia Đình Phát Sinh", type: "expense" },
  { id: "food", name: "Ăn Uống + Sinh Hoạt", type: "expense" },
  { id: "unset", name: "Chưa thiết lập", type: "expense" },
];
const transactions: Transaction[] = categories.slice(0, 2).map((category, index) => ({
  id: "tx" + index, type: "expense", amount: index ? 6_555_569 : 7_224_900,
  categoryId: category.id, walletId: "wallet", note: "", date: "2026-10-20",
}));
const budgets: BudgetSpending[] = [
  { budgetId: "family", categoryId: "family", month: "2026-10", limit: 1_000_000,
    spent: 7_224_900, remaining: -6_224_900, usagePercent: 722.49,
    isOverBudget: true, overAmount: 6_224_900, status: "over" },
  { budgetId: "food", categoryId: "food", month: "2026-10", limit: 5_000_000,
    spent: 6_555_569, remaining: -1_555_569, usagePercent: 131.11,
    isOverBudget: true, overAmount: 1_555_569, status: "over" },
  { budgetId: "unset", categoryId: "unset", month: "2026-10", limit: 0,
    spent: 0, remaining: 0, usagePercent: 0, isOverBudget: false,
    overAmount: 0, status: "healthy" },
];

function render(rows = budgets) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: null, cashFlowReady: true, spendingReady: true,
    budgetReady: true, walletsReady: true, monthMode: true,
    year: 2026, month: 10, categories, transactions, budgetSpending: rows, wallets: [],
  }));
}

describe("MYFINANCE MOBILE IPHONE BUDGET CLARITY P1", () => {
  it("renders readable mobile category rows with amounts and keeps desktop mosaic", () => {
    const html = render();
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
    expect(html).toContain('data-dashboard-mobile-expense-name="true"');
    expect(html).toContain('data-dashboard-mobile-expense-amount="true"');
    expect(html).toContain('sm:flex sm:h-[268px]');
    expect(html).toContain("7.224.900 đ");
  });

  it("uses a uniform capped 0-100 progress scale independent of 722% overspending", () => {
    const html = render();
    expect((html.match(/aria-valuemax="100"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("722% đã dùng");
    expect(html).toContain("Vượt 6.224.900 đ");
    expect(html).toContain("Vượt 1.555.569 đ");
    expect(html).toContain('data-dashboard-budget-row="true"');
    expect(html).not.toContain("750% là mốc cao nhất");
  });

  it("makes missing budget limits explicitly unavailable instead of fabricating 100%", () => {
    const html = render();
    expect(html).toContain("Chưa đặt hạn mức");
    expect(html).toContain("Chưa có hạn mức để so sánh");
  });

  it("separates spent and limit across mobile-safe columns and explains remaining money", () => {
    const html = render([{
      ...budgets[1], spent: 3_000_000, remaining: 2_000_000, overAmount: 0,
      isOverBudget: false, usagePercent: 60, status: "healthy",
    }]);
    expect(html).toContain("Còn 2.000.000 đ");
    expect(html).toContain('data-dashboard-budget-limit="true"');
    expect(html).toContain("60% đã dùng");
    expect(html).toContain("grid-cols-2");
  });
});
