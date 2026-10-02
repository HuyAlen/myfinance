import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CUSTOMIZATION_SECTIONS,
  createDefaultDashboardCustomization,
  getDashboardSectionOrder,
  isDashboardSectionVisible,
  moveDashboardSection,
  normalizeDashboardCustomization,
  toggleDashboardSection,
} from "./dashboardCustomization";

describe("DASHBOARD-CUSTOMIZATION-1 preference contract", () => {
  it("ships every supporting section in the current Dashboard order", () => {
    const config = createDefaultDashboardCustomization();
    expect(config.order).toEqual(
      DASHBOARD_CUSTOMIZATION_SECTIONS.map((section) => section.id),
    );
    expect(config.hidden).toEqual([]);
  });

  it("normalizes malformed storage to the safe default", () => {
    expect(normalizeDashboardCustomization(null)).toEqual(
      createDefaultDashboardCustomization(),
    );
    expect(normalizeDashboardCustomization(["budget"])).toEqual(
      createDefaultDashboardCustomization(),
    );
  });

  it("keeps known persisted order, removes duplicates/unknown ids, then appends new sections", () => {
    const result = normalizeDashboardCustomization({
      order: ["today", "budget", "today", "future-section"],
      hidden: [],
    });

    expect(result.order[0]).toBe("today");
    expect(result.order[1]).toBe("budget");
    expect(result.order.filter((id) => id === "today")).toHaveLength(1);
    expect(result.order).toHaveLength(DASHBOARD_CUSTOMIZATION_SECTIONS.length);
    expect(result.order).not.toContain("future-section");
  });

  it("filters hidden ids to known unique sections", () => {
    const result = normalizeDashboardCustomization({
      hidden: ["budget", "budget", "unknown", "today"],
    });
    expect(result.hidden).toEqual(["budget", "today"]);
  });

  it("toggle hides then restores one module without changing its order", () => {
    const initial = createDefaultDashboardCustomization();
    const hidden = toggleDashboardSection(initial, "budget");
    const visibleAgain = toggleDashboardSection(hidden, "budget");

    expect(isDashboardSectionVisible(hidden, "budget")).toBe(false);
    expect(isDashboardSectionVisible(visibleAgain, "budget")).toBe(true);
    expect(visibleAgain.order).toEqual(initial.order);
  });

  it("moves a module one slot at a time", () => {
    const initial = createDefaultDashboardCustomization();
    const moved = moveDashboardSection(initial, "budget", "up");

    expect(moved.order.slice(0, 2)).toEqual(["budget", "decision"]);
    expect(getDashboardSectionOrder(moved, "budget")).toBe(0);
  });

  it("does not wrap around at the first or last position", () => {
    const initial = createDefaultDashboardCustomization();
    expect(moveDashboardSection(initial, "decision", "up").order).toEqual(
      initial.order,
    );
    expect(moveDashboardSection(initial, "today", "down").order).toEqual(
      initial.order,
    );
  });

  it("never mutates the input preference object", () => {
    const initial = createDefaultDashboardCustomization();
    const orderSnapshot = [...initial.order];
    const hiddenSnapshot = [...initial.hidden];

    moveDashboardSection(initial, "review", "up");
    toggleDashboardSection(initial, "review");

    expect(initial.order).toEqual(orderSnapshot);
    expect(initial.hidden).toEqual(hiddenSnapshot);
  });
});
