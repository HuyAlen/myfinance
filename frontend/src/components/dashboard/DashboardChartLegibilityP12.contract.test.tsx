import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import type { BudgetSpending } from "@/src/services/finance/financeCalculations";
import DashboardVisualOverview from "./DashboardVisualOverview";
import { formatCashFlowTickValue } from "./CashFlowChart";

const categories: Category[] = [{ id: "kids", name: "Con cái (Sữa + Tã + Phát Sinh)", type: "expense" }];
const transactions: Transaction[] = [{
  id: "expense", type: "expense", amount: 4_307_175,
  categoryId: "kids", walletId: "cash", note: "", date: "2026-10-20",
}];
const budgetSpending: BudgetSpending[] = [{
  budgetId: "budget", categoryId: "kids", month: "2026-10", spent: 4_307_175,
  limit: 3_000_000, remaining: -1_307_175, usagePercent: 143.57,
  isOverBudget: true, overAmount: 1_307_175, status: "over",
}];
const wallets: Wallet[] = [
  { id: "cash", name: "Tiền mặt", type: "cash", balance: 2_639_000 },
  { id: "bank", name: "VN Pay Giải Trí + Thuốc", type: "bank", balance: 389_209 },
];

function openingTag(html: string, marker: string) {
  const index = html.indexOf(marker + '="true"');
  if (index === -1) return "";
  return html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);
}

describe("MYFINANCE DASHBOARD CHART LEGIBILITY P1.2", () => {
  const html = renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "Cash flow"),
    cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
    monthMode: true, year: 2026, month: 10, categories, transactions,
    budgetSpending, wallets,
  }));

  it("uses readable type sizes for treemap names and actual amounts", () => {
    expect(openingTag(html, "data-dashboard-expense-name")).toContain("sm:text-[13px]");
    expect(openingTag(html, "data-dashboard-expense-amount")).toContain("sm:text-[13px]");
    expect(html).toContain("4.307.175 đ");
  });

  it("uses high-contrast, readable budget captions, names and exact VND values", () => {
    expect(openingTag(html, "data-dashboard-budget-caption")).toContain("text-[12px]");
    expect(openingTag(html, "data-dashboard-budget-name")).toContain("text-[13px]");
    const amount = openingTag(html, "data-dashboard-budget-value");
    expect(amount).toContain("text-[13px]");
    expect(amount).not.toContain("#93A4B5");
    expect(html).toContain("4.307.175 đ");
    expect(html).toContain("3.000.000 đ");
  });

  it("renders legible wallet names, full VND amounts and percentages", () => {
    expect(openingTag(html, "data-dashboard-wallet-name")).toContain("text-[13px]");
    expect(openingTag(html, "data-dashboard-wallet-amount")).toContain("text-[13px]");
    const percent = openingTag(html, "data-dashboard-wallet-percent");
    expect(percent).toContain("text-[12px]");
    expect(percent).not.toContain("#94A5B6");
    expect(html).toContain("389.209 đ");
  });

  it("formats axis ticks in VND, rather than rendering unseparated raw Recharts numbers", () => {
    expect(formatCashFlowTickValue(80_000_000)).toBe("80.000.000 đ");
    expect(formatCashFlowTickValue(-40_000_000)).toBe("-40.000.000 đ");
    expect(formatCashFlowTickValue(0)).toBe("0 đ");
  });
});
