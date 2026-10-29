import { describe, expect, it } from "vitest";
import {
  loadCompleteSavingsLedger,
  paginateSavingsActivity,
} from "@/src/lib/savings/savingsActivityHistory";

describe("SAVINGS-ACTIVITY-PAGINATION-P2", () => {
  const rows = Array.from({ length: 17 }, (_, index) => ({ id: String(index + 1) }));

  it("shows six activities per page without throwing away older rows", () => {
    expect(paginateSavingsActivity(rows, 1).items).toEqual(rows.slice(0, 6));
    expect(paginateSavingsActivity(rows, 2).items).toEqual(rows.slice(6, 12));
    expect(paginateSavingsActivity(rows, 3).items).toEqual(rows.slice(12, 17));
    expect(paginateSavingsActivity(rows, 3)).toMatchObject({
      page: 3, pageCount: 3, total: 17, from: 13, to: 17,
    });
  });

  it("clamps invalid pages and handles an empty history", () => {
    expect(paginateSavingsActivity(rows, 999).page).toBe(3);
    expect(paginateSavingsActivity(rows, -2).page).toBe(1);
    expect(paginateSavingsActivity([], 1)).toMatchObject({
      total: 0, page: 1, pageCount: 1, from: 0, to: 0, items: [],
    });
  });

  it("loads every database batch, deduplicating overlapping IDs", async () => {
    const pageRequests: number[] = [];
    const fetchPage = async (from: number, to: number) => {
      pageRequests.push(from);
      const data = from === 0 ? rows.slice(0, 10) :
        from === 10 ? [rows[9], ...rows.slice(10, 17)] : [];
      return { data, error: null };
    };
    const result = await loadCompleteSavingsLedger(fetchPage, 10);
    expect(result).toEqual(rows);
    expect(pageRequests).toEqual([0, 10]);
  });

  it("rejects later-page failures instead of returning a partial history", async () => {
    await expect(loadCompleteSavingsLedger(async (from) => (
      from === 0
        ? { data: rows.slice(0, 10), error: null }
        : { data: null, error: { message: "database unavailable" } }
    ), 10)).rejects.toThrow("database unavailable");
  });
});
