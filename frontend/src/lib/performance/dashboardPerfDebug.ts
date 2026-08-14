/**
 * PERF-4 Runtime Query Timing & Performance Observability.
 *
 * A small, console-only diagnostic utility for the Dashboard's data-loading
 * path (see DashboardPage.tsx's reloadData/reloadPeriod). It answers "which
 * network read is actually slow" and "how long until each readiness
 * milestone is reached" without changing any query behavior, fetch count,
 * or PERF-2/PERF-3 readiness/race semantics — this module only observes.
 *
 * Deliberately separate from performanceReporter.ts: that module already
 * ships a handful of curated metrics (auth_ready, dashboard_snapshot,
 * dashboard_critical_ready, Core Web Vitals) to a server endpoint via
 * sendBeacon/fetch in production. Reusing that transport for a dozen+
 * fine-grained per-query events per Dashboard load would multiply
 * production network requests — exactly what this sprint must avoid (see
 * "Avoid Instrumentation Distortion"). This module is console-only: no
 * network requests, no Supabase writes, disabled by default.
 *
 * Privacy: only query names, durations, statuses, operation ids/triggers,
 * and selectedYear are ever emitted. Never a balance, amount, description,
 * note, account/goal/category name, token, or raw query response.
 */

export type DashboardOperationTrigger = "initial" | "realtime" | "year_change";

export type DashboardQueryStatus = "success" | "error" | "stale";

export type DashboardOperationKind = "full" | "period";

export type DashboardOperationContext = {
  operationId: string;
  trigger: DashboardOperationTrigger;
};

/**
 * Enablement is read once per module load (env vars are inlined at build
 * time for NEXT_PUBLIC_* values anyway, so this can never change at
 * runtime). Off by default — see PERF-4's final report for the exact
 * enablement procedure.
 */
function readEnabledFlag(): boolean {
  return process.env.NEXT_PUBLIC_PERF_QUERY_DEBUG === "true";
}

let enabledOverride: boolean | null = null;
const isDashboardPerfDebugEnabledDefault = readEnabledFlag();

/** Exposed for tests only — production code should never call this. */
export function __setDashboardPerfDebugEnabledForTests(
  value: boolean | null,
): void {
  enabledOverride = value;
}

export function isDashboardPerfDebugEnabled(): boolean {
  return enabledOverride ?? isDashboardPerfDebugEnabledDefault;
}

function now(): number {
  if (typeof performance === "undefined" || typeof performance.now !== "function") {
    return 0;
  }
  return performance.now();
}

let fullOperationCounter = 0;
let periodOperationCounter = 0;

/** A local monotonically increasing per-kind counter — unique enough to
 * correlate parallel logs within one browser session/tab. Never a UUID,
 * never derived from a user/auth identifier. */
export function nextDashboardOperationId(kind: DashboardOperationKind): string {
  if (kind === "full") {
    fullOperationCounter += 1;
    return `dashboard-full-${fullOperationCounter}`;
  }
  periodOperationCounter += 1;
  return `dashboard-period-${periodOperationCounter}`;
}

/** Exposed for tests only, so operation-id sequencing tests don't leak
 * counter state across test files. */
export function __resetDashboardOperationCountersForTests(): void {
  fullOperationCounter = 0;
  periodOperationCounter = 0;
}

function safeConsoleDebug(...args: unknown[]): void {
  try {
    console.debug(...args);
  } catch {
    // Diagnostics must never throw or break the app.
  }
}

type PerfEventBase = {
  scope: "dashboard-performance";
  operationId: string;
  trigger: DashboardOperationTrigger;
};

type QueryCompleteEvent = PerfEventBase & {
  event: "query_complete";
  query: string;
  durationMs: number;
  status: DashboardQueryStatus;
};

type MilestoneEvent = PerfEventBase & {
  event: "milestone";
  milestone: string;
  durationMs: number;
};

type OperationStartEvent = PerfEventBase & {
  event: "operation_start";
  selectedYear: number;
};

type PerfEvent = QueryCompleteEvent | MilestoneEvent | OperationStartEvent;

