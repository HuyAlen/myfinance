import { describe, expect, it } from "vitest";
import {
  composeIssueIdentity,
  deriveAggregateIssueKind,
  extractEntityId,
  selectDashboardPriorityActions,
  type DashboardActionCandidate,
} from "./dashboardActionPriority";

function candidate(
  overrides: Partial<DashboardActionCandidate> & {
    domain: DashboardActionCandidate["domain"];
    issueKey: string;
  },
): DashboardActionCandidate {
  return {
    title: "title",
    body: "body",
    tone: "warning",
    isContextual: false,
    ...overrides,
  };
}

describe("extractEntityId", () => {
  it("finds a known entity-id param in the query string", () => {
    expect(extractEntityId("/budgets?budgetId=b1")).toBe("b1");
    expect(extractEntityId("/goals?goalId=g1")).toBe("g1");
  });

  it("returns null for a bare route with no query", () => {
    expect(extractEntityId("/goals")).toBeNull();
  });

  it("returns null for a query string with no recognized entity-id param", () => {
    expect(extractEntityId("/transactions?type=expense")).toBeNull();
  });

  it("returns null when there is no ctaRoute at all", () => {
    expect(extractEntityId(undefined)).toBeNull();
  });
});

describe("composeIssueIdentity", () => {
  it("same issueKind, different destination routes: identical issueKey — route never defines identity", () => {
    // This is the core regression: v3's "saving rate is great" action
    // (→ /goals) and generateDashboardActions' "saving rate still needs
    // work" action (→ /transactions) are the SAME financial observation.
    const a = composeIssueIdentity("saving-rate", "/goals");
    const b = composeIssueIdentity("saving-rate", "/transactions");

    expect(a.issueKey).toBe(b.issueKey);
    expect(a.issueKey).toBe("saving-rate");
    expect(a.isContextual).toBe(false);
    expect(b.isContextual).toBe(false);
  });

  it("emergency-fund identity does not depend on the route, even if the destination changes", () => {
    const a = composeIssueIdentity("emergency-fund", "/goals");
    const b = composeIssueIdentity("emergency-fund", "/savings");

    expect(a.issueKey).toBe(b.issueKey);
    expect(a.issueKey).toBe("emergency-fund");
  });

  it("an entity id in the route makes the issueKey entity-specific and contextual", () => {
    const result = composeIssueIdentity("budget-over", "/budgets?budgetId=b1");
    expect(result).toEqual({ issueKey: "budget-over:b1", isContextual: true });
  });

  it("two different entity ids under the same issueKind yield two different issueKeys", () => {
    const a = composeIssueIdentity("budget-over", "/budgets?budgetId=A");
    const b = composeIssueIdentity("budget-over", "/budgets?budgetId=B");
    expect(a.issueKey).not.toBe(b.issueKey);
  });

  it("issueKey is never equal to the raw ctaRoute", () => {
    const withEntity = composeIssueIdentity("budget-over", "/budgets?budgetId=b1");
    const aggregate = composeIssueIdentity("saving-rate", "/goals");

    expect(withEntity.issueKey).not.toBe("/budgets?budgetId=b1");
    expect(aggregate.issueKey).not.toBe("/goals");
  });
});

describe("deriveAggregateIssueKind", () => {
  it("maps the two saving-rate severity tiers (savings, shield) to the same semantic kind", () => {
    expect(deriveAggregateIssueKind("savings")).toBe("saving-rate");
    expect(deriveAggregateIssueKind("shield")).toBe("saving-rate");
  });

  it("maps the two debt-ratio severity tiers (debt, bank) to the same semantic kind", () => {
    expect(deriveAggregateIssueKind("debt")).toBe("debt-ratio");
    expect(deriveAggregateIssueKind("bank")).toBe("debt-ratio");
  });

  it("maps emergency, goal, budget, investment domains to their semantic kinds", () => {
    expect(deriveAggregateIssueKind("emergency")).toBe("emergency-fund");
    expect(deriveAggregateIssueKind("goal")).toBe("goals-progress");
    expect(deriveAggregateIssueKind("budget")).toBe("budget-over");
    expect(deriveAggregateIssueKind("investment")).toBe("investment-return");
  });

  it("falls back to the domain itself for domains with no explicit mapping", () => {
    expect(deriveAggregateIssueKind("alert")).toBe("alert");
  });
});

