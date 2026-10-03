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
    expect(finance).toContain("operatingCashIn: number;");
    expect(finance).toContain("operatingCashOut: number;");
    expect(finance).toContain("operatingNetCashFlow: number;");
    expect(finance).toContain("capitalMovementIn: number;");
    expect(finance).toContain("capitalMovementOut: number;");
    expect(finance).toContain("netCapitalMovement: number;");
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

  it("Dashboard shows operating cash flow and separates capital movement", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    expect(dashboard).toContain("const periodOperatingCashFlow = useMemo(");
    expect(dashboard).toContain("const periodCapitalMovement = useMemo(");
    expect(dashboard).toContain("cashIn: item.operatingCashIn");
    expect(dashboard).toContain("cashOut: item.operatingCashOut");
    expect(dashboard).toContain("netCashMovement: item.operatingNetCashFlow");
    expect(dashboard).toContain("Dịch chuyển tài sản");
    expect(dashboard).toContain("Không tính vào Thu vào / Chi ra");
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

  it("Reports cash-flow UI uses operating flow and exposes capital movement separately", () => {
    const reports = read("../../components/reports/ReportsPage.tsx");
    expect(reports).toContain("const operatingCashIn = flow.operatingCashIn;");
    expect(reports).toContain("const operatingCashOut = flow.operatingCashOut;");
    expect(reports).toContain("const operatingNetCashFlow = flow.operatingNetCashFlow;");
    expect(reports).toContain('dataKey="operatingCashIn"');
    expect(reports).toContain('dataKey="operatingCashOut"');
    expect(reports).toContain("curMonthFlow.operatingNetCashFlow");
    expect(reports).toContain("previousEquivalentFlow.operatingNetCashFlow");
    expect(reports).toContain("Dịch chuyển tài sản");
    expect(reports).toContain("capitalMovementInRaw");
    expect(reports).toContain("capitalMovementOutRaw");
  });

  it("preserves Savings wallet identity across Dashboard and Reports", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    const reports = read("../../components/reports/ReportsPage.tsx");

    expect(dashboard).toContain("walletId: row.wallet_id");
    expect(dashboard).toContain("wallet_id");
    expect(reports).toContain("walletId: row.wallet_id");
    expect(reports).toContain("wallet_id");
  });});
