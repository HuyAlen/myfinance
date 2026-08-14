import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginPeriodGeneration,
  isNewPeriodContext,
  isStalePeriodGeneration,
  shouldMarkReady,
  type PeriodGenerationRef,
} from "@/src/lib/dashboard/dashboardReadiness";
import {
  __resetDashboardOperationCountersForTests,
  __setDashboardPerfDebugEnabledForTests,
  emitDashboardMilestone,
  nextDashboardOperationId,
  type DashboardOperationContext,
} from "./dashboardPerfDebug";

/**
 * PERF-4 Hero Freshness Ownership patch.
 *
 * The prior Hero Milestone Operation Semantics patch fixed the missing
 * Realtime dashboard_hero_ready by moving emission out of a
 * useEffect([isDashboardReady, cashFlowReady]) into operation-local code
 * inside reloadData/reloadPeriod. But its Cash Flow freshness signal
 * (`cashFlowFreshlyValidRef`) was a SHARED, component-level ref written by
 * BOTH reloadData's own cashFlow group AND reloadPeriod. That allowed a
 * concurrent PERIOD operation's fresh success to certify a FULL
 * operation's Net Worth-side check, even when the full operation's OWN
 * period work was stale or had never resolved — i.e. one operation's
 * freshness could certify a DIFFERENT operation's Hero milestone.
 *
 * Concrete race this fixes: Hero already valid. Full operation A starts
 * (bumping the shared PERF-3 period generation). Before A's own
 * transactions resolve, period operation B starts (bumping the generation
 * again, superseding A). B succeeds and is current — B may legitimately
 * emit its own dashboard_hero_ready. A's own transactions then resolve,
 * but they are now stale (superseded by B) and never touch A's Cash Flow
 * freshness. A's Net Worth succeeds afterward. Under the OLD shared-ref
 * design, A's Net Worth check would see the shared ref (set true by B)
 * and incorrectly emit dashboard_hero_ready for A — even though A itself
 * never validated its own Cash Flow. This is exactly the "cross-operation
 * ownership" scenario tested below (see "6."), and it MUST fail against
 * the old shared-ref implementation.
 *
 * The fix: Cash Flow freshness for a FULL operation is now a plain local
 * variable, declared fresh inside each reloadData call by ordinary JS
 * scoping — unreachable from any other operation, full or period. A
 * period operation still legitimately reuses the CURRENT snapshot Net
 * Worth validity (via the isDashboardReadyRef mirror) for its own
 * attribution, per PERF-3's "snapshot persists across year changes"
 * architecture — that asymmetry (full operations must self-validate both
 * sides; period operations may reuse Net Worth but never donate Cash Flow
 * to someone else) is intentional and is exactly what "6." vs "7." lock.
 */
