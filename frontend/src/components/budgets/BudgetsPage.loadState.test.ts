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
describe("BudgetsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "BudgetsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingBudgets and budgetsLoadError state", () => {
    expect(source).toContain("isLoadingBudgets");
    expect(source).toContain("budgetsLoadError");
  });

  it("reloadData clears the error on success and sets a message on failure, without touching budget state", () => {
    const start = source.indexOf("const reloadData");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setBudgetsLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setBudgetsLoadError(");
    expect(catchSource).not.toContain("setBudgets([])");
    expect(catchSource).toContain("setIsLoadingBudgets(false)");
  });

  it("splits the main empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && isLoadingBudgets && (",
    );
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && !isLoadingBudgets && budgetsLoadError && (",
    );
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && !isLoadingBudgets && !budgetsLoadError && (",
    );
  });

  it("leaves the positive-only pie-chart gate (budgets.length > 0) untouched", () => {
    expect(source).toContain("budgets.length > 0");
  });

  // FINANCE-DATA-1C: reloadData also bundles two raw reads —
  // supabase.from("saving_transactions") and
  // supabase.from("forex_cash_transactions") — alongside the hardened
  // getBudgets/getCategories/getTransactions. The Final Re-Audit found
  // both `.error`s were checked only to guard their setters — no
  // logging, no propagation — while budgetsLoadError was cleared
  // unconditionally right after, so a failure of either fed
  // moduleFutureAllocation (and calculateRule503020's 50/30/20 output) a
  // false ₫0 saved/invested this month. These tests prove both raw reads
  // are now validated by throwing, before any state for this load cycle
  // is committed.
  describe("FINANCE-DATA-1C: raw saving_transactions / forex_cash_transactions failure semantics", () => {
    const start = source.indexOf("const reloadData");
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);

    it("throws on a failed saving_transactions read instead of silently guarding the setter", () => {
      expect(fnSource).toContain("if (savingsResult.error) {");
      const checkIdx = fnSource.indexOf("if (savingsResult.error) {");
      const throwRegion = fnSource.slice(checkIdx, checkIdx + 100);
      expect(throwRegion).toContain("throw savingsResult.error;");
      expect(fnSource).not.toContain("if (!savingsResult.error)");
    });

    it("throws on a failed forex_cash_transactions read instead of silently guarding the setter", () => {
      expect(fnSource).toContain("if (investmentsResult.error) {");
      const checkIdx = fnSource.indexOf("if (investmentsResult.error) {");
      const throwRegion = fnSource.slice(checkIdx, checkIdx + 100);
      expect(throwRegion).toContain("throw investmentsResult.error;");
      expect(fnSource).not.toContain("if (!investmentsResult.error)");
    });

    it("validates both raw dependencies before committing ANY state for this load cycle (atomic load)", () => {
      const savingsCheckIdx = fnSource.indexOf("if (savingsResult.error) {");
      const investmentsCheckIdx = fnSource.indexOf(
        "if (investmentsResult.error) {",
      );
      const lastCheckIdx = Math.max(savingsCheckIdx, investmentsCheckIdx);

      for (const setter of [
        "setBudgets(b)",
        "setCategories(c)",
        "setTransactions(t)",
        "setSavingsModuleTransactions(",
        "setInvestmentModuleTransactions(",
        "setBudgetsLoadError(null)",
      ]) {
        expect(fnSource.indexOf(setter)).toBeGreaterThan(lastCheckIdx);
      }
    });

    it("a failed sub-query does not reset savingsModuleTransactions/investmentModuleTransactions to []", () => {
      const catchIdx = fnSource.indexOf("} catch (error) {");
      const catchSource = fnSource.slice(catchIdx);
      expect(catchSource).not.toContain("setSavingsModuleTransactions([])");
      expect(catchSource).not.toContain("setInvestmentModuleTransactions([])");
    });
  });
});
