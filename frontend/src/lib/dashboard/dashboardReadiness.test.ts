import { describe, expect, it } from "vitest";
import {
  beginPeriodGeneration,
  isHeroReady,
  isNewPeriodContext,
  isPeriodSnapshotCurrent,
  isStalePeriodGeneration,
  shouldMarkReady,
} from "./dashboardReadiness";
import type { PeriodGenerationRef } from "./dashboardReadiness";

/**
 * PERF-2 KPI Readiness Correctness patch: locks in the exact three-state
 * distinction a rejected/errored first fetch must never collapse into
 * "ready with a fabricated empty/zero value".
 */
describe("shouldMarkReady", () => {
  it("first successful load: ready", () => {
    expect(shouldMarkReady(true, false)).toBe(true);
  });

  it("first load fails, no prior snapshot: NOT ready — must not fabricate a zero", () => {
    expect(shouldMarkReady(false, false)).toBe(false);
  });

  it("later reload fails after a prior success: stays ready (last-known snapshot)", () => {
    expect(shouldMarkReady(false, true)).toBe(true);
  });

  it("later reload succeeds again after a prior success: ready", () => {
    expect(shouldMarkReady(true, true)).toBe(true);
  });
});

/**
 * PERF-2 Hero Readiness Final patch: the Hero section (Net Worth headline,
 * liquidity/investment/debt/Forex-capital HeroMinis, cash-flow badge) is
 * ready only when BOTH its real dependency groups — the Net Worth bundle
 * and Cash Flow — are ready. Neither alone is sufficient.
 */
describe("isHeroReady", () => {
  it("neither Net Worth nor Cash Flow ready: Hero not ready", () => {
    expect(isHeroReady(false, false)).toBe(false);
  });

  it("Net Worth ready, Cash Flow not ready: Hero not ready — the cash-flow badge would be wrong", () => {
    expect(isHeroReady(true, false)).toBe(false);
  });

  it("Cash Flow ready, Net Worth not ready: Hero not ready — Net Worth/liquidity/debt would be wrong", () => {
    expect(isHeroReady(false, true)).toBe(false);
  });

  it("both ready: Hero ready", () => {
    expect(isHeroReady(true, true)).toBe(true);
  });

  it("end-to-end: first load succeeds with a genuine canonical zero on both groups — Hero ready, zero is real (not unresolved)", () => {
    const netWorthReady = shouldMarkReady(true, false); // succeeded, value happens to be 0
    const cashFlowReady = shouldMarkReady(true, false);
    expect(isHeroReady(netWorthReady, cashFlowReady)).toBe(true);
  });

  it("end-to-end: first load fails on both groups — Hero not ready, no fabricated zero", () => {
    const netWorthReady = shouldMarkReady(false, false);
    const cashFlowReady = shouldMarkReady(false, false);
    expect(isHeroReady(netWorthReady, cashFlowReady)).toBe(false);
  });

  it("end-to-end: prior success, then Cash Flow fails on a later reload — Hero stays ready with the last-known-good snapshot", () => {
    const netWorthReady = shouldMarkReady(true, true); // still succeeding
    const cashFlowReady = shouldMarkReady(false, true); // failed this cycle, but succeeded before
    expect(isHeroReady(netWorthReady, cashFlowReady)).toBe(true);
  });

  it("end-to-end: prior success, then Net Worth fails on a later reload with Cash Flow never having loaded before — Hero not ready", () => {
    const netWorthReady = shouldMarkReady(false, true); // failed this cycle, succeeded before
    const cashFlowReady = shouldMarkReady(false, false); // never succeeded
    expect(isHeroReady(netWorthReady, cashFlowReady)).toBe(false);
  });
});

/**
 * PERF-3 Snapshot vs Period Data Loading: locks in exactly which
 * loaded-year/requested-year combinations count as "a different period
 * context" — the trigger for resetting the period-dependent readiness
 * flags/last-known-good refs so a new year can never display the old
 * year's data.
 */
describe("isNewPeriodContext", () => {
  it("no period has ever loaded (null): not a context change — nothing to mismatch against", () => {
    expect(isNewPeriodContext(null, 2026)).toBe(false);
  });

  it("requested year matches the already-loaded year: same context", () => {
    expect(isNewPeriodContext(2026, 2026)).toBe(false);
  });

  it("requested year differs from the already-loaded year: a genuine context change", () => {
    expect(isNewPeriodContext(2025, 2026)).toBe(true);
  });

  it("switching back to a previously-loaded year is still a context change relative to the CURRENT context", () => {
    // isNewPeriodContext only compares against what's loaded right now — it
    // has no memory of years visited earlier in the session. Switching from
    // 2026 back to 2025 is exactly as much a context change as any other.
    expect(isNewPeriodContext(2026, 2025)).toBe(true);
  });
});