function makeDashboardSimulation() {
  const periodGenerationRef: PeriodGenerationRef = { current: 0 };
  const loadedPeriodYearRef: { current: number | null } = { current: null };
  const hasLoadedCashFlowRef = { current: false };
  const hasLoadedNetWorthRef = { current: false };
  const isDashboardReadyRef = { current: false };
  const cashFlowReadyRef = { current: false };

  const heroEmissions: DashboardOperationContext[] = [];

  function emitHero(
    ctx: DashboardOperationContext,
    operationStartedAt: number,
    nowTs: number,
  ) {
    heroEmissions.push({ ...ctx });
    emitDashboardMilestone(ctx, "dashboard_hero_ready", nowTs - operationStartedAt);
  }

  // Mirrors reloadData(trigger). Cash Flow AND Net Worth freshness are
  // BOTH plain locals here — nothing outside this closure can read or
  // write them, exactly like the real `let` declarations inside
  // reloadData.
  function startFullOperation(trigger: "initial" | "realtime", startedAt: number) {
    const ctx: DashboardOperationContext = {
      operationId: nextDashboardOperationId("full"),
      trigger,
    };
    const periodGeneration = beginPeriodGeneration(periodGenerationRef);

    let networthFreshlyValidated = false;
    let cashFlowFreshlyValidated = false;
    let heroReadyEmitted = false;
    function maybeMarkHeroReady(nowTs: number) {
      if (heroReadyEmitted) return;
      if (!networthFreshlyValidated || !cashFlowFreshlyValidated) return;
      heroReadyEmitted = true;
      emitHero(ctx, startedAt, nowTs);
    }

    return {
      ctx,
      resolveCashFlow(outcome: "success" | "failure", nowTs: number) {
        if (isStalePeriodGeneration(periodGenerationRef, periodGeneration)) {
          return { applied: false as const, stale: true as const };
        }
        if (outcome === "success") {
          cashFlowReadyRef.current = true;
          hasLoadedCashFlowRef.current = true;
          cashFlowFreshlyValidated = true;
          maybeMarkHeroReady(nowTs);
          return { applied: true as const, stale: false as const };
        }
        if (hasLoadedCashFlowRef.current) {
          // Last-known-good preserve — UI stays usable, but this is NOT a
          // fresh revalidation, so cashFlowFreshlyValidated intentionally
          // stays false for THIS operation.
          cashFlowReadyRef.current = true;
        }
        return { applied: false as const, stale: false as const };
      },
      resolveNetWorth(outcome: "success" | "failure", nowTs: number) {
        if (outcome === "success") {
          isDashboardReadyRef.current = true;
          hasLoadedNetWorthRef.current = true;
          networthFreshlyValidated = true;
          maybeMarkHeroReady(nowTs);
        } else if (hasLoadedNetWorthRef.current) {
          isDashboardReadyRef.current = true; // last-known-good preserve
        }
      },
    };
  }

  // Mirrors reloadPeriod(year). Never writes anything a full operation's
  // Cash Flow check could read — only reuses the CURRENT Net Worth
  // validity (isDashboardReadyRef), which is legitimate because Net Worth
  // is outside a period operation's scope entirely (PERF-3).
  function startPeriodOperation(year: number, startedAt: number) {
    const ctx: DashboardOperationContext = {
      operationId: nextDashboardOperationId("period"),
      trigger: "year_change",
    };
    const generation = beginPeriodGeneration(periodGenerationRef);
    if (isNewPeriodContext(loadedPeriodYearRef.current, year)) {
      hasLoadedCashFlowRef.current = false;
      cashFlowReadyRef.current = false;
    }

    return {
      ctx,
      resolveTransactions(outcome: "success" | "failure", nowTs: number) {
        if (isStalePeriodGeneration(periodGenerationRef, generation)) {
          return { applied: false as const, stale: true as const };
        }
        if (outcome === "success") {
          loadedPeriodYearRef.current = year;
          if (shouldMarkReady(true, hasLoadedCashFlowRef.current)) {
            cashFlowReadyRef.current = true;
            hasLoadedCashFlowRef.current = true;
          }
          if (isDashboardReadyRef.current) {
            emitHero(ctx, startedAt, nowTs);
          }
          return { applied: true as const, stale: false as const };
        }
        if (hasLoadedCashFlowRef.current) {
          cashFlowReadyRef.current = true; // last-known-good preserve
        }
        return { applied: false as const, stale: false as const };
      },
    };
  }

  return {
    startFullOperation,
    startPeriodOperation,
    heroEmissions,
    get isDashboardReady() {
      return isDashboardReadyRef.current;
    },
    get cashFlowReady() {
      return cashFlowReadyRef.current;
    },
    get loadedPeriodYear() {
      return loadedPeriodYearRef.current;
    },
  };
}

function milestoneCalls(
  debugSpy: ReturnType<typeof vi.spyOn>,
  milestone?: string,
) {
  return debugSpy.mock.calls.filter(([, payload]: [unknown, unknown]) => {
    const p = payload as { event?: string; milestone?: string };
    return p?.event === "milestone" && (!milestone || p.milestone === milestone);
  });
}

