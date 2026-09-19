import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("FOREX-BALANCE-ASOF-1C — Period UI Adoption", () => {
  const page = readFileSync(
    path.resolve(__dirname, "InvestmentsPage.tsx"),
    "utf8",
  ).replace(/\r\n?/g, "\n");
  const date = readFileSync(
    path.resolve(__dirname, "../../lib/date/calendarDate.ts"),
    "utf8",
  ).replace(/\r\n?/g, "\n");

  it("derives the snapshot cutoff from the canonical period end in the finance timezone", () => {
    expect(page).toContain("const { dateRange, filterLabel } = useDateFilter();");
    expect(page).toContain("getEndOfISODateInTimeZone(dateRange.endDate)");
    expect(date).toContain("export function getEndOfISODateInTimeZone(");
    expect(date).toContain('timeZone = "Asia/Ho_Chi_Minh"');
  });

  it("loads Balance history only up to the selected period cutoff and keys the response to that period", () => {
    expect(page).toContain("getForexBalanceSnapshotsUpTo(requestedPeriod.cutoffAt)");
    expect(page).toContain("const periodRequestRef = useRef({");
    expect(page).toContain("periodKey: requestedPeriod.periodKey");
    expect(page).toContain("const periodDataReady = loadedPeriodKey === periodKey;");
  });

  it("prevents an in-flight old-period response from being rendered under a new period label", () => {
    expect(page).toContain("periodRequestRef.current = { cutoffAt: periodCutoffAt, periodKey };");
    expect(page).toContain("const requestedPeriod = periodRequestRef.current;");
    expect(page).toContain("setLoadedPeriodKey(data.periodKey);");
    expect(page).toContain("}, [periodKey, reload]);");
  });

  it("shows only cash transactions whose economic transaction date is inside the selected period", () => {
    expect(page).toContain("const periodTransactions = useMemo(");
    expect(page).toContain("transaction.transactionDate >= dateRange.startDate");
    expect(page).toContain("transaction.transactionDate <= dateRange.endDate");
    expect(page).toContain("periodTransactions.slice(0, 30).map");
    expect(page).toContain("periodTransactions.length} giao dịch · {filterLabel}");
  });

  it("computes Balance and Profit as-of the same end-of-period cutoff using cumulative funding through that date", () => {
    expect(page).toContain("calculateForexPerformanceAsOf({");
    expect(page).toContain("forexCashTransactions: transactions,");
    expect(page).toContain("balanceSnapshots,");
    expect(page).toContain("asOfDate: dateRange.endDate,");
    expect(page).toContain("cutoffAt: periodCutoffAt,");
  });

  it("uses period cashflow for Nạp/Rút cards but as-of performance for Balance/Profit", () => {
    expect(page).toContain("for (const transaction of periodTransactions)");
    expect(page).toContain("deposits: periodCash?.deposits ?? 0");
    expect(page).toContain("withdrawals: periodCash?.withdrawals ?? 0");
    expect(page).toContain("periodBalance: metric?.balance ?? null");
    expect(page).toContain("tradingProfitLoss: metric?.profitLoss ?? null");
    expect(page).toContain('label="Nạp trong kỳ"');
    expect(page).toContain('label="Rút trong kỳ"');
    expect(page).toContain('label="Profit as-of"');
  });

  it("fails closed in the UI when historical Balance is missing", () => {
    expect(page).toContain('data-ui="forex-historical-balance-missing"');
    expect(page).toContain("Chưa có dữ liệu Balance lịch sử");
    expect(page).toContain("Balance tổng và");
    expect(page).toContain("Profit tổng được để trống thay vì suy đoán từ dòng tiền.");
    expect(page).toContain('"Chưa đủ dữ liệu"');
    expect(page).toContain("Không suy đoán Profit khi thiếu Balance lịch sử");
  });

  it("keeps the combined Portfolio headline explicitly current instead of mixing current Portfolio with historical Forex", () => {
    expect(page).toContain('label="Tổng giá trị hiện tại"');
    expect(page).toContain("currentExposure: currentForexPerformance.assetValue");
    expect(page).toContain('note="Portfolio + Forex hiện tại · không theo bộ lọc kỳ"');
  });

  it("keeps realtime refresh on the atomic account/cash write boundaries that also capture snapshots", () => {
    expect(page).toContain(
      '["investments", "forex_accounts", "forex_cash_transactions", "wallets"]',
    );
  });
});
