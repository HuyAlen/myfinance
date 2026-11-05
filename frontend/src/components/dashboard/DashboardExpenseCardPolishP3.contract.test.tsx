import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";

const amounts = [6_500_000, 1_208_000, 1_169_404, 997_650, 1_088_000];
const names = [
  "Nhà ở",
  "Con Cái (Sữa + Tã + Phát Sinh)",
  "Phí Quản Lý / Nước / Gửi Xe",
  "Phí Điện",
  "Danh mục khác",
];
const categories: Category[] = names.map((name, index) => ({
  id: "c" + index,
  name,
  type: "expense",
}));
const transactions: Transaction[] = amounts.map((amount, index) => ({
  id: "tx" + index,
  type: "expense",
  categoryId: categories[index].id,
  amount,
  walletId: "bank",
  note: "",
  date: "2026-11-05",
}));
function render(count = transactions.length) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "observed cash flow"),
    cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
    monthMode: true, year: 2026, month: 11,
    categories, transactions: transactions.slice(0, count),
    budgetSpending: [], wallets: [],
  }));
}

describe("DASHBOARD-EXPENSE-CATEGORY-UI-POLISH-P3", () => {
  it("makes actual spend and largest observed category easier to scan", () => {
    const html = render();
    expect(html).toContain('data-dashboard-expense-summary="true"');
    expect(html).toContain('data-dashboard-expense-total="true"');
    expect(html).toContain("10.963.054 đ");
    expect(html).toContain('data-dashboard-expense-primary="true"');
    expect(html).toContain("Chi nhiều nhất:");
    expect(html).toContain("Nhà ở");
    expect(html).toContain("59% tổng chi");
    expect(html).toContain("5 nhóm chi tiêu");
    expect(html).toContain("Tỷ trọng trong tổng chi");
  });

  it("renders one data-derived desktop 100% rail with the same five identities", () => {
    const html = render();
    expect(html).toContain('data-dashboard-expense-desktop-guide="true"');
    expect(html).toContain('data-dashboard-expense-desktop-composition="100"');
    const segments = [...html.matchAll(/<span[^>]*data-dashboard-expense-desktop-segment="true"[^>]*>/g)];
    expect(segments).toHaveLength(5);
    const widths = segments.map((m) => Number(/width:([0-9.]+)%/.exec(m[0])?.[1]));
    expect(widths.every(Number.isFinite)).toBe(true);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 5);
    expect(html).toContain('data-dashboard-expense-composition="100"');
    expect(html).toContain("không phải mức dùng ngân sách");
  });

  it("preserves exact tile area, amounts, long Vietnamese labels and readable mobile rows", () => {
    const html = render();
    expect(html).toContain('data-dashboard-expense-mosaic="stretch"');
    expect((html.match(/data-dashboard-expense-tile="true"/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-dashboard-expense-amount="true"/g) ?? [])).toHaveLength(5);
    expect(html).toContain("Con Cái (Sữa + Tã + Phát Sinh)");
    expect(html).toContain("6.500.000 đ");
    expect(html).toContain("1.169.404 đ");
    expect(html).toContain("997.650 đ");
    expect(html).toContain("1.088.000 đ");
    expect(html).toContain('data-dashboard-expense-dominant="true"');
    expect(html).toContain('data-dashboard-expense-dominant-meter="true"');
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
    expect((html.match(/data-dashboard-expense-mobile-meter="true"/g) ?? [])).toHaveLength(5);
  });

  it("preserves the no-actual-expense empty state without a fabricated dominant group", () => {
    const html = render(0);
    expect(html).toContain("Chưa có khoản chi thực tế trong kỳ");
    expect(html).not.toContain('data-dashboard-expense-total="true"');
    expect(html).not.toContain('data-dashboard-expense-desktop-composition="100"');
    expect(html).not.toContain('data-dashboard-expense-dominant-meter="true"');
  });

  it("adds dark-mode contrast without touching cash-flow colours or budget data", () => {
    const css = readFileSync(
      path.resolve(__dirname, "../../../app/dashboard-professional-polish.css"),
      "utf8",
    );
    expect(css).toContain('[data-dashboard-expense-summary="true"]');
    expect(css).toContain('[data-dashboard-expense-desktop-guide="true"]');
    const code = readFileSync(path.resolve(__dirname, "DashboardVisualOverview.tsx"), "utf8");
    expect(code).toContain("getDashboardExpenseMosaicColumns(expenses)");
    expect(code).toContain("buildCategorySpendingData(transactions, categories)");
    expect(code).toContain("data-dashboard-expense-amount");
    expect(code).not.toContain("Math.random()");
  });
});
