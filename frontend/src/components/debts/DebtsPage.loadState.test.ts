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
 * "Không có khoản nợ nào! Bạn đang tự do tài chính" (you are debt-free) is
 * a real financial conclusion drawn from `debts.length === 0` — the most
 * severe false-conclusion risk found in the FINANCE-DATA-1B audit. Proves
 * it cannot render before a load has actually succeeded once.
 */
describe("DebtsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DebtsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingDebts and debtsLoadError state", () => {
    expect(source).toContain("isLoadingDebts");
    expect(source).toContain("debtsLoadError");
  });

  it("reloadData clears the error on success and sets a message on failure, without touching debts state", () => {
    const start = source.indexOf("async function reloadData() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("useEffect(", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setDebtsLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setDebtsLoadError(");
    expect(catchSource).not.toContain("setDebts([])");
    expect(catchSource).toContain("setIsLoadingDebts(false)");
  });

  it("splits the debt-free empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain(
      "{debts.length === 0 && isLoadingDebts && (",
    );
    expect(normalized).toContain(
      "{debts.length === 0 && !isLoadingDebts && debtsLoadError && (",
    );
    expect(normalized).toContain(
      "{debts.length === 0 && !isLoadingDebts && !debtsLoadError && (",
    );
  });

  it("the legitimate-empty branch still shows the original debt-free copy", () => {
    expect(source).toContain("Bạn đang tự do tài chính");
  });

  it("leaves the positive-only analytics gates (debts.length > 0) untouched", () => {
    expect(source).toContain("debts.length > 0");
  });
});
