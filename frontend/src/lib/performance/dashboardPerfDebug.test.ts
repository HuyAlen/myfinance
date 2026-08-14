import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  __resetDashboardOperationCountersForTests,
  __setDashboardPerfDebugEnabledForTests,
  emitDashboardMilestone,
  hasSupabaseQueryError,
  logDashboardOperationStart,
  measureDashboardQuery,
  nextDashboardOperationId,
  supabaseResultStatus,
} from "./dashboardPerfDebug";

/**
 * PERF-4: this module is console-only observability with zero network
 * requests and zero effect on query behavior when disabled. These tests
 * lock the two properties everything else in the sprint depends on: (1)
 * diagnostics are fully inert unless explicitly enabled, and (2) when
 * enabled, they measure/relabel without ever altering resolution/rejection
 * behavior or leaking a query's actual result payload.
 */
describe("dashboardPerfDebug", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDashboardOperationCountersForTests();
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    __setDashboardPerfDebugEnabledForTests(null);
    debugSpy.mockRestore();
  });

  describe("disabled (default)", () => {
    beforeEach(() => {
      __setDashboardPerfDebugEnabledForTests(false);
    });

    it("emits nothing for an operation-start log", () => {
      logDashboardOperationStart(
        { operationId: "dashboard-full-1", trigger: "initial" },
        2026,
      );
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("emits nothing for a milestone", () => {
      emitDashboardMilestone(
        { operationId: "dashboard-full-1", trigger: "initial" },
        "dashboard_networth_ready",
        123,
      );
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("measureDashboardQuery still calls the query and returns its value, but emits nothing", async () => {
      const fn = vi.fn().mockResolvedValue("wallet-rows");
      const result = await measureDashboardQuery(
        "wallets",
        { operationId: "dashboard-full-1", trigger: "initial" },
        fn,
      );
      expect(result).toBe("wallet-rows");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(debugSpy).not.toHaveBeenCalled();
    });
  });

  describe("enabled", () => {
    beforeEach(() => {
      __setDashboardPerfDebugEnabledForTests(true);
    });

    it("emits a structured operation_start event", () => {
      logDashboardOperationStart(
        { operationId: "dashboard-full-1", trigger: "initial" },
        2026,
      );
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const [, payload] = debugSpy.mock.calls[0];
      expect(payload).toMatchObject({
        scope: "dashboard-performance",
        event: "operation_start",
        operationId: "dashboard-full-1",
        trigger: "initial",
        selectedYear: 2026,
      });
    });

    it("emits a structured milestone event with a rounded duration", () => {
      emitDashboardMilestone(
        { operationId: "dashboard-full-1", trigger: "initial" },
        "dashboard_cashflow_ready",
        842.7,
      );
      const [, payload] = debugSpy.mock.calls[0];
      expect(payload).toMatchObject({
        scope: "dashboard-performance",
        event: "milestone",
        operationId: "dashboard-full-1",
        milestone: "dashboard_cashflow_ready",
        durationMs: 843,
      });
    });

    it("async success: emits duration + success status, and returns the resolved value unchanged", async () => {
      const fn = vi.fn().mockResolvedValue({ rows: 3 });
      const result = await measureDashboardQuery(
        "wallets",
        { operationId: "dashboard-full-1", trigger: "initial" },
        fn,
      );
      expect(result).toEqual({ rows: 3 });
      const [, payload] = debugSpy.mock.calls[0];
      expect(payload).toMatchObject({
        event: "query_complete",
        query: "wallets",
        status: "success",
      });
      expect(typeof (payload as { durationMs: number }).durationMs).toBe(
        "number",
      );
    });

    it("async failure: emits duration + error status, and the ORIGINAL error still propagates to the caller", async () => {
      const boom = new Error("network down");
      const fn = vi.fn().mockRejectedValue(boom);

      await expect(
        measureDashboardQuery(
          "transactions",
          { operationId: "dashboard-full-1", trigger: "initial" },
          fn,
        ),
      ).rejects.toBe(boom);

      const [, payload] = debugSpy.mock.calls[0];
      expect(payload).toMatchObject({
        event: "query_complete",
        query: "transactions",
        status: "error",
      });
    });

    it("a query that succeeds but is superseded (isStale) is labeled 'stale', not 'success' — and still returns its value", async () => {
      const fn = vi.fn().mockResolvedValue("2025-transactions");
      const result = await measureDashboardQuery(
        "transactions",
        { operationId: "dashboard-period-1", trigger: "year_change" },
        fn,
        { isStale: () => true },
      );
      expect(result).toBe("2025-transactions");
      const [, payload] = debugSpy.mock.calls[0];
      expect(payload).toMatchObject({
        event: "query_complete",
        query: "transactions",
        status: "stale",
      });
    });

    it("operation ids increment per kind and correlate calls for the same logical operation", () => {
      const full1 = nextDashboardOperationId("full");
      const period1 = nextDashboardOperationId("period");
      const full2 = nextDashboardOperationId("full");

      expect(full1).toBe("dashboard-full-1");
      expect(period1).toBe("dashboard-period-1");
      expect(full2).toBe("dashboard-full-2");

      // Two events tagged with the SAME operation id are correlatable —
      // this is what lets a log reader group a query_complete with the
      // milestone(s) it contributed to.
      const ctx = { operationId: full1, trigger: "initial" as const };
      logDashboardOperationStart(ctx, 2026);
      emitDashboardMilestone(ctx, "dashboard_networth_ready", 10);
      const [, startPayload] = debugSpy.mock.calls[0];
      const [, milestonePayload] = debugSpy.mock.calls[1];
      expect((startPayload as { operationId: string }).operationId).toBe(
        (milestonePayload as { operationId: string }).operationId,
      );
    });

    it("this module does not deduplicate milestones itself — a NEW operation may legitimately re-emit the same milestone name (dedup is the caller's per-operation responsibility)", () => {
      const opA = { operationId: "dashboard-full-1", trigger: "initial" as const };
      const opB = {
        operationId: "dashboard-period-1",
        trigger: "year_change" as const,
      };
      emitDashboardMilestone(opA, "dashboard_cashflow_ready", 100);
      emitDashboardMilestone(opB, "dashboard_cashflow_ready", 50);
      expect(debugSpy).toHaveBeenCalledTimes(2);
    });

    it("emitted telemetry never includes the query's actual result payload", async () => {
      const sensitiveResult = {
        data: [{ id: "w1", balance: 999_999_999 }],
        error: null,
      };
      const fn = vi.fn().mockResolvedValue(sensitiveResult);
      await measureDashboardQuery(
        "wallets",
        { operationId: "dashboard-full-1", trigger: "initial" },
        fn,
      );

      const [, payload] = debugSpy.mock.calls[0];
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain("999999999");
      expect(serialized).not.toContain("balance");
      expect(payload).not.toHaveProperty("data");
      expect(payload).not.toHaveProperty("result");
    });
  });
});

/**
 * PERF-4 Query Outcome Correctness patch.
 *
 * savings/saving_transactions/forex_equity call Supabase directly and
 * resolve `{ data, error }` on failure instead of rejecting. Without a
 * classifier, measureDashboardQuery would log these as "success" even
 * though the query failed. `getStatus`/`hasSupabaseQueryError` fix that —
 * these tests lock the exact precedence (stale > business-error >
 * success), that the original result is always returned/rethrown
 * unchanged, and that the raw error payload is never logged.
 */
describe("hasSupabaseQueryError / supabaseResultStatus", () => {
  it("a fulfilled result with error: null is not an error", () => {
    expect(hasSupabaseQueryError({ data: [{ id: 1 }], error: null })).toBe(
      false,
    );
    expect(supabaseResultStatus({ data: [{ id: 1 }], error: null })).toBe(
      "success",
    );
  });

  it("a fulfilled result with a non-null error is an error", () => {
    const result = { data: null, error: { message: "boom" } };
    expect(hasSupabaseQueryError(result)).toBe(true);
    expect(supabaseResultStatus(result)).toBe("error");
  });

  it("a plain array (financeStorage.ts's getX() shape) is never mistaken for an error", () => {
    // getWallets/getCategories/getDebts/etc. already swallow Supabase
    // errors internally and resolve to a plain T[] — there is no `.error`
    // to inspect, so the classifier must not misclassify these.
    expect(hasSupabaseQueryError([{ id: "w1" }])).toBe(false);
    expect(supabaseResultStatus([])).toBe("success");
  });

  it("does not misclassify null/undefined/primitive results", () => {
    expect(hasSupabaseQueryError(null)).toBe(false);
    expect(hasSupabaseQueryError(undefined)).toBe(false);
    expect(hasSupabaseQueryError("some-string")).toBe(false);
  });
});

describe("measureDashboardQuery — fulfilled-result outcome classification", () => {
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

  it("Test A — normal fulfilled result: status success, result returned unchanged", async () => {
    const result = { data: [{ id: 1 }], error: null };
    const fn = vi.fn().mockResolvedValue(result);

    const returned = await measureDashboardQuery(
      "savings",
      { operationId: "dashboard-full-1", trigger: "initial" },
      fn,
      { getStatus: supabaseResultStatus },
    );

    expect(returned).toBe(result);
    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({ query: "savings", status: "success" });
    expect(JSON.stringify(payload)).not.toContain('"data"');
  });

  it("Test B — fulfilled Supabase-style error: resolves normally, telemetry says error, no sensitive fields leak", async () => {
    const sensitiveError = {
      message: "sensitive simulated error",
      details: "some internal detail",
      hint: "some hint",
      code: "23505",
    };
    const result = { data: null, error: sensitiveError };
    const fn = vi.fn().mockResolvedValue(result);

    const returned = await measureDashboardQuery(
      "saving_transactions",
      { operationId: "dashboard-full-1", trigger: "initial" },
      fn,
      { getStatus: supabaseResultStatus },
    );

    // The wrapper never throws for this shape — it resolves normally with
    // the EXACT original object.
    expect(returned).toBe(result);

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({
      query: "saving_transactions",
      status: "error",
    });
    expect(typeof (payload as { durationMs: number }).durationMs).toBe(
      "number",
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("sensitive simulated error");
    expect(serialized).not.toContain("some internal detail");
    expect(serialized).not.toContain("some hint");
    expect(serialized).not.toContain("23505");
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("details");
    expect(payload).not.toHaveProperty("hint");
    expect(payload).not.toHaveProperty("code");
    expect(payload).not.toHaveProperty("error");
    expect(payload).not.toHaveProperty("data");
  });

  it("Test C — Promise rejection is unaffected by getStatus: status error, original error still rejects, not swallowed", async () => {
    const originalError = new Error("connection reset");
    const fn = vi.fn().mockRejectedValue(originalError);

    await expect(
      measureDashboardQuery(
        "forex_equity",
        { operationId: "dashboard-full-1", trigger: "initial" },
        fn,
        { getStatus: supabaseResultStatus },
      ),
    ).rejects.toBe(originalError);

    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({ query: "forex_equity", status: "error" });
  });

  it("Test D — stale takes precedence over getStatus: a superseded request is 'stale' even if the fulfilled result also looks like a business error", async () => {
    const result = { data: null, error: { message: "would be an error" } };
    const fn = vi.fn().mockResolvedValue(result);

    await measureDashboardQuery(
      "transactions",
      { operationId: "dashboard-period-2", trigger: "year_change" },
      fn,
      { isStale: () => true, getStatus: supabaseResultStatus },
    );

    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({ query: "transactions", status: "stale" });
    expect(payload).not.toMatchObject({ status: "success" });
    expect(payload).not.toMatchObject({ status: "error" });
  });

  it("a fulfilled business-error result that is NOT stale is 'error', not 'success' — isStale=false must not mask getStatus", async () => {
    const result = { data: null, error: { message: "genuine failure" } };
    const fn = vi.fn().mockResolvedValue(result);

    await measureDashboardQuery(
      "savings",
      { operationId: "dashboard-full-2", trigger: "realtime" },
      fn,
      { isStale: () => false, getStatus: supabaseResultStatus },
    );

    const [, payload] = debugSpy.mock.calls[0];
    expect(payload).toMatchObject({ query: "savings", status: "error" });
  });
});
