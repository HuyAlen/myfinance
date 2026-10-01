import { describe, expect, it } from "vitest";
import {
  createMonthEndReviewHistoryRecord,
  getMonthEndReviewAttentionCount,
  MONTH_END_REVIEW_HISTORY_MAX_MONTHS,
  parseMonthEndReviewHistory,
  upsertMonthEndReviewHistory,
} from "./monthEndReviewHistory";

function record(
  monthKey: string,
  overrides: Partial<ReturnType<typeof createMonthEndReviewHistoryRecord>> = {},
) {
  return {
    ...createMonthEndReviewHistoryRecord(
      {
        monthKey,
        budgetConfigured: true,
        budgetUsage: 80,
        reviewPending: 0,
        overBudgetCount: 0,
        netCashMovement: 2_000_000,
        netWorthDelta: 1_000_000,
      },
      new Date(`${monthKey}-28T12:00:00.000Z`),
    ),
    ...overrides,
  };
}

describe("MONTH-END-REVIEW-HISTORY-1 record normalization", () => {
  it("captures the exact derived closeout metrics without inventing ledger state", () => {
    expect(
      createMonthEndReviewHistoryRecord(
        {
          monthKey: "2026-09",
          budgetConfigured: true,
          budgetUsage: 101.4,
          reviewPending: 2.2,
          overBudgetCount: 1.4,
          netCashMovement: -1_234_567,
          netWorthDelta: 3_000_000,
        },
        new Date("2026-10-01T03:00:00.000Z"),
      ),
    ).toEqual({
      version: 1,
      monthKey: "2026-09",
      savedAt: "2026-10-01T03:00:00.000Z",
      budgetConfigured: true,
      budgetUsage: 101,
      reviewPending: 2,
      overBudgetCount: 1,
      netCashMovement: -1_234_567,
      netWorthDelta: 3_000_000,
    });
  });

  it("rejects an invalid month instead of silently saving an ambiguous period", () => {
    expect(() =>
      createMonthEndReviewHistoryRecord({
        monthKey: "2026-13",
        budgetConfigured: false,
        budgetUsage: 0,
        reviewPending: 0,
        overBudgetCount: 0,
        netCashMovement: 0,
        netWorthDelta: null,
      }),
    ).toThrow("Invalid month key");
  });
});

describe("MONTH-END-REVIEW-HISTORY-1 parsing/upsert", () => {
  it("upserts one record per month and keeps the newer saved snapshot", () => {
    const first = record("2026-09", {
      savedAt: "2026-10-01T01:00:00.000Z",
      reviewPending: 2,
    });
    const latest = record("2026-09", {
      savedAt: "2026-10-01T02:00:00.000Z",
      reviewPending: 0,
    });

    expect(upsertMonthEndReviewHistory([first], latest)).toEqual([latest]);
  });

  it("sorts newest month first, independent of insertion order", () => {
    const result = upsertMonthEndReviewHistory(
      [record("2026-08"), record("2026-10")],
      record("2026-09"),
    );
    expect(result.map((item) => item.monthKey)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
  });

  it("caps retained history so local UX metadata cannot grow without bound", () => {
    const records = Array.from({ length: MONTH_END_REVIEW_HISTORY_MAX_MONTHS }, (_, index) => {
      const year = 2024 + Math.floor(index / 12);
      const month = (index % 12) + 1;
      return record(`${year}-${String(month).padStart(2, "0")}`);
    });
    const result = upsertMonthEndReviewHistory(records, record("2026-12"));
    expect(result).toHaveLength(MONTH_END_REVIEW_HISTORY_MAX_MONTHS);
    expect(result[0].monthKey).toBe("2026-12");
  });

  it("drops corrupt entries, de-duplicates months, and survives malformed JSON", () => {
    const older = record("2026-09", { savedAt: "2026-10-01T01:00:00.000Z" });
    const newer = record("2026-09", { savedAt: "2026-10-01T02:00:00.000Z" });
    const parsed = parseMonthEndReviewHistory(
      JSON.stringify([
        older,
        { nope: true },
        { ...record("2026-08"), monthKey: "2026-99" },
        newer,
      ]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].savedAt).toBe(newer.savedAt);
    expect(parseMonthEndReviewHistory("not-json")).toEqual([]);
  });
});

describe("MONTH-END-REVIEW-HISTORY-1 attention summary", () => {
  it("counts pending review, over-budget items and missing budget as attention points", () => {
    expect(
      getMonthEndReviewAttentionCount(
        record("2026-09", {
          budgetConfigured: false,
          reviewPending: 2,
          overBudgetCount: 1,
        }),
      ),
    ).toBe(4);
  });

  it("returns zero only when the recorded review has no pending attention", () => {
    expect(getMonthEndReviewAttentionCount(record("2026-09"))).toBe(0);
  });
});