/**
 * PERF-3 Final Period Surface Correctness patch: the positive-form
 * predicate that justifies gating netWorthTrend/netWorthChartStats, the
 * Cash Flow panel (income/expense/chart/50-30-20), and top-spending
 * categories on the existing cashFlowReady/heroReady flags instead of
 * rendering `transactions` unconditionally. `isPeriodSnapshotCurrent` is
 * the exact logical negation of `isNewPeriodContext` — both must always
 * agree.
 */
describe("isPeriodSnapshotCurrent", () => {
  it("no period has ever loaded (null): never current — there is nothing loaded to be valid", () => {
    expect(isPeriodSnapshotCurrent(null, 2026)).toBe(false);
  });

  it("loaded year matches the requested/selected year: current", () => {
    expect(isPeriodSnapshotCurrent(2025, 2025)).toBe(true);
  });

  it("loaded year differs from the requested/selected year (a pending cross-year switch): NOT current", () => {
    expect(isPeriodSnapshotCurrent(2026, 2025)).toBe(false);
  });

  it("is the exact logical negation of isNewPeriodContext for every combination", () => {
    const years = [null, 2023, 2024, 2025, 2026] as const;
    for (const loadedYear of years) {
      for (const requestedYear of [2023, 2024, 2025, 2026]) {
        if (loadedYear === null) {
          // Both predicates are false when nothing has loaded — "not a
          // context change" and "not currently valid" are simultaneously
          // true statements about an empty state, not opposites of each
          // other, in this one edge case.
          expect(isNewPeriodContext(loadedYear, requestedYear)).toBe(false);
          expect(isPeriodSnapshotCurrent(loadedYear, requestedYear)).toBe(
            false,
          );
        } else {
          expect(isPeriodSnapshotCurrent(loadedYear, requestedYear)).toBe(
            !isNewPeriodContext(loadedYear, requestedYear),
          );
        }
      }
    }
  });
});

/**
 * PERF-3 race-generation review: the raw generation-counter mechanics.
 */
describe("beginPeriodGeneration / isStalePeriodGeneration", () => {
  it("each call to beginPeriodGeneration claims a strictly increasing id", () => {
    const ref: PeriodGenerationRef = { current: 0 };
    const first = beginPeriodGeneration(ref);
    const second = beginPeriodGeneration(ref);
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(second).toBeGreaterThan(first);
  });

  it("a generation is NOT stale relative to itself before anything newer starts", () => {
    const ref: PeriodGenerationRef = { current: 0 };
    const generation = beginPeriodGeneration(ref);
    expect(isStalePeriodGeneration(ref, generation)).toBe(false);
  });

  it("a generation becomes stale the instant a newer one is claimed", () => {
    const ref: PeriodGenerationRef = { current: 0 };
    const older = beginPeriodGeneration(ref);
    beginPeriodGeneration(ref);
    expect(isStalePeriodGeneration(ref, older)).toBe(true);
  });

  it("ONE generation shared by several branches of the same logical operation: none of them are stale against each other", () => {
    // This is the mandatory "PER LOGICAL LOAD, not PER GROUP" invariant:
    // reloadData claims a single generation once, and all four period-
    // dependent readiness groups (cashFlow/goals/emergencyFund/
    // savingInvestment) capture that SAME id — none of them may claim
    // their own, or a sibling group finishing later would incorrectly look
    // "stale" relative to one that finished first.
    const ref: PeriodGenerationRef = { current: 0 };
    const sharedGeneration = beginPeriodGeneration(ref);
    const groupACapturedId = sharedGeneration;
    const groupBCapturedId = sharedGeneration;
    const groupCCapturedId = sharedGeneration;

    expect(isStalePeriodGeneration(ref, groupACapturedId)).toBe(false);
    expect(isStalePeriodGeneration(ref, groupBCapturedId)).toBe(false);
    expect(isStalePeriodGeneration(ref, groupCCapturedId)).toBe(false);
  });
});

/**
 * PERF-3 race-generation review: end-to-end orchestration simulation.
 *
 * DashboardPage's reloadData/reloadPeriod are too coupled to React state
 * and Supabase to unit test directly, so this simulates the exact shape of
 * their period-loading logic — one generation claimed per logical
 * operation via beginPeriodGeneration, a staleness check via
 * isStalePeriodGeneration immediately after the awaited fetch resolves,
 * shouldMarkReady for last-known-good semantics, and isNewPeriodContext
 * for cross-year invalidation — driven by controllable (deferred) promises
 * so resolution order can be forced deterministically. This is written so
 * that removing any of the staleness/context guards inside `reloadPeriod`
 * below makes the corresponding test fail.
 */
