import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 */
describe("GoalsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "GoalsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingGoals and goalsLoadError state", () => {
    expect(source).toContain("isLoadingGoals");
    expect(source).toContain("goalsLoadError");
  });

  it("reloadData clears the error on success and sets a message on failure, without touching goals state", () => {
    const start = source.indexOf("async function reloadData() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("useEffect(", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setGoalsLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setGoalsLoadError(");
    expect(catchSource).not.toContain("setGoals([])");
    expect(catchSource).toContain("setIsLoadingGoals(false)");
  });

  it("splits the empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain("{goals.length === 0 && isLoadingGoals && (");
    expect(normalized).toContain(
      "{goals.length === 0 && !isLoadingGoals && goalsLoadError && (",
    );
    expect(normalized).toContain(
      "{goals.length === 0 && !isLoadingGoals && !goalsLoadError && (",
    );
  });

  it("the legitimate-empty branch still shows the original copy", () => {
    expect(source).toContain("Chưa có mục tiêu nào");
  });

  it("leaves the positive-only progress-section gate (goals.length > 0) untouched", () => {
    expect(source).toContain("goals.length > 0");
  });

  // FINANCE-DATA-1C: reloadData also bundles a raw supabase.from("savings")
  // read alongside getGoals/getTransactions. The Final Re-Audit found that
  // its `.error` was checked only to guard the setSavings call — with no
  // `else`, no logging, and no propagation — while goalsLoadError was
  // cleared unconditionally right after, so a genuine failure of THIS
  // specific sub-query was invisible and `savings` silently stayed at its
  // stale/initial [], which selectedSavingsAmount/selectedTotal then treat
  // as a validated (false) zero. These tests prove the fix: the raw read
  // is validated the same way the hardened `financeStorage` readers are —
  // by throwing — before any state for this load cycle is committed.
  describe("FINANCE-DATA-1C: raw savings sub-query failure semantics", () => {
    const start = source.indexOf("async function reloadData() {");
    const end = source.indexOf("useEffect(", start);
    const fnSource = source.slice(start, end);

    it("throws on a failed raw savings read instead of silently guarding the setter", () => {
      expect(fnSource).toContain("if (savingRows.error) {");
      const checkIdx = fnSource.indexOf("if (savingRows.error) {");
      const throwRegion = fnSource.slice(checkIdx, checkIdx + 120);
      expect(throwRegion).toContain("throw savingRows.error;");
      // The old silent-guard shape must be gone — no bare "if (!savingRows.error)".
      expect(fnSource).not.toContain("if (!savingRows.error)");
    });

    it("validates the savings dependency before committing ANY state for this load cycle (atomic load)", () => {
      const checkIdx = fnSource.indexOf("if (savingRows.error) {");
      const setGoalsIdx = fnSource.indexOf("setGoals(nextGoals)");
      const setTransactionsIdx = fnSource.indexOf("setTransactions(nextTransactions)");
      const setSavingsIdx = fnSource.indexOf("setSavings(");
      const clearErrorIdx = fnSource.indexOf("setGoalsLoadError(null)");

      expect(checkIdx).toBeGreaterThan(-1);
      expect(setGoalsIdx).toBeGreaterThan(checkIdx);
      expect(setTransactionsIdx).toBeGreaterThan(checkIdx);
      expect(setSavingsIdx).toBeGreaterThan(checkIdx);
      expect(clearErrorIdx).toBeGreaterThan(checkIdx);
    });

    it("a failed savings read does not reset savings/goals/transactions to []", () => {
      const catchIdx = fnSource.indexOf("} catch (error) {");
      const catchSource = fnSource.slice(catchIdx);
      expect(catchSource).not.toContain("setSavings([])");
      expect(catchSource).not.toContain("setGoals([])");
      expect(catchSource).not.toContain("setTransactions([])");
    });
  });
});