describe("selectDashboardPriorityActions", () => {
  it("generic-only candidates: all pass through untouched (up to the cap)", () => {
    const generic = [
      candidate({ domain: "alert", issueKey: "alert", tone: "danger" }),
      candidate({ domain: "debt", issueKey: "debt-ratio", tone: "warning" }),
    ];

    expect(selectDashboardPriorityActions(generic)).toHaveLength(2);
  });

  it("contextual-only candidates: all pass through untouched, entity identities preserved", () => {
    const contextual = [
      candidate({
        domain: "budget",
        issueKey: "budget-over:b1",
        tone: "danger",
        isContextual: true,
      }),
      candidate({
        domain: "goal",
        issueKey: "goals-progress:g1",
        tone: "warning",
        isContextual: true,
      }),
    ];

    const result = selectDashboardPriorityActions(contextual);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.issueKey)).toEqual([
      "budget-over:b1",
      "goals-progress:g1",
    ]);
  });

  it("historical bug regression: both sources present with no issue overlap — neither source is discarded wholesale", () => {
    const generic = [
      candidate({ domain: "savings", issueKey: "saving-rate", tone: "good" }),
    ];
    const contextual = [
      candidate({
        domain: "budget",
        issueKey: "budget-over:b1",
        tone: "danger",
        isContextual: true,
      }),
    ];

    const result = selectDashboardPriorityActions([...generic, ...contextual]);

    expect(result).toHaveLength(2);
    expect(result.some((r) => r.domain === "budget")).toBe(true);
    expect(result.some((r) => r.domain === "savings")).toBe(true);
  });

  it("the saving-rate regression: a 'good' saving-rate action and a 'warning' saving-rate action from two sources dedupe to ONE — warning survives", () => {
    // Reachable at savingRate = 35%: v3's >=30% "good" branch and
    // generateDashboardActions' 20-39% "warning" branch are both true.
    const v3GoodSavingRate = candidate({
      domain: "savings",
      ...composeIssueIdentity("saving-rate", "/goals"),
      title: "Tỷ lệ tiết kiệm & đầu tư rất tốt",
      tone: "good",
    });
    const aiWarningSavingRate = candidate({
      domain: "savings",
      ...composeIssueIdentity(deriveAggregateIssueKind("savings"), "/transactions"),
      title: "Tang them tiet kiem",
      tone: "warning",
    });

    const result = selectDashboardPriorityActions([
      v3GoodSavingRate,
      aiWarningSavingRate,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].tone).toBe("warning");
    expect(result[0].title).toBe("Tang them tiet kiem");
  });

  it("emergency-fund route independence: same issue, different destinations — dedupes to one", () => {
    const fromV3 = candidate({
      domain: "emergency",
      ...composeIssueIdentity("emergency-fund", "/goals"),
      tone: "warning",
    });
    const fromAi = candidate({
      domain: "emergency",
      ...composeIssueIdentity("emergency-fund", "/savings"),
      tone: "danger",
    });

    const result = selectDashboardPriorityActions([fromV3, fromAi]);

    expect(result).toHaveLength(1);
    expect(result[0].tone).toBe("danger");
  });

  it("same domain, different budget: both survive", () => {
    const budgetA = candidate({
      domain: "budget",
      issueKey: "budget-over:A",
      tone: "danger",
      isContextual: true,
    });
    const budgetB = candidate({
      domain: "budget",
      issueKey: "budget-over:B",
      tone: "danger",
      isContextual: true,
    });

    expect(selectDashboardPriorityActions([budgetA, budgetB])).toHaveLength(2);
  });

  it("same domain, different goal: both survive", () => {
    const goalA = candidate({
      domain: "goal",
      issueKey: "goals-progress:A",
      tone: "warning",
      isContextual: true,
    });
    const goalB = candidate({
      domain: "goal",
      issueKey: "goals-progress:B",
      tone: "warning",
      isContextual: true,
    });

    expect(selectDashboardPriorityActions([goalA, goalB])).toHaveLength(2);
  });

  it("aggregate goal health and one specific goal's issue remain distinct (never collapsed by shared domain)", () => {
    const aggregateGoalHealth = candidate({
      domain: "goal",
      issueKey: "goals-progress",
      tone: "warning",
    });
    const specificGoal = candidate({
      domain: "goal",
      issueKey: "goals-progress:g1",
      tone: "warning",
      isContextual: true,
    });

    const result = selectDashboardPriorityActions([
      aggregateGoalHealth,
      specificGoal,
    ]);

    expect(result).toHaveLength(2);
  });

  it("same entity duplicated across sources (same issueKey): only one survives", () => {
    const fromSourceA = candidate({
      domain: "budget",
      issueKey: "budget-over:A",
      title: "source A",
      tone: "danger",
      isContextual: true,
    });
    const fromSourceB = candidate({
      domain: "budget",
      issueKey: "budget-over:A",
      title: "source B",
      tone: "danger",
      isContextual: true,
    });

    expect(
      selectDashboardPriorityActions([fromSourceA, fromSourceB]),
    ).toHaveLength(1);
  });

  it("same issue, generic + contextual, equal severity: the contextual candidate survives", () => {
    const generic = candidate({
      domain: "goal",
      issueKey: "goals-progress:g1",
      title: "generic",
      tone: "warning",
      isContextual: false,
    });
    const contextual = candidate({
      domain: "goal",
      issueKey: "goals-progress:g1",
      title: "contextual",
      tone: "warning",
      isContextual: true,
    });

    const result = selectDashboardPriorityActions([generic, contextual]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("contextual");
  });

  it("same issue, danger generic beats warning contextual: severity wins over contextuality", () => {
    const dangerGeneric = candidate({
      domain: "budget",
      issueKey: "budget-over:b1",
      title: "danger generic",
      tone: "danger",
      isContextual: false,
    });
    const warningContextual = candidate({
      domain: "budget",
      issueKey: "budget-over:b1",
      title: "warning contextual",
      tone: "warning",
      isContextual: true,
    });

    const result = selectDashboardPriorityActions([
      warningContextual,
      dangerGeneric,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("danger generic");
  });

  it("mixed distinct actions: nothing collapses by domain — all remain distinct before the cap, top 3 by severity survive", () => {
    const budgetA = candidate({
      domain: "budget",
      issueKey: "budget-over:A",
      tone: "danger",
      isContextual: true,
    });
    const budgetB = candidate({
      domain: "budget",
      issueKey: "budget-over:B",
      tone: "warning",
      isContextual: true,
    });
    const goalA = candidate({
      domain: "goal",
      issueKey: "goals-progress:A",
      tone: "warning",
      isContextual: true,
    });
    const emergency = candidate({
      domain: "emergency",
      issueKey: "emergency-fund",
      tone: "warning",
    });
    const savingRate = candidate({
      domain: "savings",
      issueKey: "saving-rate",
      tone: "good",
    });

    const result = selectDashboardPriorityActions([
      budgetA,
      budgetB,
      goalA,
      emergency,
      savingRate,
    ]);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.issueKey)).toEqual([
      "budget-over:A",
      "budget-over:B",
      "goals-progress:A",
    ]);
  });

  it("5 distinct issues: capped at 3, dedup guarantees the cap never wastes a slot on a duplicate", () => {
    const candidates = [
      candidate({ domain: "alert", issueKey: "alert", tone: "good" }),
      candidate({ domain: "debt", issueKey: "debt-ratio", tone: "danger" }),
      candidate({ domain: "emergency", issueKey: "emergency-fund", tone: "danger" }),
      candidate({
        domain: "budget",
        issueKey: "budget-over:b1",
        tone: "warning",
        isContextual: true,
      }),
      candidate({
        domain: "goal",
        issueKey: "goals-progress:g1",
        tone: "warning",
        isContextual: true,
      }),
    ];

    const result = selectDashboardPriorityActions(candidates);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.domain)).toEqual(["debt", "emergency", "budget"]);
  });

  it("respects a custom maxActions", () => {
    const candidates = [
      candidate({ domain: "alert", issueKey: "alert", tone: "danger" }),
      candidate({ domain: "debt", issueKey: "debt-ratio", tone: "danger" }),
    ];

    expect(selectDashboardPriorityActions(candidates, 1)).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const candidates = [
      candidate({ domain: "alert", issueKey: "alert", tone: "danger" }),
      candidate({ domain: "debt", issueKey: "debt-ratio", tone: "warning" }),
    ];
    const snapshot = [...candidates];

    selectDashboardPriorityActions(candidates);

    expect(candidates).toEqual(snapshot);
  });

  it("empty input yields empty output", () => {
    expect(selectDashboardPriorityActions([])).toEqual([]);
  });
});
