import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, relativePath), "utf8");

describe("CASH-MOVEMENT-SSOT-1 cross-page adoption", () => {
  it("keeps Budget/realExpense semantics intact while exposing parallel liquidity fields", () => {
    const finance = read("financeCalculations.ts");
    expect(finance).toContain("realExpense: number;");
    expect(finance).toContain("netCashFlow: number;");
    expect(finance).toContain("cashIn: number;");
    expect(finance).toContain("cashOut: number;");
    expect(finance).toContain("netCashMovement: number;");
    const normalizedFinance = finance.replace(/\s+/g, " ");
    expect(normalizedFinance).toContain(
      "const realExpense = realExpenses.reduce((sum, item) => sum + item.amount, 0) + forexFees;",
    );
    expect(finance).toContain("const cashOut = ordinaryCashOut + savingCashOut + forexCashOut;");
    expect(finance).toContain("// ─── Canonical Budget Spending Engine");
  });

  it("Dashboard renders cash movement without routing the metric to Transactions only", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    expect(dashboard).toContain("const periodCashMovement = useMemo(");
    expect(dashboard).toContain("const cashMovementReady = cashFlowReady && savingInvestmentReady;");
    expect(dashboard).toContain('label="Thu vào"');
    expect(dashboard).toContain('label="Chi ra"');
    expect(dashboard).toContain("netCashMovement: item.netCashMovement");
    expect(dashboard).toContain("href: undefined as string | undefined");
  });

  it("CashFlowChart uses explicit liquidity keys", () => {
    const chart = read("../../components/dashboard/CashFlowChart.tsx");
    expect(chart).toContain('dataKey="cashIn"');
    expect(chart).toContain('dataKey="cashOut"');
    expect(chart).toContain('dataKey="netCashMovement"');
    expect(chart).not.toContain('dataKey="thu"');
    expect(chart).not.toContain('dataKey="chi"');
  });

  it("Reports cash-flow tab and comparisons consume canonical cash movement", () => {
    const reports = read("../../components/reports/ReportsPage.tsx");
    expect(reports).toContain("const cashIn = flow.cashIn;");
    expect(reports).toContain("const cashOut = flow.cashOut;");
    expect(reports).toContain("const netCashMovement = flow.netCashMovement;");
    expect(reports).toContain('dataKey="cashIn"');
    expect(reports).toContain('dataKey="cashOut"');
    expect(reports).toContain("curMonthFlow.netCashMovement");
    expect(reports).toContain("previousEquivalentFlow.netCashMovement");
  });

  it("preserves Savings wallet identity across Dashboard and Reports", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    const reports = read("../../components/reports/ReportsPage.tsx");

    expect(dashboard).toContain("walletId: row.wallet_id");
    expect(dashboard).toContain("wallet_id");
    expect(reports).toContain("walletId: row.wallet_id");
    expect(reports).toContain("wallet_id");
  });});
