import { describe, expect, it } from "vitest";
import { buildCashFlowForecast } from "./cashFlowForecast";

describe("CASHFLOW-FORECAST-1 canonical engine", () => {
  it("projects evidence-backed balances at 7/30/90 days", () => {
    const result = buildCashFlowForecast({
      startingBalance: 10_000_000,
      today: "2026-10-01",
      events: [
        { id: "rent", type: "expense", amount: 2_000_000, date: "2026-10-05" },
        { id: "salary", type: "income", amount: 5_000_000, date: "2026-10-20" },
        { id: "insurance", type: "expense", amount: 8_000_000, date: "2026-11-10" },
        { id: "bill", type: "expense", amount: 2_000_000, date: "2026-12-15" },
      ],
    });

    expect(result.checkpoints.map((point) => point.days)).toEqual([7, 30, 90]);
    expect(result.checkpoints.map((point) => point.projectedBalance)).toEqual([
      8_000_000,
      13_000_000,
      3_000_000,
    ]);
    expect(result.scheduledIncome).toBe(5_000_000);
    expect(result.scheduledExpense).toBe(12_000_000);
    expect(result.netScheduled).toBe(-7_000_000);
  });

  it("detects the first evidence-backed negative-liquidity date even if cash later recovers", () => {
    const result = buildCashFlowForecast({
      startingBalance: 1_000_000,
      today: "2026-10-01",
      events: [
        { id: "bill", type: "expense", amount: 1_500_000, date: "2026-10-04" },
        { id: "salary", type: "income", amount: 3_000_000, date: "2026-10-10" },
      ],
    });

    expect(result.firstNegativeDate).toBe("2026-10-04");
    expect(result.daysUntilNegative).toBe(3);
    expect(result.lowPointBalance).toBe(-500_000);
    expect(result.lowPointDate).toBe("2026-10-04");
    expect(result.checkpoints[1].projectedBalance).toBe(2_500_000);
  });

  it("aggregates same-day cash events before evaluating liquidity risk", () => {
    const result = buildCashFlowForecast({
      startingBalance: 100_000,
      today: "2026-10-01",
      events: [
        { id: "expense-first", type: "expense", amount: 500_000, date: "2026-10-03" },
        { id: "income-second", type: "income", amount: 500_000, date: "2026-10-03" },
      ],
    });

    expect(result.firstNegativeDate).toBeNull();
    expect(result.lowPointBalance).toBe(100_000);
    expect(result.dailyPath).toHaveLength(1);
    expect(result.dailyPath[0]).toMatchObject({
      scheduledIncome: 500_000,
      scheduledExpense: 500_000,
      projectedBalance: 100_000,
      eventCount: 2,
    });
  });

  it("includes the 90-day boundary and excludes later events", () => {
    const result = buildCashFlowForecast({
      startingBalance: 2_000_000,
      today: "2026-10-01",
      events: [
        { id: "day-90", type: "expense", amount: 500_000, date: "2026-12-30" },
        { id: "day-91", type: "expense", amount: 900_000, date: "2026-12-31" },
      ],
    });

    expect(result.eventCount).toBe(1);
    expect(result.checkpoints.at(-1)?.projectedBalance).toBe(1_500_000);
  });

  it("ignores invalid or zero-value evidence instead of fabricating movement", () => {
    const result = buildCashFlowForecast({
      startingBalance: 2_000_000,
      today: "2026-10-01",
      events: [
        { id: "invalid-date", type: "expense", amount: 100_000, date: "not-a-date" },
        { id: "zero", type: "expense", amount: 0, date: "2026-10-02" },
        { id: "nan", type: "income", amount: Number.NaN, date: "2026-10-03" },
      ],
    });

    expect(result.eventCount).toBe(0);
    expect(result.netScheduled).toBe(0);
    expect(result.checkpoints.every((point) => point.projectedBalance === 2_000_000)).toBe(true);
  });

  it("reports an already-negative opening balance as risk today", () => {
    const result = buildCashFlowForecast({
      startingBalance: -250_000,
      today: "2026-10-01",
      events: [],
    });

    expect(result.firstNegativeDate).toBe("2026-10-01");
    expect(result.daysUntilNegative).toBe(0);
    expect(result.lowPointBalance).toBe(-250_000);
  });

  it("supports compatibility checkpoints without changing the canonical default", () => {
    const result = buildCashFlowForecast({
      startingBalance: 1_000_000,
      today: "2026-10-01",
      events: [],
      checkpointDays: [30, 60, 90],
    });

    expect(result.checkpoints.map((point) => point.days)).toEqual([30, 60, 90]);
  });
});