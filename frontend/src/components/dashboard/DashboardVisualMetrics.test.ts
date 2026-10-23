import { describe, expect, it } from "vitest";
import {
  getDashboardBudgetBand,
  getDashboardBudgetScale,
  getDashboardExpenseMosaicColumns,
  getDashboardWalletDistribution,
} from "./DashboardVisualMetrics";

describe("MYFINANCE DASHBOARD VISUAL REDESIGN P1.1", () => {
  it("encodes expense area by the observed amount, not decorative tile size", () => {
    const columns = getDashboardExpenseMosaicColumns([
      { name: "Nhà ở", value: 24 },
      { name: "Ăn uống", value: 21 },
      { name: "Gia đình", value: 17 },
      { name: "Con cái", value: 16 },
      { name: "Khác", value: 22 },
    ]);
    expect(columns).toHaveLength(2);
    expect(columns[0].widthPercent).toBe(45);
    expect(columns[1].widthPercent).toBe(55);
    const firstArea = columns[0].widthPercent * columns[0].tiles[0].heightPercent / 100;
    const thirdArea = columns[1].widthPercent * columns[1].tiles[0].heightPercent / 100;
    expect(firstArea).toBeCloseTo(24, 6);
    expect(thirdArea).toBeCloseTo(17, 6);
    expect(columns.flatMap((column) => column.tiles).reduce((sum, tile) => sum + tile.value, 0)).toBe(100);
  });

  it("keeps single-category and empty mosaics finite and full-width", () => {
    expect(getDashboardExpenseMosaicColumns([])).toEqual([]);
    expect(getDashboardExpenseMosaicColumns([{ name: "Ăn uống", value: 0 }])).toEqual([]);
    expect(getDashboardExpenseMosaicColumns([{ name: "Ăn uống", value: 500 }])).toEqual([
      { widthPercent: 100, tiles: [{ name: "Ăn uống", value: 500, heightPercent: 100, sharePercent: 100 }] },
    ]);
  });

  it("uses one honest budget scale, showing 446% differently from 110%", () => {
    const rows = [{ spent: 4_460_000, limit: 1_000_000 }, { spent: 1_100_000, limit: 1_000_000 }];
    const max = getDashboardBudgetScale(rows);
    expect(max).toBe(450);
    const first = getDashboardBudgetBand(rows[0], max);
    const second = getDashboardBudgetBand(rows[1], max);
    expect(first.markerPercent).toBeCloseTo(100 / 450 * 100, 6);
    expect(first.basePercent).toBeCloseTo(100 / 450 * 100, 6);
    expect(first.excessPercent).toBeCloseTo(346 / 450 * 100, 6);
    expect(second.excessPercent).toBeCloseTo(10 / 450 * 100, 6);
    expect(first.basePercent + first.excessPercent).toBeGreaterThan(second.basePercent + second.excessPercent);
  });

  it("does not show a fake 100% budget bar when the limit is zero", () => {
    const band = getDashboardBudgetBand({ spent: 100_000, limit: 0 }, 150);
    expect(band.basePercent).toBe(0);
    expect(band.excessPercent).toBe(0);
    expect(band.markerPercent).toBeCloseTo(66.6666667);
    expect(band.hasLimit).toBe(false);
  });

  it("groups the wallet long tail without losing any positive balance or percentage", () => {
    const rows = [
      { id: "a", name: "A", balance: 500, sharePercent: 50 },
      { id: "b", name: "B", balance: 250, sharePercent: 25 },
      { id: "c", name: "C", balance: 125, sharePercent: 12.5 },
      { id: "d", name: "D", balance: 75, sharePercent: 7.5 },
      { id: "e", name: "E", balance: 25, sharePercent: 2.5 },
      { id: "f", name: "F", balance: 15, sharePercent: 1.5 },
      { id: "g", name: "G", balance: 10, sharePercent: 1 },
    ];
    const grouped = getDashboardWalletDistribution(rows, 5);
    expect(grouped).toHaveLength(6);
    expect(grouped[5]).toEqual({ id: "dashboard-wallet-other", name: "Ví khác", balance: 25, sharePercent: 2.5 });
    expect(grouped.reduce((sum, row) => sum + row.balance, 0)).toBe(1_000);
    expect(grouped.reduce((sum, row) => sum + row.sharePercent, 0)).toBeCloseTo(100, 6);
  });
});
