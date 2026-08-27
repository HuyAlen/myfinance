import { describe, expect, it } from "vitest";
import type { NetWorthSnapshot } from "@/src/types/finance";
import {
  buildCanonicalNetWorthTrend,
  summarizeCanonicalNetWorthHistory,
} from "./netWorthHistory";

function snapshot(month: string, netWorth: number): NetWorthSnapshot {
  return {
    id: `snapshot-${month}`,
    snapshotMonth: month,
    cashAndWallets: netWorth,
    savings: 0,
    investments: 0,
    forex: 0,
    totalAssets: netWorth,
    totalDebt: 0,
    netWorth,
    capturedAt: `${month}T00:00:00.000Z`,
  };
}

describe("NETWORTH-HISTORY-1 canonical Dashboard trend", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("keeps unknown historical months null instead of reconstructing them", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [snapshot("2026-08-01", 150_000_000)],
      selectedYear: 2026,
      selectedMonth: 8,
      now,
    });

    for (let month = 1; month <= 7; month += 1) {
      expect(trend[month - 1]).toMatchObject({
        month,
        value: null,
        hasData: false,
      });
    }
    expect(trend[7]).toMatchObject({
      month: 8,
      value: 150_000_000,
      hasData: true,
      isSnapshotMonth: true,
    });
  });

  it("treats a persisted zero Net Worth as real data, never as missing", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [snapshot("2026-07-01", 0)],
      selectedYear: 2026,
      selectedMonth: 7,
      now,
    });

    expect(trend[6]).toMatchObject({
      value: 0,
      hasData: true,
      isSnapshotMonth: true,
    });
  });

  it("orders all twelve calendar months and preserves recorded values only", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [
        snapshot("2026-03-01", 30),
        snapshot("2026-01-01", 10),
        snapshot("2026-02-01", 20),
      ],
      selectedYear: 2026,
      selectedMonth: 3,
      now,
    });

    expect(trend).toHaveLength(12);
    expect(trend.map((point) => point.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(trend.slice(0, 3).map((point) => point.value)).toEqual([10, 20, 30]);
  });

  it("keeps future months null even if malformed/local input contains a row", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [
        snapshot("2026-08-01", 80),
        snapshot("2026-09-01", 90),
        snapshot("2027-01-01", 100),
      ],
      selectedYear: 2026,
      selectedMonth: 8,
      now,
    });

    expect(trend[7]).toMatchObject({ value: 80, hasData: true });
    for (let month = 9; month <= 12; month += 1) {
      expect(trend[month - 1]).toMatchObject({ value: null, hasData: false });
    }
  });

  it("ignores snapshots from a different selected year", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [snapshot("2025-12-01", 125), snapshot("2026-01-01", 126)],
      selectedYear: 2026,
      selectedMonth: 1,
      now,
    });

    expect(trend[0].value).toBe(126);
    expect(trend.filter((point) => point.hasData)).toHaveLength(1);
  });
  it("caps visible history at the selected month for past-period review", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [
        snapshot("2026-06-01", 60),
        snapshot("2026-07-01", 70),
        snapshot("2026-08-01", 80),
      ],
      selectedYear: 2026,
      selectedMonth: 7,
      now,
    });

    expect(trend[5]).toMatchObject({ value: 60, hasData: true });
    expect(trend[6]).toMatchObject({ value: 70, hasData: true });
    expect(trend[7]).toMatchObject({ value: null, hasData: false });
  });

  it("future selected months still stop at the latest real calendar month", () => {
    const trend = buildCanonicalNetWorthTrend({
      snapshots: [
        snapshot("2026-08-01", 80),
        snapshot("2026-09-01", 90),
      ],
      selectedYear: 2026,
      selectedMonth: 9,
      now,
    });

    expect(trend[7]).toMatchObject({ value: 80, hasData: true });
    expect(trend[8]).toMatchObject({ value: null, hasData: false });
  });

  it("reports no comparison for zero or one canonical snapshot", () => {
    const empty = summarizeCanonicalNetWorthHistory(
      buildCanonicalNetWorthTrend({
        snapshots: [],
        selectedYear: 2026,
        selectedMonth: 8,
        now,
      }),
    );
    expect(empty).toMatchObject({
      snapshotCount: 0,
      firstPoint: null,
      latestPoint: null,
      previousPoint: null,
      hasComparison: false,
      changeFromPrevious: null,
    });

    const single = summarizeCanonicalNetWorthHistory(
      buildCanonicalNetWorthTrend({
        snapshots: [snapshot("2026-08-01", 80)],
        selectedYear: 2026,
        selectedMonth: 8,
        now,
      }),
    );
    expect(single.snapshotCount).toBe(1);
    expect(single.hasComparison).toBe(false);
    expect(single.changeFromPrevious).toBeNull();
    expect(single.latestPoint?.value).toBe(80);
  });

  it("compares the two latest recorded snapshots, not missing calendar months", () => {
    const summary = summarizeCanonicalNetWorthHistory(
      buildCanonicalNetWorthTrend({
        snapshots: [
          snapshot("2026-05-01", 50),
          snapshot("2026-08-01", 80),
        ],
        selectedYear: 2026,
        selectedMonth: 8,
        now,
      }),
    );

    expect(summary.snapshotCount).toBe(2);
    expect(summary.previousPoint?.month).toBe(5);
    expect(summary.latestPoint?.month).toBe(8);
    expect(summary.hasComparison).toBe(true);
    expect(summary.changeFromPrevious).toBe(30);
  });

});
