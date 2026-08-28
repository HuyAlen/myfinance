import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** FINANCE-DATA-1B + DEBTS-CORRECTNESS-1 failure-state contract. */
describe("DebtsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(path.resolve(__dirname, "DebtsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("declares loading, error, and successful-readiness state", () => {
    expect(source).toContain("isLoadingDebts");
    expect(source).toContain("debtsLoadError");
    expect(source).toContain("isDebtsDataReady");
  });

  it("reloadData clears the error on success and preserves the prior snapshot on failure", () => {
    const start = source.indexOf("const reloadData = useCallback");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const runReload = useCallback", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setDebtsLoadError(null)");
    expect(fnSource).toContain("setIsDebtsDataReady(true)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setDebtsLoadError(");
    expect(catchSource).not.toContain("setDebts([])");
    expect(catchSource).toContain("setIsLoadingDebts(false)");
  });

  it("splits the debt-free empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain("{debts.length === 0 && isLoadingDebts && (");
    expect(normalized).toContain("{debts.length === 0 && !isLoadingDebts && debtsLoadError && (");
    expect(normalized).toContain("{debts.length === 0 && isDebtsDataReady && !debtsLoadError && (");
  });

  it("the legitimate-empty branch still shows the debt-free copy", () => {
    expect(source).toContain("Bạn đang tự do tài chính");
  });

  it("positive-only analytics are additionally gated on successful readiness", () => {
    expect(normalized).toContain("{isDebtsDataReady && debts.length > 0 && (");
  });
});
