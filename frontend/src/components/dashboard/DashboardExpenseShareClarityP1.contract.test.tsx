import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview, { groupDashboardExpenseSlices } from "./DashboardVisualOverview";

const amounts = [7_954_900, 7_156_050, 6_500_000, 5_092_425, 4_000_000, 2_713_423];
const names = [
  "Gia Đình Phát Sinh", "Ăn Uống + Sinh Hoạt", "Nhà ở",
  "Con Cái (Sữa + Tã + Phát Sinh)", "Mua sắm", "Đi lại",
];
const categories: Category[] = names.map((name, i) => ({
  id: "category-" + i, name, type: "expense",
}));
const transactions: Transaction[] = amounts.map((amount, i) => ({
  id: "tx-" + i, type: "expense", categoryId: categories[i].id,
  walletId: "wallet", amount, date: "2026-10-20", note: "",
}));

function render(count = transactions.length) {
  return renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
    cashFlowChart: React.createElement("span", null, "Cash flow"),
    cashFlowReady: true, spendingReady: true, budgetReady: true, walletsReady: true,
    monthMode: true, year: 2026, month: 10, categories,
    transactions: transactions.slice(0, count),
    budgetSpending: [], wallets: [],
  }));
}

describe("MYFINANCE EXPENSE SHARE CLARITY P1", () => {
  it("explains shares as fractions of total spend, not budget utilization", () => {
    const html = render();
    expect(html).toContain("Tỷ trọng trong tổng chi");
    expect(html).toContain("Cơ cấu tổng chi");
    expect(html).toContain("không phải mức dùng ngân sách");
    expect(html).toContain('data-dashboard-expense-composition="100"');
    expect(html).toContain('role="img"');
    expect(html).toContain("100%");
  });

  it("renders a complete real-data 100% stacked bar with consistent category markers", () => {
    const html = render();
    expect((html.match(/data-dashboard-expense-composition-segment="true"/g) ?? [])).toHaveLength(5);
    expect((html.match(/data-dashboard-expense-share-row="true"/g) ?? [])).toHaveLength(5);
    expect(html).toContain("33.416.798 đ");
    expect(html).toContain("7.954.900 đ");
    expect(html).toContain("6.713.423 đ");
    expect(html).toContain('data-dashboard-mobile-expense-percent="true"');
    expect(html).not.toContain('aria-label="Giới hạn ngân sách"');
    for (const pct of [24, 21, 19, 15, 20]) {
      expect(html).toContain(">" + pct + "%</strong>");
    }
  });

  it("names the aggregated fifth slice honestly rather than implying five separate categories", () => {
    const html = render();
    expect(html).toContain("4 nhóm chính + Khác");
    expect(html).toContain("Gộp 2 danh mục còn lại");
    const grouped = groupDashboardExpenseSlices(amounts.map((value, i) => ({ name: names[i], value })));
    expect(grouped.at(-1)).toEqual({
      name: "Danh mục khác",
      value: 6_713_423,
      aggregateCount: 2,
    });
    expect(grouped.reduce((sum, item) => sum + item.value, 0)).toBe(33_416_798);
  });

  it("does not invent an 'other' group or an expense percentage for <=4 source categories", () => {
    const html = render(4);
    expect(html).toContain("4 nhóm chi tiêu");
    expect(html).not.toContain("Gộp 2 danh mục còn lại");
    expect((html.match(/data-dashboard-expense-composition-segment="true"/g) ?? [])).toHaveLength(4);
    expect(render(0)).toContain("Chưa có khoản chi thực tế trong kỳ");
    expect(render(0)).not.toContain('data-dashboard-expense-composition="100"');
  });

  it("preserves semantic list, full VND and honest proportional bars, with rounding disclosure", () => {
    const html = render();
    expect(html).toContain('data-dashboard-mobile-expense-list="true"');
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
    expect(html).toContain("Tỷ lệ hiển thị được làm tròn đến số nguyên");
    expect(html).toContain('aria-label="Cơ cấu 100% tổng chi:');
    expect(html).toContain('data-dashboard-expense-mosaic="stretch"');
  });
});
