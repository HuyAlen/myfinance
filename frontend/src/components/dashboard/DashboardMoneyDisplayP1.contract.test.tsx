import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import type { BudgetSpending } from "@/src/services/finance/financeCalculations";
import DashboardVisualOverview from "./DashboardVisualOverview";

const categories: Category[] = [{ id: "housing", name: "Nhà ở", type: "expense" }];
const transactions: Transaction[] = [{
  id: "expense-1", type: "expense", amount: 27_345_678,
  categoryId: "housing", walletId: "cash", note: "", date: "2026-10-10",
}];
const budgetSpending: BudgetSpending[] = [{
  budgetId: "budget-1", categoryId: "housing", month: "2026-10",
  spent: 4_460_123, limit: 1_002_000, remaining: -3_458_123,
  usagePercent: 445.12, isOverBudget: true, overAmount: 3_458_123, status: "over",
}];
const wallets: Wallet[] = [
  { id: "cash", name: "Tiền mặt", type: "cash", balance: 3_000_500 },
  { id: "momo", name: "Momo", type: "ewallet", balance: 448_125 },
];

describe("MYFINANCE DASHBOARD FULL VND DISPLAY P1", () => {
  it("renders actual amounts with Vietnamese thousands separators and đồng everywhere in the four cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(DashboardVisualOverview, {
        cashFlowChart: React.createElement("span", null, "Dữ liệu dòng tiền"),
        cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
        monthMode: true, year: 2026, month: 10,
        categories, transactions, budgetSpending, wallets,
      }),
    );

    expect(html).toContain("27.345.678 đ");
    expect(html).toContain("4.460.123 đ");
    expect(html).toContain("1.002.000 đ");
    expect(html).toContain("3.448.625 đ");
    expect(html).toContain("3.000.500 đ");
    expect(html).toContain("448.125 đ");
    expect(html).not.toContain(">27M<");
    expect(html).not.toContain(">3M<");
    expect(html).not.toContain(">448K<");
  });

  it("shows full VND values on the cash-flow vertical axis, not K/M abbreviations", () => {
    const source = readFileSync(path.resolve(__dirname, "CashFlowChart.tsx"), "utf8");
    expect(source).toContain("tickFormatter={(value) => formatVND(Number(value))}");
    expect(source).not.toContain("formatCompactVND");
  });

  it("renders the exact amount as visible text inside every expense mosaic tile, including the other category", () => {
    const categoryData: Category[] = [
      { id: "home", name: "Nhà ở", type: "expense" },
      { id: "food", name: "Ăn uống", type: "expense" },
      { id: "family", name: "Gia đình", type: "expense" },
      { id: "kids", name: "Con cái", type: "expense" },
      { id: "other", name: "Di chuyển", type: "expense" },
    ];
    const money = [6_345_678, 5_234_567, 4_123_456, 3_012_345, 2_001_234];
    const expenseData: Transaction[] = categoryData.map((category, index) => ({
      id: "tx-" + index,
      type: "expense",
      amount: money[index],
      categoryId: category.id,
      walletId: "cash",
      note: "",
      date: "2026-10-10",
    }));
    const html = renderToStaticMarkup(
      React.createElement(DashboardVisualOverview, {
        cashFlowChart: null,
        cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
        monthMode: true, year: 2026, month: 10,
        categories: categoryData, transactions: expenseData, budgetSpending: [], wallets: [],
      }),
    );
    const tileAmounts = [...html.matchAll(/data-dashboard-expense-amount="true"[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(tileAmounts).toEqual([
      "6.345.678 đ",
      "5.234.567 đ",
      "4.123.456 đ",
      "3.012.345 đ",
      "2.001.234 đ",
    ]);
    expect(html).toContain("Danh mục khác");
  });
});