describe("period-loader orchestration (simulates reloadData/reloadPeriod)", () => {
  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function makePeriodLoader(fetchTransactions: (year: number) => Promise<string>) {
    const generationRef: PeriodGenerationRef = { current: 0 };
    const loadedYearRef: { current: number | null } = { current: null };
    const hasLoadedCashFlow = { current: false };
    const state = {
      transactions: null as string | null,
      cashFlowReady: false,
    };

    async function reloadPeriod(year: number) {
      const generation = beginPeriodGeneration(generationRef);
      if (isNewPeriodContext(loadedYearRef.current, year)) {
        hasLoadedCashFlow.current = false;
        state.cashFlowReady = false;
      }
      try {
        const txn = await fetchTransactions(year);
        if (isStalePeriodGeneration(generationRef, generation)) return;
        state.transactions = txn;
        loadedYearRef.current = year;
        if (shouldMarkReady(true, hasLoadedCashFlow.current)) {
          state.cashFlowReady = true;
          hasLoadedCashFlow.current = true;
        }
      } catch {
        if (isStalePeriodGeneration(generationRef, generation)) return;
        if (hasLoadedCashFlow.current) state.cashFlowReady = true;
      }
    }

    return { reloadPeriod, state, loadedYearRef, hasLoadedCashFlow };
  }

  it("Scenario B — normal year switch: transactions/loadedYear/readiness all reflect the new year", async () => {
    const loader = makePeriodLoader((year) => Promise.resolve(`txn-${year}`));
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025);

    expect(loader.state.transactions).toBe("txn-2025");
    expect(loader.loadedYearRef.current).toBe(2025);
    expect(loader.state.cashFlowReady).toBe(true);
  });

  it("Scenario C — rapid switch: an older (2025) response resolving AFTER a newer (2024) one must not overwrite it", async () => {
    const deferreds = new Map<number, ReturnType<typeof createDeferred<string>>>();
    const loader = makePeriodLoader((year) => {
      const deferred = createDeferred<string>();
      deferreds.set(year, deferred);
      return deferred.promise;
    });
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    const requestA2025 = loader.reloadPeriod(2025);
    const requestB2024 = loader.reloadPeriod(2024);

    // 2024 (the newer request) resolves first and is accepted.
    deferreds.get(2024)!.resolve("txn-2024");
    await requestB2024;
    expect(loader.state.transactions).toBe("txn-2024");
    expect(loader.loadedYearRef.current).toBe(2024);

    // 2025 (the older, superseded request) resolves after — it must be a
    // complete no-op for period state.
    deferreds.get(2025)!.resolve("txn-2025");
    await requestA2025;
    expect(loader.state.transactions).toBe("txn-2024");
    expect(loader.loadedYearRef.current).toBe(2024);
  });

  it("Scenario E — cross-year failure: a failed new-year fetch cannot certify the new year or keep showing the old year's readiness", async () => {
    const loader = makePeriodLoader(() => Promise.reject(new Error("network error")));
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025);

    // The failed 2025 fetch never applied — loadedYearRef still reflects
    // the last YEAR THAT ACTUALLY SUCCEEDED, and readiness is false rather
    // than fabricating a "2025 ready" state or leaking 2026's numbers
    // through as if they belonged to 2025.
    expect(loader.loadedYearRef.current).toBe(2026);
    expect(loader.state.cashFlowReady).toBe(false);
  });

  it("Scenario F — same-year later failure: a transient retry failure preserves the existing last-known-good readiness", async () => {
    const loader = makePeriodLoader(() => Promise.reject(new Error("transient error")));
    loader.loadedYearRef.current = 2025;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025);

    // Same context (2025 -> 2025): the failure must not invalidate what
    // was already successfully loaded for this exact year.
    expect(loader.state.cashFlowReady).toBe(true);
    expect(loader.loadedYearRef.current).toBe(2025);
  });

  it("Scenario G — switching back to a previously-visited year re-fetches rather than reusing a stale cached value", async () => {
    let fetchCount = 0;
    const loader = makePeriodLoader((year) => {
      fetchCount += 1;
      return Promise.resolve(`txn-${year}-fetch${fetchCount}`);
    });

    await loader.reloadPeriod(2026);
    expect(loader.state.transactions).toBe("txn-2026-fetch1");

    await loader.reloadPeriod(2025);
    expect(loader.state.transactions).toBe("txn-2025-fetch2");

    await loader.reloadPeriod(2026);
    // A THIRD network call happened — there is no cache serving the
    // previously-seen 2026 value back out.
    expect(fetchCount).toBe(3);
    expect(loader.state.transactions).toBe("txn-2026-fetch3");
    expect(loader.loadedYearRef.current).toBe(2026);
  });

  it("a stale in-flight full-reload's period branch cannot resurrect its old year after a newer year-switch has already been accepted", async () => {
    // Simulates Scenario D: mount starts a full reload for 2026 whose
    // transaction fetch is still pending when the user switches to 2025.
    const deferreds = new Map<number, ReturnType<typeof createDeferred<string>>>();
    const loader = makePeriodLoader((year) => {
      const deferred = createDeferred<string>();
      deferreds.set(year, deferred);
      return deferred.promise;
    });

    const mountFullReload2026 = loader.reloadPeriod(2026); // starts, doesn't resolve yet
    const yearSwitch2025 = loader.reloadPeriod(2025); // supersedes it

    deferreds.get(2025)!.resolve("txn-2025");
    await yearSwitch2025;
    expect(loader.state.transactions).toBe("txn-2025");
    expect(loader.loadedYearRef.current).toBe(2025);

    deferreds.get(2026)!.resolve("txn-2026");
    await mountFullReload2026;
    // The old 2026 request resolving afterward must not restore 2026.
    expect(loader.state.transactions).toBe("txn-2025");
    expect(loader.loadedYearRef.current).toBe(2025);
  });

  /**
   * PERF-3 Final Period Surface Correctness patch.
   *
   * netWorthTrend/netWorthChartStats and the Cash Flow panel (income/
   * expense/chart/50-30-20) both read `transactions` directly and, prior
   * to this patch, rendered unconditionally with no readiness/context
   * gate at all — unlike the KPI cards, which were already gated. These
   * four tests prove that `cashFlowReady` — the flag DashboardPage now
   * uses to gate those surfaces — always agrees with
   * `isPeriodSnapshotCurrent(loadedYear, selectedYear)`, i.e. that gating
   * on it is equivalent to gating directly on "does the accepted
   * transaction snapshot belong to the selected year". Each test fails if
   * a future change removes the staleness/context guard inside
   * `reloadPeriod` and lets `cashFlowReady` drift out of sync with reality.
   */
  it("Test 1 — cross-year pending: the render gate must be false while the new year's transactions are still in flight", async () => {
    const deferred = createDeferred<string>();
    const loader = makePeriodLoader(() => deferred.promise);
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    const pending = loader.reloadPeriod(2025); // selectedYear is now 2025, request not resolved yet

    // Before the fetch resolves: the accepted snapshot (2026) does not
    // match the selected year (2025) — the render gate must reflect that,
    // exactly matching cashFlowReady having already been reset to false.
    expect(
      isPeriodSnapshotCurrent(loader.loadedYearRef.current, 2025),
    ).toBe(false);
    expect(loader.state.cashFlowReady).toBe(false);

    deferred.resolve("txn-2025");
    await pending;
  });

  it("Test 2 — successful new-year load: the render gate becomes true once 2025's transactions are accepted", async () => {
    const loader = makePeriodLoader((year) => Promise.resolve(`txn-${year}`));
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025);

    expect(
      isPeriodSnapshotCurrent(loader.loadedYearRef.current, 2025),
    ).toBe(true);
    expect(loader.state.cashFlowReady).toBe(true);
  });

  it("Test 3 — cross-year failure: the render gate stays false and the stale 2026 snapshot is never treated as valid 2025 data", async () => {
    const loader = makePeriodLoader(() => Promise.reject(new Error("network error")));
    loader.loadedYearRef.current = 2026;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025);

    // loadedYearRef never advanced to 2025, so the gate correctly stays
    // false for the now-selected year (2025) — even though 2026's
    // transactions are technically still sitting in state, they must
    // never be presented as this year's (2025's) data.
    expect(
      isPeriodSnapshotCurrent(loader.loadedYearRef.current, 2025),
    ).toBe(false);
    expect(loader.state.cashFlowReady).toBe(false);
    expect(loader.loadedYearRef.current).toBe(2026);
  });

  it("Test 4 — same-context refresh failure: the render gate preserves the existing valid last-known-good snapshot", async () => {
    const loader = makePeriodLoader(() => Promise.reject(new Error("transient error")));
    loader.loadedYearRef.current = 2025;
    loader.hasLoadedCashFlow.current = true;
    loader.state.cashFlowReady = true;

    await loader.reloadPeriod(2025); // same year — a transient retry, not a switch

    expect(
      isPeriodSnapshotCurrent(loader.loadedYearRef.current, 2025),
    ).toBe(true);
    expect(loader.state.cashFlowReady).toBe(true);
  });
});
