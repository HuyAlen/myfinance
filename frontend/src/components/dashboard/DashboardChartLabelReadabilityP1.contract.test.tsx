import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import DashboardVisualOverview from "./DashboardVisualOverview";

const labels = [
  "Nhà ở",
  "Ăn Uống + Sinh Hoạt",
  "Gia Đình Phát Sinh",
  "Con Cái (Sữa + Tã + Phát Sinh)",
  "Đi lại",
];
const amounts = [6_600_000, 5_604_169, 4_464_000, 4_307_175, 1_000_000];
const categories: Category[] = labels.map((name, i) => ({
  id: "category-" + i,
  name,
  type: "expense",
}));
const transactions: Transaction[] = categories.map((category, i) => ({
  id: "expense-" + i,
  type: "expense",
  amount: amounts[i],
  categoryId: category.id,
  walletId: "wallet",
  note: "",
  date: "2026-10-22",
}));

describe("MYFINANCE DASHBOARD MOSAIC LABEL READABILITY P1", () => {
  it("keeps long expense labels readable and currency on its own line instead of clipping or drop-shadowing the text", () => {
    const html = renderToStaticMarkup(React.createElement(DashboardVisualOverview, {
      cashFlowChart: null,
      cashFlowReady: true,
      spendingReady: true,
      budgetReady: true,
      walletsReady: true,
      monthMode: true,
      year: 2026,
      month: 10,
      categories,
      transactions,
      budgetSpending: [],
      wallets: [],
    }));
    const spans = [...html.matchAll(/<span[^>]*data-dashboard-expense-name="true"[^>]*>[^<]+<\/span>/g)].map((match) => match[0]);
    expect(spans).toHaveLength(5);
    expect(spans.some((span) => span.includes("Con Cái (Sữa + Tã + Phát Sinh)"))).toBe(true);
    for (const span of spans) {
      expect(span).toContain("whitespace-normal");
      expect(span).not.toContain("truncate");
      expect(span).not.toContain("drop-shadow");
    }
    const renderedAmounts = [...html.matchAll(/<span[^>]*data-dashboard-expense-amount="true"[^>]*>[^<]+<\/span>/g)];
    expect(renderedAmounts).toHaveLength(5);
    for (const amountSpan of renderedAmounts) {
      expect(amountSpan[0]).toContain("block");
      expect(amountSpan[0]).not.toContain("drop-shadow");
    }
    expect(html).toContain("4.307.175 đ");
  });

  it("draws all Y-axis currency ticks on one SVG line without Recharts auto-wrapping the final đồng sign", () => {
    const source = readFileSync(path.resolve(__dirname, "CashFlowChart.tsx"), "utf8");
    expect(source).toContain("tick={<CashFlowMoneyTick compact={compactAxis} />}");
    expect(source).toContain('textAnchor="end"');
    expect(source).toContain("tickFormatter={(value) => formatVND(Number(value))}");
  });
});
