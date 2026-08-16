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
 * Covers two related fixes on TransactionsPage:
 *  - FINANCE-DATA-1A: reloadData's Promise.allSettled branches only ever
 *    apply state on "fulfilled" — a rejected branch must never clear
 *    previously-loaded data.
 *  - FINANCE-DATA-1B: an initial transactions-load failure must not
 *    render as "Chưa có giao dịch" (a validated empty-ledger claim). The
 *    shared EmptyState component gates on isLoading/loadError first.
 */
describe("TransactionsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  const reloadStart = source.indexOf(
    "const reloadData = useCallback(async () => {",
  );
  const reloadEnd = source.indexOf(
    "}, [effectiveRange, toast]);",
    reloadStart,
  );
  const reloadSource = source.slice(reloadStart, reloadEnd);

  it("declares isLoadingTransactions and transactionsLoadError state", () => {
    expect(source).toContain("isLoadingTransactions");
    expect(source).toContain("transactionsLoadError");
  });

  it("reloadData only applies each Promise.allSettled branch on fulfillment (1A regression guard)", () => {
    expect(reloadStart).toBeGreaterThan(-1);
    expect(reloadEnd).toBeGreaterThan(reloadStart);

    for (const varName of [
      "txnsResult",
      "forexAccountsResult",
      "forexTxnsResult",
      "catsResult",
      "walletsResult",
    ]) {
      expect(reloadSource).toContain(`${varName}.status === "fulfilled"`);
    }
  });

  it("the primary transactions branch clears/sets transactionsLoadError and flips isLoadingTransactions off exactly once", () => {
    expect(reloadSource).toContain("setTransactionsLoadError(null)");
    expect(reloadSource).toContain("setTransactionsLoadError(");
    expect(reloadSource).toContain("setIsLoadingTransactions(false)");
  });

  it("a rejected branch never resets its array to [] as a fallback", () => {
    expect(reloadSource).not.toContain("setTransactions([])");
    expect(reloadSource).not.toContain("setForexAccounts([])");
    expect(reloadSource).not.toContain("setCategories([])");
    expect(reloadSource).not.toContain("setWallets([])");
  });

  it("EmptyState accepts isLoading/loadError props and checks them before rendering 'Chưa có giao dịch'", () => {
    const cmpStart = source.indexOf("function EmptyState({");
    expect(cmpStart).toBeGreaterThan(-1);
    const cmpEnd = source.indexOf("Chưa có giao dịch", cmpStart);
    expect(cmpEnd).toBeGreaterThan(cmpStart);
    const cmpSource = source.slice(cmpStart, cmpEnd);

    expect(cmpSource).toContain("isLoading");
    expect(cmpSource).toContain("loadError");
    expect(normalized).toContain("if (isLoading) {");
    expect(normalized).toContain("if (loadError) {");
  });

  it("both EmptyState call sites pass isLoadingTransactions/transactionsLoadError through", () => {
    expect(source).toContain("isLoading={isLoadingTransactions}");
    expect(source).toContain("loadError={transactionsLoadError}");
  });
});
