import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BudgetSpending } from "@/src/services/finance/financeCalculations";
import type { Category } from "@/src/types/finance";
import { buildTransactionsHref, parseTransactionsContext } from "@/src/lib/navigation/financeNavigation";
import { resolveTransactionsEffectiveRange } from "@/src/lib/transactions/transactionsPeriod";
import DashboardVisualOverview from "./DashboardVisualOverview";

const categories: Category[] = [
  { id: "family", name: "Gia Đình Phát Sinh", type: "expense" },
  { id: "shopping", name: "Mua Sắm Tiêu Dùng", type: "expense" },
  { id: "food", name: "Ăn Uống + Sinh Hoạt", type: "expense" },
];

const budgets: BudgetSpending[] = [
  {
    budgetId: "budget-family", categoryId: "family", month: "2026-10",
    limit: 1_000_000, spent: 7_224_900, remaining: -6_224_900,
    usagePercent: 722, isOverBudget: true, overAmount: 6_224_900, status: "over",
  },
  {
    budgetId: "budget-shopping", categoryId: "shopping", month: "2026-10",
    limit: 800_000, spent: 1_855_891, remaining: -1_055_891,
    usagePercent: 232, isOverBudget: true, overAmount: 1_055_891, status: "over",
  },
  {
    budgetId: "budget-food", categoryId: "food", month: "2026-10",
    limit: 5_000_000, spent: 3_000_000, remaining: 2_000_000,
    usagePercent: 60, isOverBudget: false, overAmount: 0, status: "on-track",
  },
];

function renderBudgetCards(rows = budgets, monthMode = true) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: null, cashFlowReady: true, spendingReady: true,
    budgetReady: true, walletsReady: true, monthMode,
    year: 2026, month: 10, categories, transactions: [], budgetSpending: rows, wallets: [],
  }));
}

describe("MYFINANCE DASHBOARD BUDGET DRILLDOWN P1", () => {
  it("links each budget row to Transactions with its own category and month", () => {
    const html = renderBudgetCards();
    expect((html.match(/data-dashboard-budget-drilldown="transactions"/g) ?? [])).toHaveLength(3);
    expect((html.match(/data-dashboard-budget-row="true"/g) ?? [])).toHaveLength(3);

    for (const row of budgets) {
      const href = buildTransactionsHref({ categoryId: row.categoryId, month: row.month });
      expect(html).toContain('href="' + href.replaceAll("&", "&amp;") + '"');
    }
    expect(html).not.toContain("budgetId=");
  });

  it("uses the budget record month rather than deriving it from the display header", () => {
    const html = renderBudgetCards([{ ...budgets[0], month: "2026-09" }]);
    expect(html).toContain('href="/transactions?categoryId=family&amp;month=2026-09"');
    expect(html).not.toContain('href="/transactions?categoryId=family&amp;month=2026-10"');
  });

  it("reuses the destination parser and effective range, including a historical month", () => {
    const href = buildTransactionsHref({ categoryId: "family", month: "2026-10" });
    const url = new URL(href, "https://example.invalid");
    const context = parseTransactionsContext(url.searchParams);
    expect(context).toEqual({
      categoryId: "family", dateFrom: "2026-10-01", dateTo: "2026-10-31",
    });
    expect(resolveTransactionsEffectiveRange({
      startDate: "2026-08-01", endDate: "2026-08-31",
    }, context)).toEqual({
      startDate: "2026-10-01", endDate: "2026-10-31",
    });
  });

  it("provides a keyboard-accessible, clearly signposted link without changing budget metrics", () => {
    const html = renderBudgetCards();
    expect(html).toContain('aria-label="Xem giao dịch danh mục Gia Đình Phát Sinh tháng 10/2026"');
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("Xem giao dịch");
    expect(html).toContain("722% đã dùng");
    expect(html).toContain("Vượt 6.224.900 đ");
    expect((html.match(/role="progressbar"/g) ?? [])).toHaveLength(3);
  });

  it("does not create drilldown links outside month mode", () => {
    const html = renderBudgetCards(budgets, false);
    expect(html).not.toContain('data-dashboard-budget-drilldown="transactions"');
  });
});
