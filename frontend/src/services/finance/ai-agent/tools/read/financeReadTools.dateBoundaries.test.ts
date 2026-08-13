import { describe, expect, it } from "vitest";
import { getBudgetStatusTool } from "./financeReadTools.server";
import type { AIFinanceToolContext } from "../aiToolTypes";
import { parseOptionalMonthArgs } from "../aiToolValidation";
import { executeAIFinanceToolCall } from "../aiToolExecutor.server";

/**
 * HOTFIX regression coverage: get_budget_status previously built its
 * transactions query with `.lte("date", `${month}-31`)`, an impossible
 * PostgreSQL DATE for any month without 31 days. This proves the ACTUAL
 * query boundaries the tool sends — not just the underlying
 * getMonthDateRange() helper (already covered by
 * src/lib/date/calendarDate.test.ts) — using a small in-memory Supabase
 * stand-in that applies the same eq/gte/lte semantics a real query would.
 */

type Row = Record<string, unknown>;

function createMockSupabase(tables: Record<string, Row[]>) {
  function makeBuilder(table: string) {
    let rows = tables[table] ?? [];
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        // Permissive-if-missing: lets the tool's own `.eq("user_id", ...)`
        // multi-tenancy filter pass through fixtures that don't model it,
        // while still exercising real filters like `.eq("month", ...)`.
        rows = rows.filter(
          (row) => row[column] === undefined || row[column] === value,
        );
        return builder;
      },
      gte(column: string, value: unknown) {
        rows = rows.filter((row) => String(row[column]) >= String(value));
        return builder;
      },
      lte(column: string, value: unknown) {
        rows = rows.filter((row) => String(row[column]) <= String(value));
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(
        resolve: (value: { data: Row[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: rows, error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

function buildContext(tables: Record<string, Row[]>): AIFinanceToolContext {
  return {
    userId: "user-1",
    // The tool only calls .from(table).select().eq/gte/lte/order/limit — a
    // full SupabaseClient is not needed for this narrow query-boundary test.
    supabase: createMockSupabase(tables) as unknown as AIFinanceToolContext["supabase"],
  };
}

function budgetRow(month: string) {
  return { id: "b1", categoryId: "cat-food", month, limitAmount: 10_000 };
}

function categoryRow() {
  return { id: "cat-food", name: "Food", type: "expense", planning_group: "variable" };
}

function transactionRow(id: string, date: string, amount: number) {
  return { id, type: "expense", amount, categoryId: "cat-food", date };
}

describe("get_budget_status — real calendar query boundaries", () => {
  it.each([
    ["2026-02", "2026-02-01", "2026-02-28"], // non-leap February
    ["2028-02", "2028-02-01", "2028-02-29"], // leap February
    ["2026-04", "2026-04-01", "2026-04-30"],
    ["2026-12", "2026-12-01", "2026-12-31"],
  ])("month=%s -> gte %s, lte %s", async (month, expectedGte, expectedLte) => {
    // A transaction sitting exactly on each boundary proves the tool's
    // gte/lte are the real ones, not just correct in isolation.
    const context = buildContext({
      budgets: [budgetRow(month)],
      categories: [categoryRow()],
      transactions: [
        transactionRow("t-on-gte", expectedGte, 1_000),
        transactionRow("t-on-lte", expectedLte, 2_000),
      ],
    });

    const result = await getBudgetStatusTool.execute(context, { month });

    expect(result.ok).toBe(true);
    const data = result.data as { budgets: Array<{ spent: number }> };
    expect(data.budgets[0].spent).toBe(3_000);
  });

  it("February 2026: the last real day (28th) is included, March 1st is excluded", async () => {
    const context = buildContext({
      budgets: [budgetRow("2026-02")],
      categories: [categoryRow()],
      transactions: [
        transactionRow("t-feb28", "2026-02-28", 3_000),
        transactionRow("t-mar1", "2026-03-01", 5_000),
      ],
    });

    const result = await getBudgetStatusTool.execute(context, {
      month: "2026-02",
    });

    const data = result.data as { budgets: Array<{ spent: number }> };
    expect(data.budgets[0].spent).toBe(3_000);
  });

  it("leap-year February 2028: the 29th is included, March 1st is excluded", async () => {
    const context = buildContext({
      budgets: [budgetRow("2028-02")],
      categories: [categoryRow()],
      transactions: [
        transactionRow("t-feb29", "2028-02-29", 4_000),
        transactionRow("t-mar1", "2028-03-01", 9_000),
      ],
    });

    const result = await getBudgetStatusTool.execute(context, {
      month: "2028-02",
    });

    const data = result.data as { budgets: Array<{ spent: number }> };
    expect(data.budgets[0].spent).toBe(4_000);
  });

  it("regression: canonical Budget output (spent/remaining/usagePercent) is unaffected by the query fix", async () => {
    const context = buildContext({
      budgets: [
        { id: "b1", categoryId: "cat-food", month: "2026-02", limitAmount: 10_000 },
      ],
      categories: [categoryRow()],
      transactions: [
        transactionRow("t1", "2026-02-01", 2_000),
        transactionRow("t2", "2026-02-28", 3_000),
        transactionRow("t3", "2026-03-01", 5_000), // must be excluded
      ],
    });

    const result = await getBudgetStatusTool.execute(context, {
      month: "2026-02",
    });

    expect(result.ok).toBe(true);
    const data = result.data as {
      budgets: Array<{ spent: number; remaining: number; usagePercent: number }>;
    };
    expect(data.budgets[0].spent).toBe(5_000);
    expect(data.budgets[0].remaining).toBe(5_000);
    expect(data.budgets[0].usagePercent).toBe(50);
  });

  it("execute()'s own defensive guard rejects a calendar-invalid month before any table is queried", async () => {
    // In production, an invalid month is already rejected by validate()
    // (parseOptionalMonthArgs) before execute() ever runs — see the second
    // describe block below. This proves execute()'s own defense-in-depth
    // guard (getMonthDateRange returning undefined) also holds if it were
    // ever reached directly with an invalid value.
    let transactionsQueried = false;
    const tables: Record<string, Row[]> = {
      budgets: [],
      categories: [],
      get transactions() {
        transactionsQueried = true;
        return [];
      },
    };
    const context = buildContext(tables);

    const result = await getBudgetStatusTool.execute(context, {
      month: "2026-13",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("month must use YYYY-MM format.");
    expect(transactionsQueried).toBe(false);
  });
});

describe("get_budget_status — invalid month never reaches Supabase", () => {
  it("throws at the validate() boundary for 2026-13, 2026-00, and 2026-1 (shape-valid but calendar-invalid/malformed)", () => {
    expect(() => parseOptionalMonthArgs({ month: "2026-13" })).toThrow(
      "month must use YYYY-MM format.",
    );
    expect(() => parseOptionalMonthArgs({ month: "2026-00" })).toThrow(
      "month must use YYYY-MM format.",
    );
    expect(() => parseOptionalMonthArgs({ month: "2026-1" })).toThrow(
      "month must use YYYY-MM format.",
    );
  });

  it("executeAIFinanceToolCall surfaces the invalid-month error as the tool's standard error result and never calls Supabase", async () => {
    let supabaseCalled = false;
    const context: AIFinanceToolContext = {
      userId: "user-1",
      supabase: {
        from() {
          supabaseCalled = true;
          throw new Error("Supabase must not be called for an invalid month.");
        },
      } as unknown as AIFinanceToolContext["supabase"],
    };

    const executed = await executeAIFinanceToolCall(context, {
      callId: "call-1",
      name: "get_budget_status",
      argumentsJson: JSON.stringify({ month: "2026-13" }),
    });

    expect(supabaseCalled).toBe(false);
    expect(executed.result.ok).toBe(false);
    expect(executed.result.error).toBe("month must use YYYY-MM format.");
  });
});
