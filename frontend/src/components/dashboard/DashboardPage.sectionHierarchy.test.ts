import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-DASH-1 Information Hierarchy & Priority Reordering.
 *
 * DashboardPage.tsx cannot be mounted in this project's test setup (no
 * React Testing Library — see AGENTS.md), so this locks the section order
 * via a plain text-order check on unique markers already present in the
 * source: the Hero heading ("Tài sản ròng"), the Action Center heading
 * ("Ưu tiên tài chính"), and the leading JSX comment above each other
 * major section. This is intentionally a source-order contract, not a
 * line-number assertion — it survives unrelated formatting changes as
 * long as the sections themselves stay in the intended relative order,
 * and it fails the moment a future edit moves a low-priority section back
 * above Hero/Action Center or duplicates a section.
 */
describe("DashboardPage section hierarchy (UI-DASH-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const markers = {
    hero: "Tài sản ròng",
    actionCenter: "Ưu tiên tài chính",
    operatingKpis: "{/* Operating KPIs */}",
    monthlyProgress: "{/* Monthly progress */}",
    cashFlowAndStructure: "{/* Cash flow and structure */}",
    upcomingAndTopSpending: 'title="Sắp đến hạn trong 30 ngày"',
    forexGoalsRecent: "{/* Forex + goals + recent activity */}",
    todaySummary: "{/* Today's summary */}",
  } as const;

  function indexOfMarker(marker: string): number {
    const index = source.indexOf(marker);
    expect(index, `expected to find marker: ${marker}`).toBeGreaterThan(-1);
    return index;
  }

  it("every major section marker appears exactly once (no duplicated section)", () => {
    for (const [name, marker] of Object.entries(markers)) {
      const firstIndex = source.indexOf(marker);
      const lastIndex = source.lastIndexOf(marker);
      expect(firstIndex, `${name} marker not found`).toBeGreaterThan(-1);
      expect(firstIndex, `${name} marker appears more than once`).toBe(
        lastIndex,
      );
    }
  });

  it("Hero is the first major Dashboard section", () => {
    const heroIndex = indexOfMarker(markers.hero);
    for (const [name, marker] of Object.entries(markers)) {
      if (name === "hero") continue;
      expect(
        heroIndex,
        `Hero must appear before ${name}`,
      ).toBeLessThan(indexOfMarker(marker));
    }
  });

  it("Action Center is near the top — immediately after Hero and before every lower-priority informational section", () => {
    const actionCenterIndex = indexOfMarker(markers.actionCenter);
    expect(actionCenterIndex).toBeGreaterThan(indexOfMarker(markers.hero));

    for (const name of [
      "operatingKpis",
      "monthlyProgress",
      "cashFlowAndStructure",
      "upcomingAndTopSpending",
      "forexGoalsRecent",
      "todaySummary",
    ] as const) {
      expect(
        actionCenterIndex,
        `Action Center must appear before ${name}`,
      ).toBeLessThan(indexOfMarker(markers[name]));
    }
  });

  it("Operating KPIs and Monthly Progress (HIGH priority) appear before the MEDIUM/LOW informational sections", () => {
    const kpisIndex = indexOfMarker(markers.operatingKpis);
    const monthlyProgressIndex = indexOfMarker(markers.monthlyProgress);
    const cashFlowIndex = indexOfMarker(markers.cashFlowAndStructure);

    for (const name of [
      "upcomingAndTopSpending",
      "forexGoalsRecent",
      "todaySummary",
    ] as const) {
      const target = indexOfMarker(markers[name]);
      expect(kpisIndex).toBeLessThan(target);
      expect(monthlyProgressIndex).toBeLessThan(target);
      expect(cashFlowIndex).toBeLessThan(target);
    }
  });

  it("Today's Summary (LOW/supporting priority) no longer leads the Dashboard — it is the last major section", () => {
    const todayIndex = indexOfMarker(markers.todaySummary);
    for (const [name, marker] of Object.entries(markers)) {
      if (name === "todaySummary") continue;
      expect(
        indexOfMarker(marker),
        `${name} must appear before Today's Summary`,
      ).toBeLessThan(todayIndex);
    }
  });

  it("Action Center's conditional rendering (priorityActions.length check) is preserved, not duplicated", () => {
    const occurrences = source.split("priorityActions.length > 0").length - 1;
    expect(occurrences).toBe(1);
  });
});
