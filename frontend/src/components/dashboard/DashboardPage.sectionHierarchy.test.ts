import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dashboard hierarchy after intentionally removing the Financial Priority /
 * Action Center block from the Dashboard.
 *
 * Source-inspection, not component mounting — consistent with this repo's
 * existing DashboardPage tests.
 */
describe("DashboardPage section hierarchy after Action Center removal", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const markers = {
    hero: "Tài sản ròng",
    operatingKpis: "{/* Operating KPIs */}",
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

  it("removes the Action Center / Financial Priority section completely", () => {
    expect(source).not.toContain("Ưu tiên tài chính");
    expect(source).not.toContain("{/* Action center */}");
    expect(source).not.toContain("priorityActions.length > 0");
  });

  it("every remaining major section marker appears exactly once", () => {
    for (const [name, marker] of Object.entries(markers)) {
      const firstIndex = source.indexOf(marker);
      const lastIndex = source.lastIndexOf(marker);
      expect(firstIndex, `${name} marker not found`).toBeGreaterThan(-1);
      expect(firstIndex, `${name} marker appears more than once`).toBe(
        lastIndex,
      );
    }
  });

  it("Hero remains the first major Dashboard section", () => {
    const heroIndex = indexOfMarker(markers.hero);
    for (const [name, marker] of Object.entries(markers)) {
      if (name === "hero") continue;
      expect(heroIndex, `Hero must appear before ${name}`).toBeLessThan(
        indexOfMarker(marker),
      );
    }
  });

  it("Operating KPIs follow Hero, then Budget Attention, then Monthly Progress", () => {
    expect(indexOfMarker(markers.hero)).toBeLessThan(
      indexOfMarker(markers.operatingKpis),
    );
    expect(indexOfMarker(markers.operatingKpis)).toBeLessThan(
      indexOfMarker(markers.budgetAttention),
    );
    expect(indexOfMarker(markers.budgetAttention)).toBeLessThan(
      indexOfMarker(markers.monthlyProgress),
    );
  });

  it("high-priority operating sections stay above medium/low supporting sections", () => {
    const kpisIndex = indexOfMarker(markers.operatingKpis);
    const budgetAttentionIndex = indexOfMarker(markers.budgetAttention);
    const monthlyProgressIndex = indexOfMarker(markers.monthlyProgress);
    const cashFlowIndex = indexOfMarker(markers.cashFlowAndStructure);

    for (const name of [
      "upcomingAndTopSpending",
      "forexGoalsRecent",
      "todaySummary",
    ] as const) {
      const target = indexOfMarker(markers[name]);
      expect(kpisIndex).toBeLessThan(target);
      expect(budgetAttentionIndex).toBeLessThan(target);
      expect(monthlyProgressIndex).toBeLessThan(target);
      expect(cashFlowIndex).toBeLessThan(target);
    }
  });

  it("Today's Summary remains the last major section", () => {
    const todayIndex = indexOfMarker(markers.todaySummary);
    for (const [name, marker] of Object.entries(markers)) {
      if (name === "todaySummary") continue;
      expect(indexOfMarker(marker), `${name} must appear before Today's Summary`).toBeLessThan(
        todayIndex,
      );
    }
  });
});
