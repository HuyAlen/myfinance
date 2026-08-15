import { describe, expect, it } from "vitest";
import {
  buildDashboardComparison,
  isComparisonWindowLoaded,
  resolveMonthComparisonWindow,
} from "./dashboardPeriodComparison";

describe("resolveMonthComparisonWindow", () => {
  it("historical completed month (§49): full selected month vs full previous month", () => {
    // Selected July 2026, viewed from August 2026 — July has fully elapsed.
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      "2026-08-15",
    );

    expect(result.isComplete).toBe(true);
    expect(result.current).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
    expect(result.previous).toEqual({ startDate: "2026-06-01", endDate: "2026-06-30" });
  });

  it("current ongoing partial month (§48): matched elapsed windows, not full-vs-full", () => {
    // Today is August 15 — August is the selected, still-ongoing month.
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-08-01", endDate: "2026-08-31" },
      "2026-08-15",
    );

    expect(result.isComplete).toBe(false);
    expect(result.current).toEqual({ startDate: "2026-08-01", endDate: "2026-08-15" });
    expect(result.previous).toEqual({ startDate: "2026-07-01", endDate: "2026-07-15" });
  });

  it("month-length mismatch (§50): elapsed day is safely clamped to the previous month's own last day", () => {
    // Today is March 30 (still ongoing — the 31st hasn't happened yet).
    // Previous month February only has 28 days (2026 is not a leap year).
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-03-01", endDate: "2026-03-31" },
      "2026-03-30",
    );

    expect(result.isComplete).toBe(false);
    expect(result.current).toEqual({ startDate: "2026-03-01", endDate: "2026-03-30" });
    // Elapsed day 30 must clamp to Feb 28, never fabricate "2026-02-30".
    expect(result.previous).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  it("today exactly on the selected month's last day is treated as complete (full vs full), not an elapsed clamp", () => {
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-03-01", endDate: "2026-03-31" },
      "2026-03-31",
    );

    expect(result.isComplete).toBe(true);
    expect(result.previous).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  it("leap year (§51): previous February correctly gets 29 days", () => {
    // 2028 is a leap year. Selected March 2028, fully elapsed (viewed from April).
    const result = resolveMonthComparisonWindow(
      { startDate: "2028-03-01", endDate: "2028-03-31" },
      "2028-04-10",
    );

    expect(result.previous).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });

  it("January rolls back to December of the PRIOR year (calendar boundary)", () => {
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-01-01", endDate: "2026-01-31" },
      "2026-02-10",
    );

    expect(result.previous).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });

  it("ongoing January: elapsed window rolls back into the prior December", () => {
    const result = resolveMonthComparisonWindow(
      { startDate: "2026-01-01", endDate: "2026-01-31" },
      "2026-01-10",
    );

    expect(result.isComplete).toBe(false);
    expect(result.current).toEqual({ startDate: "2026-01-01", endDate: "2026-01-10" });
    expect(result.previous).toEqual({ startDate: "2025-12-01", endDate: "2025-12-10" });
  });

  it("throws on a non-month-start startDate — this resolver is scoped to month-mode ranges only", () => {
    expect(() =>
      resolveMonthComparisonWindow(
        { startDate: "2026-08-05", endDate: "2026-08-31" },
        "2026-08-15",
      ),
    ).toThrow();
  });
});

describe("isComparisonWindowLoaded", () => {
  it("cross-year example (§47): January's previous December is NOT loaded when only the current year was fetched", () => {
    const previous = { startDate: "2025-12-01", endDate: "2025-12-31" };
    // DashboardPage's getDashboardFetchRange(2026) when currentYear is also
    // 2026 yields loadedRangeStartDate = "2026-01-01".
    expect(isComparisonWindowLoaded(previous, "2026-01-01")).toBe(false);
  });

  it("same-year previous month is loaded", () => {
    const previous = { startDate: "2026-07-01", endDate: "2026-07-31" };
    expect(isComparisonWindowLoaded(previous, "2026-01-01")).toBe(true);
  });

  it("boundary: previous month starting exactly on the loaded range start is loaded", () => {
    const previous = { startDate: "2026-01-01", endDate: "2026-01-31" };
    expect(isComparisonWindowLoaded(previous, "2026-01-01")).toBe(true);
  });
});

describe("buildDashboardComparison", () => {
  it("§52 Cash Flow: positive → more positive is an improvement (up)", () => {
    const result = buildDashboardComparison(3_000_000, 2_000_000);
    expect(result).toEqual({
      available: true,
      current: 3_000_000,
      previous: 2_000_000,
      delta: 1_000_000,
      direction: "up",
    });
  });

  it("§52 Cash Flow: positive → less positive (down)", () => {
    const result = buildDashboardComparison(1_000_000, 2_000_000);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(-1_000_000);
      expect(result.direction).toBe("down");
    }
  });

  it("§52 Cash Flow: negative → less negative is an improvement (up)", () => {
    const result = buildDashboardComparison(-1_000_000, -2_000_000);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(1_000_000);
      expect(result.direction).toBe("up");
    }
  });

  it("§52 Cash Flow: negative → more negative (down)", () => {
    const result = buildDashboardComparison(-2_000_000, -1_000_000);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(-1_000_000);
      expect(result.direction).toBe("down");
    }
  });

  it("§52 Cash Flow: same value → flat", () => {
    const result = buildDashboardComparison(500_000, 500_000);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(0);
      expect(result.direction).toBe("flat");
    }
  });

  it("previous period unavailable → comparison unavailable, never a fake zero", () => {
    const result = buildDashboardComparison(3_000_000, null);
    expect(result).toEqual({ available: false });
  });

  it("§53 Saving Rate: 30% vs 25% → +5 percentage points", () => {
    const result = buildDashboardComparison(30, 25);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(5);
      expect(result.direction).toBe("up");
    }
  });

  it("§53 Saving Rate: 25% vs 30% → -5 percentage points", () => {
    const result = buildDashboardComparison(25, 30);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.delta).toBe(-5);
      expect(result.direction).toBe("down");
    }
  });

  it("§53 Saving Rate: 25% vs 25% → flat", () => {
    const result = buildDashboardComparison(25, 25);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.direction).toBe("flat");
    }
  });

  it("§53 Saving Rate: undefined previous denominator → unavailable, not NaN/Infinity", () => {
    const result = buildDashboardComparison(25, null);
    expect(result).toEqual({ available: false });
    expect(Number.isNaN((result as { delta?: number }).delta)).toBe(false);
  });
});
