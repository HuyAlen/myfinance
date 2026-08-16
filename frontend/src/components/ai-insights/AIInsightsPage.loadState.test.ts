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
 * AIInsightsPage has no single empty-state CTA — every section/score
 * degrades independently on its own zero-length/zero-value derived data.
 * Same fix shape as ReportsPage: withhold the whole analysis body behind
 * one page-level loading/error gate instead of touching each section.
 *
 * Explicitly NOT the AI Agent (a separate, out-of-scope rules-based
 * analytics page whose server tools don't import financeStorage.ts).
 */
describe("AIInsightsPage withholds the whole analysis body until first load succeeds (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "AIInsightsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingInsights (default true) and insightsLoadError state", () => {
    expect(source).toContain("useState(true)");
    expect(source).toContain("isLoadingInsights");
    expect(source).toContain("insightsLoadError");
  });

  it("load() clears the error on success and sets a message on failure, without touching any of the seven data arrays", () => {
    const start = source.indexOf("async function load() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("load();", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setInsightsLoadError(null);");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setInsightsLoadError(");
    expect(catchSource).toContain("setIsLoadingInsights(false);");
    for (const setter of [
      "setWallets([",
      "setCategories([",
      "setTransactions([",
      "setDebts([",
      "setGoals([",
      "setInvestments([",
      "setBudgets([",
    ]) {
      expect(catchSource).not.toContain(setter);
    }
  });

  it("the whole component body is gated behind isLoadingInsights / insightsLoadError before the real return", () => {
    expect(normalized).toContain("if (isLoadingInsights) { return (");
    expect(normalized).toContain("if (insightsLoadError) { return (");
  });

  it("no hooks are declared after the loading/error early returns (rules-of-hooks safety)", () => {
    const gateIdx = source.indexOf("if (isLoadingInsights) {");
    expect(gateIdx).toBeGreaterThan(-1);
    const rest = source.slice(gateIdx);
    for (const hook of ["useState(", "useEffect(", "useMemo(", "useCallback("]) {
      expect(rest.indexOf(hook)).toBe(-1);
    }
  });
});
