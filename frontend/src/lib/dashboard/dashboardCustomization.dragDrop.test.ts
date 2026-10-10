import { describe, expect, it } from "vitest";
import {
  createDefaultDashboardCustomization,
  getDashboardSectionOrder,
  normalizeDashboardCustomization,
  reorderDashboardSection,
  type DashboardCustomization,
  type DashboardSectionId,
} from "./dashboardCustomization";

describe("DASHBOARD-CUSTOMIZATION-DRAG-DROP-1 reorder semantics", () => {
  it("moves a supporting section down across multiple positions without mutating its source", () => {
    const original = createDefaultDashboardCustomization();
    const before = [...original.order];
    const updated = reorderDashboardSection(original, "decision", 3);
    expect(updated.order.slice(0, 5)).toEqual([
      "budget", "month-progress", "cash-flow", "decision", "review",
    ]);
    expect(original.order).toEqual(before);
    expect(updated.hidden).toEqual([]);
    expect(getDashboardSectionOrder(updated, "decision")).toBe(3);
  });

  it("moves a section up and preserves all ten unique supporting modules", () => {
    const original = createDefaultDashboardCustomization();
    const updated = reorderDashboardSection(original, "closeout", 0);
    expect(updated.order[0]).toBe("closeout");
    expect(updated.order).toHaveLength(original.order.length);
    expect(new Set(updated.order).size).toBe(original.order.length);
    expect(updated.order[1]).toBe("decision");
  });

  it("keeps hidden sections hidden and includes their saved destination in order", () => {
    const initial: DashboardCustomization = {
      ...createDefaultDashboardCustomization(),
      hidden: ["budget", "review"],
    };
    const updated = reorderDashboardSection(initial, "review", 9);
    expect(updated.hidden).toEqual(["budget", "review"]);
    expect(updated.order.at(-1)).toBe("review");
    expect(normalizeDashboardCustomization(updated)).toEqual(updated);
  });

  it("rejects missing, fractional or out-of-range targets without changing order", () => {
    const original = createDefaultDashboardCustomization();
    for (const target of [-1, 10, 1.5, Number.NaN, Infinity]) {
      const result = reorderDashboardSection(original, "decision", target);
      expect(result.order).toEqual(original.order);
    }
    const invalid = reorderDashboardSection(original, "unknown" as DashboardSectionId, 3);
    expect(invalid.order).toEqual(original.order);
    expect(reorderDashboardSection(original, "decision", 0).order).toEqual(original.order);
  });
});
