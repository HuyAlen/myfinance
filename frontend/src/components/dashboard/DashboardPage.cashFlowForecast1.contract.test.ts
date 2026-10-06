import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const intelligence = readFileSync(
  path.resolve(__dirname, "../../lib/dashboard/dashboardIntelligence.ts"),
  "utf8",
);
const forecastEngine = readFileSync(
  path.resolve(__dirname, "../../lib/finance/cashFlowForecast.ts"),
  "utf8",
);

describe("CASHFLOW-FORECAST-1 Dashboard P0 contract", () => {
  it("uses the canonical finance forecast engine instead of Dashboard-local balance math", () => {
    expect(dashboard).toContain('from "@/src/lib/finance/cashFlowForecast"');
    expect(dashboard).toContain("buildCashFlowForecast({");
    expect(dashboard).not.toContain("buildCashRunwayForecast({");
    expect(forecastEngine).toContain("export function buildCashFlowForecast(");
  });

  it("forecasts the requested 7/30/90 horizons from spendable Wallet cash", () => {
    expect(dashboard).toContain("startingBalance: summary.liquidBalance");
    expect(dashboard).toContain("events: recurringOccurrences");
    expect(dashboard).toContain("horizonDays: 90");
    expect(dashboard).toContain("checkpointDays: [7, 30, 90]");
  });

  it("uses one shared local reference date for recurrence expansion and due reminders", () => {
    expect(dashboard).toContain("const recurringReferenceDate = toLocalDateKey(new Date());");
    expect(dashboard).toContain("referenceDate: recurringReferenceDate");
    expect(dashboard).toContain("recurringReferenceDate,\n        90,");
  });

  it("does not certify a forecast before both Wallet snapshot and flow dependencies are ready", () => {
    expect(dashboard).toContain(
      "const cashFlowForecastReady = isDashboardReady && cashFlowReady;",
    );
    expect(dashboard).toContain("!cashFlowForecastReady ? (");
  });

  it("surfaces first-negative-date risk, low point and 7/30/90 scheduled inflow/outflow", () => {
    expect(dashboard).toContain("cashFlowForecast.firstNegativeDate");
    expect(dashboard).toContain("cashFlowForecast.daysUntilNegative");
    expect(dashboard).toContain("cashFlowForecast.lowPointBalance");
    expect(dashboard).toContain("point.scheduledIncome");
    expect(dashboard).toContain("point.scheduledExpense");
    expect(dashboard).toContain('data-cashflow-forecast="true"');
  });

  it("makes excluded recurring schedules visible instead of silently under-forecasting", () => {
    expect(dashboard).toContain("const forecastExcludedRecurringCount = useMemo(");
    expect(dashboard).toContain("schedule.enabled && schedule.issues.length > 0");
    expect(dashboard).toContain("lịch định kỳ chưa đủ cấu hình");
    expect(dashboard).toContain('router.push("/recurring")');
  });

  it("states the evidence boundary instead of inventing Debt, Goal or Saving schedules", () => {
    expect(dashboard).toContain(
      "Khoản nợ, mục tiêu hoặc khoản tiết kiệm chưa có lịch thanh toán không được tự suy đoán.",
    );
    expect(dashboard).not.toContain("debtForecastEvents");
    expect(dashboard).not.toContain("goalForecastEvents");
    expect(dashboard).not.toContain("savingForecastEvents");
  });

  it("keeps older runway and 7/30 helpers as compatibility adapters over the canonical engine", () => {
    expect(intelligence).toContain('import { buildCashFlowForecast } from "@/src/lib/finance/cashFlowForecast";');
    expect(intelligence).toContain("checkpointDays: [7, 30]");
    expect(intelligence).toContain("checkpointDays: [30, 60, 90]");
  });

  it("adds no finance query or persistence path", () => {
    expect(dashboard.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(dashboard.split("getBudgets(").length - 1).toBe(1);
    expect(dashboard.split("getDebts(").length - 1).toBe(1);
    expect(dashboard).not.toContain("saveCashFlowForecast");
    expect(dashboard).not.toContain("cash_flow_forecast");
  });
});