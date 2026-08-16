import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 *
 * ReportsPage has no single empty-state CTA — every chart/KPI falls back
 * independently on its own zero-length derived array. Rather than gate
 * each one, the fix withholds the ENTIRE report body (all ~600 lines of
 * derived useMemos and JSX) behind one page-level loading/error gate,
 * leaving the existing body completely untouched once loaded.
 */
describe("ReportsPage withholds the whole report body until first load succeeds (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "ReportsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingReports (default true) and reportsLoadError state", () => {
    expect(source).toContain("useState(true)");
    expect(source).toContain("isLoadingReports");
    expect(source).toContain("reportsLoadError");
  });

  it("load() clears the error on success and sets a message on failure, without touching any of the ten data arrays", () => {
    const start = source.indexOf("async function load() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("load();", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setReportsLoadError(null);");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setReportsLoadError(");
    expect(catchSource).toContain("setIsLoadingReports(false);");
    for (const setter of [
      "setWallets([",
      "setInvestments([",
      "setCategories([",
      "setTransactions([",
      "setDebts([",
      "setGoals([",
      "setBudgets([",
      "setForexAccounts([",
      "setForexCashTransactions([",
      "setSavings([",
    ]) {
      expect(catchSource).not.toContain(setter);
    }
  });

  it("the whole component body is gated behind isLoadingReports / reportsLoadError before the real return", () => {
    expect(normalized).toContain("if (isLoadingReports) { return (");
    expect(normalized).toContain("if (reportsLoadError) { return (");
    // The real body's outer wrapper must appear only after both gates.
    const gateIdx = normalized.indexOf("if (isLoadingReports)");
    const bodyIdx = normalized.indexOf(
      '<div className="space-y-5 overflow-x-hidden md:space-y-6 print:space-y-4">',
    );
    expect(gateIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(gateIdx);
  });

  it("no hooks are declared after the loading/error early returns (rules-of-hooks safety)", () => {
    const gateIdx = source.indexOf("if (isLoadingReports) {");
    expect(gateIdx).toBeGreaterThan(-1);
    const rest = source.slice(gateIdx);
    const hookCalls = ["useState(", "useEffect(", "useMemo(", "useCallback("];
    for (const hook of hookCalls) {
      expect(rest.indexOf(hook)).toBe(-1);
    }
  });

  // FINANCE-DATA-1C: load() also bundles a raw supabase.from("savings")
  // read alongside the nine hardened financeStorage readers. The Final
  // Re-Audit found its `.error` was checked only to guard the setSavings
  // call — no logging, no propagation — while reportsLoadError was
  // cleared unconditionally right after, so savings-derived report
  // sections could silently show stale/empty data while the whole report
  // body asserted a successful load. These tests prove the raw read is
  // now validated the same way as every other dependency — by throwing —
  // before any state for this load cycle is committed.
  describe("FINANCE-DATA-1C: raw savings sub-query failure semantics", () => {
    const start = source.indexOf("async function load() {");
    const end = source.indexOf("load();", start);
    const fnSource = source.slice(start, end);

    it("throws on a failed raw savings read instead of silently guarding the setter", () => {
      expect(fnSource).toContain("if (savingResult.error) {");
      const checkIdx = fnSource.indexOf("if (savingResult.error) {");
      const throwRegion = fnSource.slice(checkIdx, checkIdx + 120);
      expect(throwRegion).toContain("throw savingResult.error;");
      expect(fnSource).not.toContain("if (!savingResult.error)");
    });

    it("validates the savings dependency before committing ANY of the ten arrays for this load cycle (atomic load)", () => {
      const checkIdx = fnSource.indexOf("if (savingResult.error) {");
      expect(checkIdx).toBeGreaterThan(-1);
      for (const setter of [
        "setWallets(w)",
        "setInvestments(inv)",
        "setCategories(cat)",
        "setTransactions(txn)",
        "setDebts(dbt)",
        "setGoals(gls)",
        "setBudgets(bdg)",
        "setForexAccounts(fxAcc)",
        "setForexCashTransactions(fxTxn)",
        "setSavings(",
        "setReportsLoadError(null)",
      ]) {
        expect(fnSource.indexOf(setter)).toBeGreaterThan(checkIdx);
      }
    });
  });
});
