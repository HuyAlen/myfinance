import { describe, expect, it } from "vitest";
import { sortBudgetCardsByStatusPriority } from "./budgetStatusPrioritySort";

type Case = { id: string; spent: number; limit: number };
const sort = (items: Case[]) => sortBudgetCardsByStatusPriority(items, (x) => x);

describe("BUDGET-STATUS-PRIORITY-SORT-1", () => {
  it("places overspent before exact limit before under limit regardless of absolute spend", () => {
    expect(sort([
      { id: "safe", spent: 900, limit: 1000 },
      { id: "over", spent: 11, limit: 10 },
      { id: "at", spent: 50, limit: 50 },
    ]).map((x) => x.id)).toEqual(["over", "at", "safe"]);
  });
  it("sorts overspent and under-limit by utilization descending", () => {
    expect(sort([
      { id: "under40", spent: 40, limit: 100 },
      { id: "over110", spent: 110, limit: 100 },
      { id: "under90", spent: 90, limit: 100 },
      { id: "over150", spent: 30, limit: 20 },
    ]).map((x) => x.id)).toEqual(["over150", "over110", "under90", "under40"]);
  });
  it("sorts at-limit by limit descending", () => {
    expect(sort([{id:"small",spent:10,limit:10},{id:"large",spent:100,limit:100}]).map(x=>x.id)).toEqual(["large", "small"]);
  });
  it("handles zero limit and preserves input order on exact ties without mutating input", () => {
    const items = [{id:"a",spent:5,limit:10},{id:"b",spent:5,limit:10},{id:"zero",spent:0,limit:0}];
    expect(sort(items).map(x=>x.id)).toEqual(["a","b","zero"]);
    expect(items.map(x=>x.id)).toEqual(["a","b","zero"]);
  });
});
