import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contextual navigation contracts after removing the Dashboard Action Center.
 * The remaining KPI/goal/transaction drill-down behavior must stay intact.
 */
describe("DashboardPage contextual navigation after Action Center removal", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports the contextual navigation builders still used by the page", () => {
    expect(source).toContain("buildGoalsHref");
    expect(source).toContain("buildSavingsHref");
    expect(source).toContain("buildTransactionsHref");
    expect(source).toContain("buildBudgetsHref");
  });

  it("Net Cash Flow KPI carries the selected Dashboard month to Transactions", () => {
    expect(source).toContain(
      "href: buildTransactionsHref({ month: dashboardMonthKey })",
    );
  });

  it("Emergency Fund KPI links to the collection-level Savings page", () => {
    expect(source).toContain("href: buildSavingsHref()");
  });

  it("Goals KPI links to the collection-level Goals page", () => {
    expect(source).toContain("href: buildGoalsHref()");
  });

  it("Saving & Investment Rate KPI remains deliberately non-clickable", () => {
    const kpiCardsStart = source.indexOf("const kpiCards = [");
    expect(kpiCardsStart).toBeGreaterThan(-1);
    const kpiCardsEnd = source.indexOf("] as const;", kpiCardsStart);
    const kpiCardsSource = source.slice(kpiCardsStart, kpiCardsEnd);

    expect(kpiCardsSource).toContain('title: "Tiết kiệm & Đầu tư"');
    expect(kpiCardsSource).toContain("href: undefined as string | undefined");
  });

  it("KpiCard only becomes interactive when a destination exists", () => {
    expect(source).toContain(
      "onClick={item.href ? () => router.push(item.href!) : undefined}",
    );
  });

  it("KpiCard uses a semantic button when actionable", () => {
    const start = source.indexOf("function KpiCard({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("function Panel(", start);
    expect(end).toBeGreaterThan(start);
    const kpiCardSource = source.slice(start, end);

    expect(kpiCardSource).toContain("<button");
    expect(kpiCardSource).toContain('type="button"');
    expect(kpiCardSource).toContain("aria-label={`Xem chi tiết: ${title}`}");
    expect(kpiCardSource).toContain("focus-visible:ring-2");
    expect(kpiCardSource).toContain("if (onClick && !isLoading)");
  });

  it("each Goal row navigates using its own goal.id", () => {
    const goalRowsStart = source.indexOf("goalRows.slice(0, 3).map((goal) => (");
    expect(goalRowsStart).toBeGreaterThan(-1);
    const goalRowsWindow = source.slice(goalRowsStart, goalRowsStart + 500);

    expect(goalRowsWindow).toContain("<button");
    expect(goalRowsWindow).toContain("key={goal.id}");
    expect(goalRowsWindow).toContain(
      "router.push(buildGoalsHref({ goalId: goal.id }))",
    );
  });

  it("Goals 'Xem tất cả' remains collection-level navigation", () => {
    const ctaIndex = source.indexOf("Xem tất cả mục tiêu");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 500), ctaIndex);
    expect(before).toContain("router.push(buildGoalsHref())");
  });

  it("Transactions 'Xem tất cả' preserves the selected Dashboard period", () => {
    const ctaIndex = source.indexOf("Xem tất cả giao dịch");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 500), ctaIndex);
    expect(before).toContain(
      "router.push(buildTransactionsHref({ month: dashboardMonthKey }))",
    );
    expect(before).not.toMatch(/router\.push\(\s*"\/transactions"\s*\)/);
  });

  it("Hero Reports and Forex Investments CTAs remain unchanged bare routes", () => {
    expect(source).toContain('router.push("/reports")');
    expect(source).toContain('router.push("/investments")');
  });

  it("does not retain the removed Action Center navigation/identity system", () => {
    expect(source).not.toContain("selectDashboardPriorityActions");
    expect(source).not.toContain("composeIssueIdentity");
    expect(source).not.toContain("deriveAggregateIssueKind");
    expect(source).not.toContain("DashboardActionCandidate");
    expect(source).not.toContain("priorityActions");
    expect(source).not.toContain("Ưu tiên tài chính");
  });
});