function emitPerfEvent(perfEvent: PerfEvent): void {
  if (!isDashboardPerfDebugEnabled()) return;
  safeConsoleDebug("[finance-perf]", perfEvent);
}

export function logDashboardOperationStart(
  ctx: DashboardOperationContext,
  selectedYear: number,
): void {
  emitPerfEvent({
    scope: "dashboard-performance",
    event: "operation_start",
    operationId: ctx.operationId,
    trigger: ctx.trigger,
    selectedYear,
  });
}

export function emitDashboardMilestone(
  ctx: DashboardOperationContext,
  milestone: string,
  durationMs: number,
): void {
  emitPerfEvent({
    scope: "dashboard-performance",
    event: "milestone",
    operationId: ctx.operationId,
    trigger: ctx.trigger,
    milestone,
    durationMs: Math.round(durationMs),
  });
}

/**
 * PERF-4 Query Outcome Correctness patch.
 *
 * Some direct Supabase calls (savings, saving_transactions, forex_equity in
 * DashboardPage.tsx) resolve their Promise successfully even when the
 * query itself failed — the failure is represented as a fulfilled
 * `{ data, error }` result, not a rejection. Left unhandled, that would
 * make measureDashboardQuery log `status: "success"` for a query that
 * actually failed. `hasSupabaseQueryError`/`supabaseResultStatus` let a
 * call site opt into classifying that shape; callers that already
 * throw/reject on failure (most of financeStorage.ts's getX() functions)
 * don't need this — their failure already surfaces as a rejection, which
 * this wrapper already classifies as "error" via the catch branch below.
 *
 * This is detection only: it never inspects payload contents beyond
 * checking whether `.error` is non-null, and it never changes what value
 * is returned to the caller.
 */
export function hasSupabaseQueryError(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as { error: unknown }).error != null
  );
}

export function supabaseResultStatus(
  result: unknown,
): "success" | "error" {
  return hasSupabaseQueryError(result) ? "error" : "success";
}

/**
 * Wraps a single business query call to measure its duration without
 * altering its resolution/rejection behavior. `fn` is invoked exactly once,
 * synchronously, at the same point the unwrapped call would have happened
 * — so this is a drop-in replacement for `const xPromise = getX();` with
 * identical fetch count, ordering, and concurrency. The exact value/error
 * `fn()` produces is always returned/rethrown unchanged — this wrapper
 * only ever decides what to LABEL the outcome as.
 *
 * Status precedence on the fulfilled path: a superseded (stale) request
 * always reports "stale" regardless of what the result contains — PERF-3's
 * generation guard is the authority on whether this result is even still
 * relevant, so it's checked first. Otherwise, `opts.getStatus` (if
 * provided) classifies the fulfilled value itself — e.g. detecting a
 * fulfilled Supabase `{ data, error }` failure — and only falls back to
 * "success" when neither applies. A Promise rejection is always "error",
 * checked independently in the catch branch (rejection is exclusive with
 * the fulfilled-path checks above, since only one of the two branches ever
 * runs for a given call).
 */
export async function measureDashboardQuery<T>(
  queryName: string,
  ctx: DashboardOperationContext,
  fn: () => PromiseLike<T>,
  opts: {
    isStale?: () => boolean;
    getStatus?: (result: T) => "success" | "error";
  } = {},
): Promise<T> {
  if (!isDashboardPerfDebugEnabled()) {
    return fn();
  }

  const startedAt = now();
  try {
    const result = await fn();
    const durationMs = now() - startedAt;
    const status: DashboardQueryStatus = opts.isStale?.()
      ? "stale"
      : opts.getStatus?.(result) ?? "success";
    emitPerfEvent({
      scope: "dashboard-performance",
      event: "query_complete",
      operationId: ctx.operationId,
      trigger: ctx.trigger,
      query: queryName,
      durationMs: Math.round(durationMs),
      status,
    });
    return result;
  } catch (error) {
    const durationMs = now() - startedAt;
    emitPerfEvent({
      scope: "dashboard-performance",
      event: "query_complete",
      operationId: ctx.operationId,
      trigger: ctx.trigger,
      query: queryName,
      durationMs: Math.round(durationMs),
      status: "error",
    });
    throw error;
  }
}

export { now as dashboardPerfNow };
