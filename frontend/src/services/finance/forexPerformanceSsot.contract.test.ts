import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FOREX-PERFORMANCE-SSOT-1 — cross-page contract.
 *
 * Locks one source of truth for Balance, Profit, fees and current-asset
 * semantics so Investments, Dashboard and the balance sheet cannot drift.
 */
describe("FOREX-PERFORMANCE-SSOT-1", () => {
  const finance = readFileSync(
    path.resolve(__dirname, "financeCalculations.ts"),
    "utf8",
  );
  const normalizedFinance = finance.replace(/\s+/g, " ");
  const investments = readFileSync(
    path.resolve(__dirname, "../../components/investments/InvestmentsPage.tsx"),
    "utf8",
  );
  const dashboard = readFileSync(
    path.resolve(__dirname, "../../components/dashboard/DashboardPage.tsx"),
    "utf8",
  );

  it("owns Balance, Profit, ROI, fee and archived semantics in one calculator", () => {
    expect(finance).toContain("export function calculateForexPerformanceSnapshot(");
    expect(finance).toContain('const isCurrent = status !== "archived";');
    expect(normalizedFinance).toContain("const profitLoss = balance === null ? null : balance - netFunding;");
    expect(finance).toContain("const walletCashImpact = netFunding + fees;");
    expect(finance).toContain("balance ?? Math.max(0, netFunding)");
    expect(finance).toContain("accountsWithKnownBalance.reduce(");
  });

  it("keeps transfer fees outside trading Profit and investment allocation", () => {
    expect(finance).toContain("const forexFees = getForexFeesFromLedger(");
    expect(normalizedFinance).toContain("realExpenses.reduce((sum, item) => sum + item.amount, 0) + forexFees");
    expect(finance).toContain('transaction.type === "deposit" ? amount : -amount');
    expect(finance).not.toContain("return sum + amount + fee");
    expect(finance).not.toContain("return sum - Math.max(0, amount - fee)");
  });

  it("makes Investments consume the canonical snapshot instead of re-deriving Profit", () => {
    expect(investments).toContain("calculateForexPerformanceSnapshot(accounts, transactions)");
    expect(investments).toContain("tradingProfitLoss: metric?.profitLoss ?? null");
    expect(investments).toContain("currentExposure: forexPerformance.assetValue");
    expect(investments).not.toContain("account.currentEquity - deposits + withdrawals");
  });

  it("makes Dashboard consume the same canonical snapshot", () => {
    expect(dashboard).toContain("calculateForexPerformanceSnapshot(");
    expect(dashboard).toContain("assetValue: snapshot.assetValue");
    expect(dashboard).toContain("profitLoss: snapshot.profitLoss");
    expect(dashboard).toContain("roi: snapshot.roi");
    expect(dashboard).not.toContain("currentEquity - netCapital");
    expect(dashboard).not.toContain("getForexNetCapital(forexCashTransactions)");
  });
});
