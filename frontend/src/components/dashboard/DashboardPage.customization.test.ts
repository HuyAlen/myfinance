import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const normalized = source.replace(/\s+/g, " ");

describe("DASHBOARD-CUSTOMIZATION-1 wiring", () => {
  it("uses one canonical customization module and persists only UI preference state", () => {
    expect(source).toContain('from "@/src/lib/dashboard/dashboardCustomization"');
    expect(source).toContain("readDashboardCustomization()");
    expect(source).toContain("persistDashboardCustomization(nextCustomization)");
    expect(source).toContain("DASHBOARD_CUSTOMIZATION_STORAGE_KEY");
    expect(source).not.toContain("dashboard_customization");
  });

  it("keeps Net Worth Hero and Operating KPIs outside the customizable zone", () => {
    const hero = source.indexOf("{/* Executive overview */}");
    const kpis = source.indexOf("{/* Operating KPIs */}");
    const zone = source.indexOf('data-dashboard-customization-zone="supporting-sections"');
    const decision = source.indexOf('data-dashboard-section="decision"');

    expect(hero).toBeGreaterThan(-1);
    expect(kpis).toBeGreaterThan(hero);
    expect(zone).toBeGreaterThan(kpis);
    expect(decision).toBeGreaterThan(zone);
  });

  it("wires all ten supporting modules to saved visibility and order", () => {
    for (const id of [
      "decision",
      "budget",
      "month-progress",
      "cash-flow",
      "review",
      "closeout",
      "recurring",
      "wealth",
      "portfolio",
      "today",
    ]) {
      expect(source).toContain(`data-dashboard-section="${id}"`);
      expect(source).toContain(`getDashboardSectionOrder(dashboardCustomization, "${id}")`);
      expect(source).toContain(`isDashboardSectionVisible(dashboardCustomization, "${id}")`);
    }
  });

  it("offers mobile-friendly show/hide, move, reset, close and Escape controls", () => {
    expect(source).toContain("Tùy chỉnh Dashboard");
    expect(source).toContain("toggleDashboardSection(dashboardCustomization, sectionId)");
    expect(source).toContain('moveDashboardSection(dashboardCustomization, sectionId, direction)');
    expect(source).toContain("createDefaultDashboardCustomization()");
    expect(source).toContain('if (event.key === "Escape") setIsDashboardCustomizationOpen(false);');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it("suppresses global FABs while the customization sheet is open", () => {
    expect(source).toContain("useSuppressGlobalFabsWhileOpen(isDashboardCustomizationOpen)");
  });

  it("syncs preference changes from another browser tab without polling", () => {
    expect(source).toContain('window.addEventListener("storage", handleDashboardCustomizationStorage)');
    expect(source).toContain('event.key !== DASHBOARD_CUSTOMIZATION_STORAGE_KEY');
    expect(source).not.toContain("setInterval(");
  });

  it("explains that core financial position remains pinned", () => {
    expect(normalized).toContain(
      "Tài sản ròng và các KPI vận hành luôn được ghim ở đầu để giữ thứ tự ưu tiên tài chính.",
    );
  });

  it("does not add finance queries or mutations", () => {
    const financeFnBaselineCounts: Record<string, number> = {
      "getWallets(": 1,
      "getTransactionsInRange(": 2,
      "getBudgets(": 1,
      "getGoals(": 1,
      "getDebts(": 1,
      "getInvestments(": 1,
    };
    for (const [fn, expectedCount] of Object.entries(financeFnBaselineCounts)) {
      expect(source.split(fn).length - 1).toBe(expectedCount);
    }
    expect(source).not.toContain("updateDashboardCustomization(");
    expect(source).not.toContain("supabase.from(\"dashboard");
  });
});
