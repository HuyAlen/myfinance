import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PERF-4 Query Outcome Correctness patch.
 *
 * DashboardPage.tsx is too coupled to React/Supabase to mount in this
 * project's test setup (no React Testing Library here — see AGENTS.md).
 * Rather than skip verifying the actual wiring, this test inspects the
 * source text directly: it locks that the three confirmed
 * fulfilled-`{data,error}`-shaped call sites (savings, saving_transactions,
 * forex_equity) actually pass `getStatus: supabaseResultStatus` to
 * measureDashboardQuery, and that a query whose underlying service function
 * already throws/rejects on failure (debts, via financeStorage.ts's
 * getDebts()) does NOT carry the same classifier — it doesn't need it, and
 * adding it there would be a no-op at best, misleading at worst.
 *
 * This is a plain regex/text check, not a generalized source-analysis
 * tool — if DashboardPage.tsx's formatting changes enough to break this
 * regex, that's a signal to re-verify the wiring by hand, not to loosen
 * the test.
 */
describe("DashboardPage measureDashboardQuery outcome-classification wiring", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  function callBlockFor(queryName: string): string {
    const marker = `"${queryName}"`;
    const startIndex = source.indexOf(marker);
    expect(
      startIndex,
      `expected to find a measureDashboardQuery call for "${queryName}"`,
    ).toBeGreaterThan(-1);
    // Each call site is exactly one `const xPromise = measureDashboardQuery(
    // ...);` statement — none of these query definitions contain a literal
    // `;` inside their args (no semicolons in the select-column strings or
    // the { data, error } fallbacks), so the next `;` after the query-name
    // literal reliably closes THIS statement without spilling into the
    // next one.
    const endIndex = source.indexOf(";", startIndex);
    expect(endIndex, `expected a statement terminator after "${queryName}"`).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
  }

  it.each(["savings", "saving_transactions", "forex_equity"])(
    "%s opts into the fulfilled-result error classifier (getStatus: supabaseResultStatus)",
    (queryName) => {
      expect(callBlockFor(queryName)).toContain(
        "getStatus: supabaseResultStatus",
      );
    },
  );

  it.each(["debts", "wallets", "transactions"])(
    "%s does NOT carry the fulfilled-result classifier (its service function already throws/resolves a plain value, not {data,error})",
    (queryName) => {
      expect(callBlockFor(queryName)).not.toContain(
        "getStatus: supabaseResultStatus",
      );
    },
  );
});
