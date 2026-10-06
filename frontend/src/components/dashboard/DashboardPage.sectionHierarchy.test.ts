import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dashboard hierarchy after FINANCE-ACTION-CENTER-1.
 * Hero, operating KPIs and the current-work Action Center are pinned decision
 * surfaces. The user-customizable supporting sections remain below them.
 */
describe("DashboardPage section hierarchy with Action Center", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const markers = {
    hero: 'data-dashboard-surface="hero-shell"',
    operatingKpis: "{/* Operating KPIs */}",
    actionCenter: 'data-dashboard-action-center="true"',
    budgetAttention: "{/* Budget attention */}",
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

  it("renders every major section marker exactly once", () => {
    for (const [name, marker] of Object.entries(markers)) {
      const firstIndex = source.indexOf(marker);
      const lastIndex = source.lastIndexOf(marker);
      expect(firstIndex, `${name} marker not found`).toBeGreaterThan(-1);
      expect(firstIndex, `${name} marker appears more than once`).toBe(
        lastIndex,
      );
    }
  });

  it("keeps Hero first, then operating KPIs, then the pinned Action Center", () => {
    const hero = indexOfMarker(markers.hero);
    const kpis = indexOfMarker(markers.operatingKpis);
    const actionCenter = indexOfMarker(markers.actionCenter);

    expect(hero).toBeLessThan(kpis);
    expect(kpis).toBeLessThan(actionCenter);
  });

  it("keeps the Action Center above every customizable supporting section", () => {
    const actionCenter = indexOfMarker(markers.actionCenter);
    for (const name of [
      "budgetAttention",
      "monthlyProgress",
      "cashFlowAndStructure",
      "upcomingAndTopSpending",
      "forexGoalsRecent",
      "todaySummary",
    ] as const) {
      expect(actionCenter, `Action Center must appear before ${name}`).toBeLessThan(
        indexOfMarker(markers[name]),
      );
    }
  });

  it("high-priority supporting sections stay above medium/low supporting sections", () => {
    const budgetAttentionIndex = indexOfMarker(markers.budgetAttention);
    const monthlyProgressIndex = indexOfMarker(markers.monthlyProgress);
    const cashFlowIndex = indexOfMarker(markers.cashFlowAndStructure);

    for (const name of [
      "upcomingAndTopSpending",
      "forexGoalsRecent",
      "todaySummary",
    ] as const) {
      const target = indexOfMarker(markers[name]);
      expect(budgetAttentionIndex).toBeLessThan(target);
      expect(monthlyProgressIndex).toBeLessThan(target);
      expect(cashFlowIndex).toBeLessThan(target);
    }
  });

  it("Today's Summary remains the last major section", () => {
    const todayIndex = indexOfMarker(markers.todaySummary);
    for (const [name, marker] of Object.entries(markers)) {
      if (name === "todaySummary") continue;
      expect(
        indexOfMarker(marker),
        `${name} must appear before Today's Summary`,
      ).toBeLessThan(todayIndex);
    }
  });
});