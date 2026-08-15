import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-DASH-3 Contextual Navigation Adoption — wiring contracts.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.budgetAttentionWiring.test.ts and
 * DashboardPage.perfOutcomeClassification.test.ts.
 *
 * These tests prove DashboardPage actually ADOPTS the existing INTEGRATION-2
 * navigation builders on the surfaces this sprint targets, rather than
 * reimplementing route strings — and that the Action Center now merges both
 * action sources through the new selectDashboardPriorityActions policy
 * instead of picking one source wholesale.
 */
describe("DashboardPage contextual navigation adoption (UI-DASH-3)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports the contextual navigation builders it now uses", () => {
    expect(source).toContain("buildGoalsHref");
    expect(source).toContain("buildSavingsHref");
    expect(source).toContain("buildTransactionsHref");
  });

  it("the Net Cash Flow KPI carries the selected Dashboard period (dashboardMonthKey), not today's date, to Transactions", () => {
    expect(source).toContain(
      "href: buildTransactionsHref({ month: dashboardMonthKey })",
    );
    // Guards against a `new Date()` fallback ever creeping into this call.
    const callIndex = source.indexOf(
      "href: buildTransactionsHref({ month: dashboardMonthKey })",
    );
    expect(callIndex).toBeGreaterThan(-1);
  });

  it("the Emergency Fund KPI links to the collection-level Savings page (no fabricated entity id)", () => {
    expect(source).toContain("href: buildSavingsHref()");
  });

  it("the Goals KPI links to the collection-level Goals page (aggregate metric, not one goal)", () => {
    expect(source).toContain("href: buildGoalsHref()");
  });

  it("the Saving & Investment Rate KPI is deliberately left non-clickable (ambiguous multi-domain destination)", () => {
    const kpiCardsStart = source.indexOf("const kpiCards = [");
    expect(kpiCardsStart).toBeGreaterThan(-1);
    const kpiCardsEnd = source.indexOf("] as const;", kpiCardsStart);
    const kpiCardsSource = source.slice(kpiCardsStart, kpiCardsEnd);

    expect(kpiCardsSource).toContain('title: "Tiết kiệm & Đầu tư"');
    expect(kpiCardsSource).toContain("href: undefined as string | undefined");
  });

  it("KpiCard only becomes an interactive element when a destination (href) exists", () => {
    expect(source).toContain(
      "onClick={item.href ? () => router.push(item.href!) : undefined}",
    );
  });

  it("KpiCard renders a semantic <button> (not a <div onClick>) when actionable, with an accessible label and focus-visible state", () => {
    const kpiCardFnStart = source.indexOf("function KpiCard({");
    expect(kpiCardFnStart).toBeGreaterThan(-1);
    const kpiCardFnEnd = source.indexOf("function Panel(", kpiCardFnStart);
    expect(kpiCardFnEnd).toBeGreaterThan(kpiCardFnStart);
    const kpiCardSource = source.slice(kpiCardFnStart, kpiCardFnEnd);

    expect(kpiCardSource).toContain("<button");
    expect(kpiCardSource).toContain('type="button"');
    expect(kpiCardSource).toContain("aria-label={`Xem chi tiết: ${title}`}");
    expect(kpiCardSource).toContain("focus-visible:ring-2");
    // A loading (skeleton) card must never become clickable.
    expect(kpiCardSource).toContain("if (onClick && !isLoading)");
  });

  it("each Goal row navigates using its own goal.id (not a reused/shared id) via a semantic button", () => {
    const goalRowsStart = source.indexOf("goalRows.slice(0, 3).map((goal) => (");
    expect(goalRowsStart).toBeGreaterThan(-1);
    const goalRowsWindow = source.slice(goalRowsStart, goalRowsStart + 400);

    expect(goalRowsWindow).toContain("<button");
    expect(goalRowsWindow).toContain("key={goal.id}");
    expect(goalRowsWindow).toContain(
      "router.push(buildGoalsHref({ goalId: goal.id }))",
    );
  });

  it("Goals 'Xem tất cả' remains collection-level navigation (buildGoalsHref with no id), not the first row's id", () => {
    const ctaIndex = source.indexOf("Xem tất cả mục tiêu");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 500), ctaIndex);
    expect(before).toContain("router.push(buildGoalsHref())");
  });

  it("Transactions 'Xem tất cả' preserves the selected Dashboard period via buildTransactionsHref, not a bare route", () => {
    const ctaIndex = source.indexOf("Xem tất cả giao dịch");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 500), ctaIndex);
    expect(before).toContain(
      "router.push(buildTransactionsHref({ month: dashboardMonthKey }))",
    );
    expect(before).not.toMatch(/router\.push\(\s*"\/transactions"\s*\)/);
  });

  it("no bare-route regression on the surfaces this sprint targets: Goals CTA and Transactions CTA no longer use literal route strings", () => {
    expect(source).not.toMatch(/onClick=\{\(\) => router\.push\("\/goals"\)\}/);
    expect(source).not.toMatch(
      /onClick=\{\(\) => router\.push\("\/transactions"\)\}/,
    );
  });

  it("Hero 'Xem báo cáo' and the Forex panel CTA remain bare routes — no Reports/Investments builder exists, so nothing was invented", () => {
    // These are explicitly OUT of scope: Reports and Investments consume
    // zero URL params today, so adopting a contextual builder here would
    // violate the "destination must actually consume it" rule.
    expect(source).toContain('router.push("/reports")');
    expect(source).toContain('router.push("/investments")');
  });

  it("Action Center merges BOTH action sources via selectDashboardPriorityActions, rather than one source discarding the other wholesale", () => {
    expect(source).toContain(
      '"@/src/lib/dashboard/dashboardActionPriority"',
    );
    expect(source).toContain("type DashboardActionCandidate");

    const mergeCallIndex = source.indexOf("selectDashboardPriorityActions([");
    expect(mergeCallIndex).toBeGreaterThan(-1);
    const mergeWindow = source.slice(mergeCallIndex, mergeCallIndex + 300);
    expect(mergeWindow).toContain("...v3AdvisorActions");
    expect(mergeWindow).toContain("...aiActions.map(");

    // The historical bug's exact shape must not remain anywhere in the file.
    expect(source).not.toMatch(
      /v3AdvisorActions\.length > 0\s*\?\s*v3AdvisorActions\s*:/,
    );
  });

  it("v3AdvisorActions candidates carry a domain (for icon lookup) instead of a pre-rendered icon", () => {
    const v3Start = source.indexOf("const v3AdvisorActions = useMemo(");
    expect(v3Start).toBeGreaterThan(-1);
    const v3End = source.indexOf("const priorityActionCandidates", v3Start);
    const v3Source = source.slice(v3Start, v3End);

    expect(v3Source).toContain('domain: "emergency"');
    expect(v3Source).toContain('domain: "goal"');
    expect(v3Source).toContain('domain: "savings"');
    // No manufactured entity ids — these stay generic bare routes.
    expect(v3Source).toContain('ctaRoute: "/goals"');
  });

  // Action Identity & Dedup Correctness patch additions below.

  // Semantic Issue Identity patch: issueKey must never be derived from
  // route/domain shape — each source assigns an explicit semantic
  // issueKind at candidate-creation time instead.

  it("v3AdvisorActions assigns an explicit semantic issueKind per action, never derived from its ctaRoute", () => {
    const v3Start = source.indexOf("const v3AdvisorActions = useMemo(");
    expect(v3Start).toBeGreaterThan(-1);
    const v3End = source.indexOf("const priorityActionCandidates", v3Start);
    const v3Source = source.slice(v3Start, v3End);

    expect(v3Source).toContain('issueKind: "emergency-fund"');
    expect(v3Source).toContain('issueKind: "goals-progress"');
    expect(v3Source).toContain('issueKind: "saving-rate"');
    expect(v3Source).toContain("composeIssueIdentity(issueKind, action.ctaRoute)");
  });

  it("aiActions derives its semantic issueKind from domain via deriveAggregateIssueKind, then composes identity the same way v3 does — not domain-only, not route-only", () => {
    const mergeCallIndex = source.indexOf("selectDashboardPriorityActions([");
    expect(mergeCallIndex).toBeGreaterThan(-1);
    const mergeWindow = source.slice(mergeCallIndex, mergeCallIndex + 700);

    expect(mergeWindow).toContain("deriveAggregateIssueKind(domain)");
    expect(mergeWindow).toContain("composeIssueIdentity(");
  });

  it("the import list includes composeIssueIdentity and deriveAggregateIssueKind alongside the selection policy", () => {
    const importIndex = source.indexOf(
      '"@/src/lib/dashboard/dashboardActionPriority"',
    );
    expect(importIndex).toBeGreaterThan(-1);
    const importWindow = source.slice(
      Math.max(0, importIndex - 200),
      importIndex,
    );
    expect(importWindow).toContain("composeIssueIdentity");
    expect(importWindow).toContain("deriveAggregateIssueKind");
    expect(importWindow).toContain("selectDashboardPriorityActions");
  });

  it("the old route-suffixed identity pattern (domain:route as the aggregate key) is gone", () => {
    // Regression for the exact bug this patch fixes: an aggregate action's
    // issueKey must never be built by concatenating domain + ctaRoute.
    expect(source).not.toContain("deriveIssueIdentity");
  });

  it("the Action Center rendering still enforces the max-3 cap and untouched ActionCard wiring", () => {
    expect(source).toContain("Tối đa 3 việc quan trọng");
    expect(source).toContain("priorityActions.map((action, index) => (");
    expect(source).toContain("onNavigate={router.push}");
  });
});
