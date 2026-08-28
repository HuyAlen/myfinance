import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(path.resolve(__dirname, relative), "utf8");
}

describe("ANALYTICS-SNAPSHOT-SSOT-1 cross-page adoption", () => {
  it("Dashboard summary delegates its current-state balance sheet to the same canonical snapshot", () => {
    const value = source("financeCalculations.ts");
    const start = value.indexOf("export function calculateDashboardSummary");
    const end = value.indexOf("export interface CategorySpending", start);
    const block = value.slice(start, end);
    expect(block).toContain("calculateBalanceSheetSnapshot({");
    expect(block).toContain("netWorthBreakdown.liquidAssets");
    expect(block).toContain("debtRatio: netWorthBreakdown.debtRatio");
  });

  it("DebtsPage derives debt/assets from the full canonical balance sheet and reloads every asset dependency", () => {
    const value = source("../../components/debts/DebtsPage.tsx");
    expect(value).toContain("calculateBalanceSheetSnapshot({");
    for (const read of [
      "getWallets()",
      "getSavings()",
      "getInvestments()",
      "getForexAccounts()",
      "getForexCashTransactions()",
      "getDebts()",
    ]) {
      expect(value).toContain(read);
    }
    expect(value).toContain("setTotalAssets(balanceSheet.totalAssets)");
    for (const table of [
      "wallets",
      "savings",
      "investments",
      "forex_accounts",
      "forex_cash_transactions",
      "debts",
    ]) {
      expect(value).toContain(`\"${table}\"`);
    }
  });

  it("Reports shares one full balance sheet with summary, Health, Risk, Forecast and asset allocation", () => {
    const value = source("../../components/reports/ReportsPage.tsx");
    expect(value).toContain("const balanceSheet = useMemo(");
    expect(value).toContain("calculateBalanceSheetSnapshot({");
    expect(value).toContain("forexAccounts,");
    expect(value).toContain("forexCashTransactions,");
    expect(value).toContain("balanceSheet.debtRatio");
    expect(value).toContain("balanceSheet.forex");
    expect(value).toContain("computeHealthScoreV2(");
    expect(value).toContain("computeRiskScore(");
    expect(value).toContain("computeFinancialForecast(");
  });

  it("AI Insights loads Forex as first-class advisor dependencies and subscribes their realtime tables", () => {
    const value = source("../../components/ai-insights/AIInsightsPage.tsx");
    expect(value).toContain('getForexAccounts(), "forex-accounts"');
    expect(value).toContain("getForexCashTransactions()");
    expect(value).toContain("forexAccounts,");
    expect(value).toContain("forexCashTransactions,");
    expect(value).toContain('"forex_accounts"');
    expect(value).toContain('"forex_cash_transactions"');
  });

  it("advisor analytics forwards the same Forex/Savings balance sheet into FIRE, Forecast, Health and Risk", () => {
    const value = source("analytics/aiAdvisorEngine.ts");
    expect(value).toContain("calculateBalanceSheetSnapshot({");
    expect(value).toContain("forexAccounts = []");
    expect(value).toContain("forexCashTransactions = []");
    expect(value).toContain("balanceSheet.forex");
    expect(value).toContain("computeFireAnalysis(");
    expect(value).toContain("computeFinancialForecast(");
    expect(value).toContain("computeHealthScoreV2(");
    expect(value).toContain("computeRiskScore(");
  });

  it("server AI context and read tools include Savings + Forex instead of a wallet/investment/debt-only net worth", () => {
    const server = source("ai-agent/server/aiFinanceContext.server.ts");
    const tools = source("ai-agent/tools/read/financeReadTools.server.ts");

    for (const value of [server, tools]) {
      expect(value).toContain("calculateBalanceSheetSnapshot({");
      expect(value).toContain('"savings"');
      expect(value).toContain('"forex_accounts"');
      expect(value).toContain('"forex_cash_transactions"');
    }
    expect(tools).toContain("savingsAssets");
    expect(tools).toContain("forexAssets");
  });
});
