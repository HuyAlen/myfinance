import { describe, expect, it } from "vitest";
import type { Wallet } from "@/src/types/finance";
import {
  getDashboardWalletVisualRows,
  getDashboardBudgetVisualRows,
  groupDashboardExpenseSlices,
} from "./DashboardVisualOverview";

describe("MYFINANCE DASHBOARD PROFESSIONAL POLISH P1 visual semantics", () => {
  it("uses each positive wallet's share of all positive balances, never relative to the largest wallet", () => {
    const wallets: Wallet[] = [
      { id: "cash", name: "Tiền mặt", type: "cash", balance: 3_000_000 },
      { id: "bank", name: "Ngân hàng", type: "bank", balance: 1_000_000 },
      { id: "debt", name: "Số dư âm", type: "ewallet", balance: -200_000 },
    ];
    const rows = getDashboardWalletVisualRows(wallets);
    expect(rows.map((row) => ({ id: row.id, balance: row.balance, sharePercent: row.sharePercent })))
      .toEqual([
        { id: "cash", balance: 3_000_000, sharePercent: 75 },
        { id: "bank", balance: 1_000_000, sharePercent: 25 },
      ]);
  });

  it("returns no bogus percentage for zero, empty or invalid wallet amounts", () => {
    const rows = getDashboardWalletVisualRows([
      { id: "zero", name: "Zero", type: "cash", balance: 0 },
      { id: "invalid", name: "Invalid", type: "ewallet", balance: Number.NaN },
      { id: "negative", name: "Negative", type: "bank", balance: -1 },
    ]);
    expect(rows).toEqual([]);
  });

  it("keeps budget overage honest while capping only its visual bar", () => {
    const rows = getDashboardBudgetVisualRows([
      {
        budgetId: "food", categoryId: "food", month: "2026-10", limit: 1_000_000,
        spent: 4_460_000, remaining: -3_460_000, usagePercent: 446,
        isOverBudget: true, overAmount: 3_460_000, status: "over",
      },
      {
        budgetId: "home", categoryId: "home", month: "2026-10", limit: 5_000_000,
        spent: 4_250_000, remaining: 750_000, usagePercent: 85,
        isOverBudget: false, overAmount: 0, status: "near",
      },
    ], [
      { id: "food", name: "Ăn uống", type: "expense" },
      { id: "home", name: "Nhà ở", type: "expense" },
    ]);
    expect(rows.map((row) => ({ percent: row.percent, fillPercent: row.fillPercent })))
      .toEqual([{ percent: 446, fillPercent: 100 }, { percent: 85, fillPercent: 85 }]);
  });

  it("preserves every observed expense cent when grouping a long-tail donut", () => {
    const items = [
      { name: "1", value: 400 },
      { name: "2", value: 300 },
      { name: "3", value: 200 },
      { name: "4", value: 100 },
      { name: "5", value: 90 },
      { name: "6", value: 10 },
    ];
    const grouped = groupDashboardExpenseSlices(items);
    expect(grouped).toEqual([
      ...items.slice(0, 4),
      { name: "Danh mục khác", value: 100 },
    ]);
  });
});
