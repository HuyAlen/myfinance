import { describe, expect, it } from "vitest";
import { isHeroReady, shouldMarkReady } from "./dashboardReadiness";

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
