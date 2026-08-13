import { describe, expect, it } from "vitest";
import { parseSearchTransactionsArgs } from "./aiToolValidation";
import { executeAIFinanceToolCall } from "./aiToolExecutor.server";
import type { AIFinanceToolContext } from "./aiToolTypes";

/**
 * HOTFIX — optionalDate compatibility check.
 *
 * Confirms the documented contract for search_transactions' `from`/`to`
 * (tool schema: "date in YYYY-MM-DD format") is calendar-date-only. The
 * previous shape-only regex (`^\d{4}-\d{2}-\d{2}(?:T.*)?$`) incidentally
 * tolerated an ISO timestamp suffix that was never part of the documented
 * contract, never produced by the preset resolver, and never exercised by
 * any test/example — so it is rejected now, not preserved.
 */

describe("parseSearchTransactionsArgs — from/to date contract", () => {
  it("accepts a plain calendar date", () => {
    const result = parseSearchTransactionsArgs({ from: "2026-08-13" });
    expect(result.from).toBe("2026-08-13");
  });

  it("accepts a non-leap-year February 28th", () => {
    const result = parseSearchTransactionsArgs({ to: "2026-02-28" });
    expect(result.to).toBe("2026-02-28");
  });

  it("accepts a leap-year February 29th", () => {
    const result = parseSearchTransactionsArgs({ to: "2028-02-29" });
    expect(result.to).toBe("2028-02-29");
  });

  it("rejects a non-existent Feb 29 in a non-leap year", () => {
    expect(() =>
      parseSearchTransactionsArgs({ from: "2026-02-29" }),
    ).toThrow("from must use ISO date format YYYY-MM-DD.");
  });

  it("rejects Feb 31 (impossible for any year)", () => {
    expect(() =>
      parseSearchTransactionsArgs({ from: "2026-02-31" }),
    ).toThrow("from must use ISO date format YYYY-MM-DD.");
  });

  it("rejects April 31 (April has 30 days)", () => {
    expect(() =>
      parseSearchTransactionsArgs({ to: "2026-04-31" }),
    ).toThrow("to must use ISO date format YYYY-MM-DD.");
  });

  it("rejects month 13", () => {
    expect(() =>
      parseSearchTransactionsArgs({ from: "2026-13-01" }),
    ).toThrow("from must use ISO date format YYYY-MM-DD.");
  });

  it("rejects a UTC ISO timestamp — timestamps were never part of the documented contract", () => {
    expect(() =>
      parseSearchTransactionsArgs({ from: "2026-08-13T10:30:00Z" }),
    ).toThrow("from must use ISO date format YYYY-MM-DD.");
  });

  it("rejects an offset ISO timestamp", () => {
    expect(() =>
      parseSearchTransactionsArgs({ to: "2026-08-13T00:00:00+07:00" }),
    ).toThrow("to must use ISO date format YYYY-MM-DD.");
  });

  it("rejects a calendar-invalid date even when given as a timestamp", () => {
    expect(() =>
      parseSearchTransactionsArgs({ from: "2026-02-31T10:00:00Z" }),
    ).toThrow("from must use ISO date format YYYY-MM-DD.");
  });

  it("accepts a full valid from/to range together", () => {
    const result = parseSearchTransactionsArgs({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(result.from).toBe("2026-08-01");
    expect(result.to).toBe("2026-08-31");
  });

  it("omitting from/to entirely is still valid (no date filter)", () => {
    const result = parseSearchTransactionsArgs({});
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
  });
});

describe("search_transactions — invalid from/to never reaches Supabase", () => {
  it("executeAIFinanceToolCall surfaces the rejection as the tool's standard error result and never calls Supabase", async () => {
    let supabaseCalled = false;
    const context: AIFinanceToolContext = {
      userId: "user-1",
      supabase: {
        from() {
          supabaseCalled = true;
          throw new Error("Supabase must not be called for an invalid date.");
        },
      } as unknown as AIFinanceToolContext["supabase"],
    };

    const executed = await executeAIFinanceToolCall(context, {
      callId: "call-1",
      name: "search_transactions",
      argumentsJson: JSON.stringify({ from: "2026-08-13T10:30:00Z" }),
    });

    expect(supabaseCalled).toBe(false);
    expect(executed.result.ok).toBe(false);
    expect(executed.result.error).toBe(
      "from must use ISO date format YYYY-MM-DD.",
    );
  });
});
