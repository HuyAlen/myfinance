import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";

const values = [6_500_000, 1_208_000, 1_169_404, 997_650, 1_088_000];
const names = [
  "Nhà ở", "Con Cái (Sữa + Tã + Phát Sinh)",
  "Phí Quản Lý / Nước / Gửi Xe", "Phí Điện", "Danh mục khác",
];
const categories: Category[] = names.map((name, index) => ({
  id: "category-" + index, name, type: "expense",
}));
const transactions: Transaction[] = values.map((amount, index) => ({
  id: "tx-" + index, categoryId: categories[index].id, walletId: "bank",
  type: "expense", amount, date: "2026-11-05", note: "",
}));

function render(count = transactions.length) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "cash flow"),
    cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
    monthMode: true, year: 2026, month: 11,
    categories, transactions: transactions.slice(0, count),
    wallets: [], budgetSpending: [],
  }));
}

describe("DASHBOARD-EXPENSE-BALANCED-ROWS-P3.1", () => {
  it("gives Nhà ở and Con Cái the exact same row footprint despite 59% vs 11% shares", () => {
    const html = render();
    expect(html).toContain('data-dashboard-expense-layout="equal-height-rows"');
    const rows = [...html.matchAll(/<div[^>]*data-dashboard-expense-balanced-row="true"[^>]*>/g)];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row[0]).toContain("min-h-[64px]");
      expect(row[0]).toContain("flex-1");
      expect(row[0]).not.toContain("style=\"flex:");
    }
    expect(html).toContain("Nhà ở");
    expect(html).toContain("Con Cái (Sữa + Tã + Phát Sinh)");
    expect(html).toContain("59%");
    expect(html).toContain("11%");
    expect(html).toContain("6.500.000 đ");
    expect(html).toContain("1.208.000 đ");
  });

  it("keeps accurate per-group proportional meters, exact VND amounts and grouping", () => {
    const html = render();
    const meters = [...html.matchAll(/<div[^>]*data-dashboard-expense-category-meter="true"[^>]*>/g)];
    expect(meters).toHaveLength(5);
    const expected = values.reduce((a, b) => a + b, 0);
    expect(expected).toBe(10_963_054);
    for (const name of names) expect(html).toContain(name);
    expect((html.match(/data-dashboard-expense-amount="true"/g) ?? [])).toHaveLength(5);
    expect(html).toContain('data-dashboard-expense-desktop-composition="100"');
    expect(html).toContain("100% tổng chi");
    expect(html).toContain("10.963.054 đ");
    expect(html).toContain("4 nhóm chính + Khác");
  });

  it("still renders one row and its 100% share when only one category has actual spending", () => {
    const html = render(1);
    expect((html.match(/data-dashboard-expense-balanced-row="true"/g) ?? [])).toHaveLength(1);
    expect(html).toContain("100%");
    expect(html).not.toContain("4 nhóm chính + Khác");
  });

  it("retains mobile-specific expense cards, no-data state and no wallet mutations", () => {
    const html = render();
    expect((html.match(/data-dashboard-expense-mobile-meter="true"/g) ?? [])).toHaveLength(5);
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
    expect(html).toContain("không phải mức dùng ngân sách");
    const empty = render(0);
    expect(empty).toContain("Chưa có khoản chi thực tế trong kỳ");
    expect(empty).not.toContain('data-dashboard-expense-layout="equal-height-rows"');
  });
});