describe("dashboard_hero_ready freshness ownership", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDashboardOperationCountersForTests();
    __setDashboardPerfDebugEnabledForTests(true);
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    __setDashboardPerfDebugEnabledForTests(null);
    debugSpy.mockRestore();
  });

  it("1. full operation success, Net Worth then Cash Flow: hero_ready exactly once", () => {
    const sim = makeDashboardSimulation();
    const full = sim.startFullOperation("initial", 0);
    full.resolveNetWorth("success", 10);
    expect(sim.heroEmissions).toHaveLength(0);
    full.resolveCashFlow("success", 20);
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(full.ctx);
  });

  it("2. full operation success, Cash Flow then Net Worth: hero_ready exactly once", () => {
    const sim = makeDashboardSimulation();
    const full = sim.startFullOperation("initial", 0);
    full.resolveCashFlow("success", 10);
    expect(sim.heroEmissions).toHaveLength(0);
    full.resolveNetWorth("success", 20);
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(full.ctx);
  });

  it("3. full operation Cash Flow failure: NO hero_ready, even though last-known-good keeps the UI flag true", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const realtime = sim.startFullOperation("realtime", 500);
    realtime.resolveCashFlow("failure", 540);
    realtime.resolveNetWorth("success", 560);

    expect(sim.cashFlowReady).toBe(true); // last-known-good
    expect(sim.heroEmissions).toHaveLength(0);
    expect(milestoneCalls(debugSpy, "dashboard_hero_ready")).toHaveLength(0);
  });

  it("4. full operation Net Worth failure: NO hero_ready in either resolution order", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const orderA = sim.startFullOperation("realtime", 500);
    orderA.resolveCashFlow("success", 520);
    orderA.resolveNetWorth("failure", 560);
    expect(sim.heroEmissions).toHaveLength(0);

    const orderB = sim.startFullOperation("realtime", 700);
    orderB.resolveNetWorth("failure", 710);
    orderB.resolveCashFlow("success", 760);
    expect(sim.heroEmissions).toHaveLength(0);

    expect(milestoneCalls(debugSpy, "dashboard_hero_ready")).toHaveLength(0);
  });

  it("5. full operation's own period branch goes stale: NO hero_ready even though its Net Worth succeeds fresh", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const A = sim.startFullOperation("realtime", 500);
    // A period operation starts after A and supersedes A's own period
    // generation before A's transactions resolve.
    const superseding = sim.startPeriodOperation(2026, 510);
    superseding.resolveTransactions("success", 540);

    const cashFlowResult = A.resolveCashFlow("success", 600); // resolves LATE, now stale
    expect(cashFlowResult.stale).toBe(true);

    A.resolveNetWorth("success", 650);

    expect(sim.heroEmissions).toHaveLength(1); // only the superseding period op's
    expect(sim.heroEmissions[0]).not.toEqual(A.ctx);
    const heroOperationIds = milestoneCalls(debugSpy, "dashboard_hero_ready").map(
      (call: [unknown, unknown]) => (call[1] as { operationId: string }).operationId,
    );
    expect(heroOperationIds).not.toContain(A.ctx.operationId);
  });

  it("6. cross-operation ownership: a concurrent period operation's fresh Cash Flow must NOT certify a full operation's Hero — this MUST fail against the old shared-ref design", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    // Full A starts.
    const A = sim.startFullOperation("realtime", 500);
    // Period B starts after A and supersedes A's period generation.
    const B = sim.startPeriodOperation(2026, 510);

    // B succeeds and is current — B may legitimately emit its own hero.
    const bResult = B.resolveTransactions("success", 550);
    expect(bResult.applied).toBe(true);
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(B.ctx);

    // A's own transactions resolve afterward but are now stale — they
    // never validate A's own Cash Flow.
    const aCashFlowResult = A.resolveCashFlow("success", 560);
    expect(aCashFlowResult.stale).toBe(true);

    // A's Net Worth succeeds fresh.
    A.resolveNetWorth("success", 600);

    // A must NOT emit hero_ready — its own Cash Flow was never validated,
    // regardless of B's unrelated success.
    expect(sim.heroEmissions).toHaveLength(1); // still just B's
    expect(sim.heroEmissions.map((e) => e.operationId)).not.toContain(
      A.ctx.operationId,
    );
    expect(sim.heroEmissions.map((e) => e.operationId)).toContain(
      B.ctx.operationId,
    );
  });

  it("7. legitimate reuse: a period operation MAY use the current valid snapshot Net Worth (not required to refetch it) — this is the one direction reuse is allowed", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20); // establishes snapshot validity
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const period = sim.startPeriodOperation(2025, 100);
    const result = period.resolveTransactions("success", 140);

    expect(result.applied).toBe(true);
    // Net worth was NOT re-fetched by this period operation, yet its
    // hero_ready still fires — legitimate reuse of already-valid snapshot
    // state, per PERF-3.
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(period.ctx);
  });

  it("8. Realtime success while Hero already true: a NEW hero_ready is emitted exactly once for the realtime operation", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    expect(sim.heroEmissions).toHaveLength(1);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const realtime = sim.startFullOperation("realtime", 500);
    realtime.resolveNetWorth("success", 540);
    realtime.resolveCashFlow("success", 560);

    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(realtime.ctx);
    expect(realtime.ctx.trigger).toBe("realtime");
    expect(realtime.ctx.operationId).not.toBe(initial.ctx.operationId);
  });

  it("9. rapid year switch: the superseded period operation cannot emit period_ready/cashflow_ready-equivalent state or hero_ready; the current one gets everything", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    const periodB = sim.startPeriodOperation(2025, 200);
    const periodC = sim.startPeriodOperation(2024, 210); // supersedes B

    const resultC = periodC.resolveTransactions("success", 250);
    expect(resultC.applied).toBe(true);
    expect(sim.loadedPeriodYear).toBe(2024);
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(periodC.ctx);

    const callCountBeforeB = debugSpy.mock.calls.length;
    const resultB = periodB.resolveTransactions("success", 400);
    expect(resultB.applied).toBe(false);
    expect(resultB.stale).toBe(true);
    expect(sim.loadedPeriodYear).toBe(2024); // unchanged by B
    expect(sim.heroEmissions).toHaveLength(1); // still just C's
    expect(debugSpy.mock.calls.length).toBe(callCountBeforeB); // B emitted nothing
  });

  it("10. dedup per operation: repeated completion checks after already emitting produce exactly one event", () => {
    const sim = makeDashboardSimulation();
    const full = sim.startFullOperation("initial", 0);
    full.resolveNetWorth("success", 10);
    full.resolveCashFlow("success", 20);
    expect(sim.heroEmissions).toHaveLength(1);

    full.resolveNetWorth("success", 30);
    full.resolveCashFlow("success", 40);
    expect(sim.heroEmissions).toHaveLength(1);
  });

  it("11. independent full operations remain isolated: two concurrent full operations each emit only if THEY individually satisfy both requirements", () => {
    const sim = makeDashboardSimulation();
    const initial = sim.startFullOperation("initial", 0);
    initial.resolveCashFlow("success", 10);
    initial.resolveNetWorth("success", 20);
    debugSpy.mockClear();
    sim.heroEmissions.length = 0;

    // A starts, then C starts before A's own period work resolves —
    // A's cashflow will go stale (superseded by C's generation bump).
    const A = sim.startFullOperation("realtime", 500);
    const C = sim.startFullOperation("realtime", 510);

    // C fully succeeds on its own.
    C.resolveNetWorth("success", 560);
    C.resolveCashFlow("success", 570);
    expect(sim.heroEmissions).toHaveLength(1);
    expect(sim.heroEmissions[0]).toEqual(C.ctx);

    // A's own cashflow, resolving after C started, is now stale — A must
    // not benefit from C's success.
    const aResult = A.resolveCashFlow("success", 580);
    expect(aResult.stale).toBe(true);
    A.resolveNetWorth("success", 590);

    expect(sim.heroEmissions).toHaveLength(1); // still just C's
    expect(sim.heroEmissions.map((e) => e.operationId)).not.toContain(
      A.ctx.operationId,
    );
  });

  it("query outcome correctness (savings/saving_transactions/forex_equity classification) is unaffected by this patch", async () => {
    const { measureDashboardQuery, supabaseResultStatus } = await import(
      "./dashboardPerfDebug"
    );
    const errorResult = { data: null, error: { message: "boom" } };
    const fn = vi.fn().mockResolvedValue(errorResult);
    const returned = await measureDashboardQuery(
      "savings",
      { operationId: "dashboard-full-1", trigger: "initial" },
      fn,
      { getStatus: supabaseResultStatus },
    );
    expect(returned).toBe(errorResult);
    const queryCalls = debugSpy.mock.calls.filter(
      ([, payload]: [unknown, unknown]) =>
        (payload as { event?: string })?.event === "query_complete",
    );
    expect(queryCalls[0][1]).toMatchObject({ query: "savings", status: "error" });
  });

  it("a genuinely stale query_complete for a superseded year may still be logged as 'stale' — distinct from readiness milestones", async () => {
    const { measureDashboardQuery } = await import("./dashboardPerfDebug");
    const fn = vi.fn().mockResolvedValue("2025-transactions");
    await measureDashboardQuery(
      "transactions",
      { operationId: "dashboard-period-99", trigger: "year_change" },
      fn,
      { isStale: () => true },
    );
    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({ event: "query_complete", status: "stale" });
    expect(payload).not.toMatchObject({ event: "milestone" });
  });
});
