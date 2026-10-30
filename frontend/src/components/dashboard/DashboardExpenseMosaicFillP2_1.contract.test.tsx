import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";
import { getDashboardExpenseMosaicColumns } from "./DashboardVisualMetrics";

const amounts = [7_224_900, 6_876_750, 6_500_000, 5_092_425, 6_713_423];
const names = [
  "Gia Đình Phát Sinh", "Ăn Uống + Sinh Hoạt", "Nhà ở",
  "Con Cái (Sữa + Tã + Phát Sinh)", "Danh mục khác",
];
const categories: Category[] = names.map((name, index) => ({
  id: "category-" + index, name, type: "expense",
}));
const transactions: Transaction[] = categories.map((category, index) => ({
  id: "tx-" + index,
  type: "expense",
  categoryId: category.id,
  amount: amounts[index],
  walletId: "wallet",
  date: "2026-10-15",
  note: "",
}));

function render(count: number) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "real cash flow chart"),
    cashFlowReady: true,
    spendingReady: true,
    budgetReady: true,
    walletsReady: true,
    monthMode: true,
    year: 2026,
    month: 10,
    categories,
    transactions: transactions.slice(0, count),
    budgetSpending: [],
    wallets: [],
  }));
}

function getMosaicOpeningTag(html: string) {
  const marker = 'data-dashboard-expense-mosaic="stretch"';
  const index = html.indexOf(marker);
  expect(index).toBeGreaterThan(0);
  return html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);
}

describe("MYFINANCE DASHBOARD EXPENSE MOSAIC FILL P2.1", () => {
  it("stretches the desktop treemap with the adjacent cash-flow card instead of fixing its height", () => {
    const html = render(5);
    const opening = getMosaicOpeningTag(html);
    expect(opening).toContain("sm:flex");
    expect(opening).toContain("sm:flex-1");
    expect(opening).toContain("sm:min-h-[400px]");
    expect(opening).not.toContain("sm:h-[268px]");
    expect(opening).not.toContain("h-[252px]");
    expect(html).toContain('data-dashboard-visual-chart="cash-flow"');
  });

  it("keeps a shorter responsive minimum when there are only two categories", () => {
    const opening = getMosaicOpeningTag(render(2));
    expect(opening).toContain("sm:flex-1");
    expect(opening).toContain("sm:min-h-[280px]");
    expect(opening).not.toContain("sm:min-h-[400px]");
  });

  it("keeps the full amount and label for the previously clipped Con Cái tile", () => {
    const html = render(5);
    expect(html).toContain("Con Cái (Sữa + Tã + Phát Sinh)");
    expect(html).toContain("5.092.425 đ");
    expect((html.match(/data-dashboard-expense-tile="true"/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-dashboard-expense-amount="true"/g) ?? [])).toHaveLength(5);
  });

  it("keeps category proportions data driven; only visual height and spacing change", () => {
    const columns = getDashboardExpenseMosaicColumns(names.map((name, index) => ({
      name, value: amounts[index],
    })));
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    expect(columns.flatMap((column) => column.tiles).reduce((sum, item) => sum + item.value, 0)).toBe(total);
    expect(columns.flatMap((column) => column.tiles).every((item) => item.sharePercent > 0)).toBe(true);
    const html = render(5);
    expect(html).toContain("32.407.498 đ");
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
  });

  it("retains the existing accessible treemap and mobile-only breakdown", () => {
    const html = render(5);
    expect(getMosaicOpeningTag(html)).toContain('role="img"');
    expect(getMosaicOpeningTag(html)).toContain("Cơ cấu chi tiêu");
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Chi tiêu theo danh mục"');
  });
});
