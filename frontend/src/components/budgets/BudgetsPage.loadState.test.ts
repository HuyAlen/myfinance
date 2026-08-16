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
});
