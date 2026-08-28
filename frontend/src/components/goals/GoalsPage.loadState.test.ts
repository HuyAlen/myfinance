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

  // GOAL-SAVINGS-SSOT-1: Savings now comes through the hardened financeStorage
  // reader instead of a raw Supabase sub-query. Promise.all remains the atomic
  // load boundary: no Goals/Goal-funding-transactions/Savings state is committed
  // until all three required sources resolve successfully.
  describe("GOAL-SAVINGS-SSOT-1: canonical savings dependency semantics", () => {
    const start = source.indexOf("async function reloadData() {");
    const end = source.indexOf("useEffect(", start);
    const fnSource = source.slice(start, end);

    it("loads Savings through financeStorage inside the same Promise.all snapshot", () => {
      expect(fnSource).toContain("await Promise.all([");
      expect(fnSource).toContain("getGoals(),");
      expect(fnSource).toContain("getGoalFundingTransactions(),");
      expect(fnSource).toContain("getSavings(),");
      expect(fnSource).not.toContain('.from("savings")');
    });

    it("commits goals, transactions and savings only after Promise.all resolves", () => {
      const awaitIdx = fnSource.indexOf("await Promise.all([");
      const setGoalsIdx = fnSource.indexOf("setGoals(nextGoals)");
      const setTransactionsIdx = fnSource.indexOf("setTransactions(nextTransactions)");
      const setSavingsIdx = fnSource.indexOf("setSavings(nextSavings)");
      const clearErrorIdx = fnSource.indexOf("setGoalsLoadError(null)");

      expect(awaitIdx).toBeGreaterThan(-1);
      expect(setGoalsIdx).toBeGreaterThan(awaitIdx);
      expect(setTransactionsIdx).toBeGreaterThan(awaitIdx);
      expect(setSavingsIdx).toBeGreaterThan(awaitIdx);
      expect(clearErrorIdx).toBeGreaterThan(awaitIdx);
    });

    it("a failed savings read preserves the last-known-good snapshot", () => {
      const catchIdx = fnSource.indexOf("} catch (error) {");
      const catchSource = fnSource.slice(catchIdx);
      expect(catchSource).not.toContain("setSavings([])");
      expect(catchSource).not.toContain("setGoals([])");
      expect(catchSource).not.toContain("setTransactions([])");
    });
  });

});
