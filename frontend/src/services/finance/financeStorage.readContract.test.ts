import { beforeEach, describe, expect, it, vi } from "vitest";

// financeStorage.ts imports the real `@/src/lib/supabase` singleton, which
// throws at module load time if NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't
// set — never true in this test environment. Mocking the module (hoisted
// above all imports by Vitest) avoids ever touching the real client — same
// convention as savingsEngine.test.ts.
const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

const {
  getWallets,
  getCategories,
  getTransactions,
  getTransactionsInRange,
  getDebts,
  getGoals,
  getBudgets,
  getInvestments,
  getTransactionWalletLinks,
  getForexCashWalletLinks,
} = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };
const NO_SESSION = { data: { session: null } };

/**
 * FINANCE-DATA-1 — Storage Error Contract Hardening.
 *
 * A chainable mock for Supabase's query builder (`.from().select().eq()...`).
 * Every chain method returns the SAME object so calls can be composed in any
 * order/count, and the object itself is a real Promise resolving/rejecting
 * to `result` — matching how `await supabase.from(...).select(...)...`
 * actually resolves in production code.
 */
function makeQueryResult(result: { data: unknown; error: unknown }) {
  const thenable = Promise.resolve(result);
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    then: thenable.then.bind(thenable),
    catch: thenable.catch.bind(thenable),
  };
  return chain;
}

const SUPABASE_ERROR = { message: "connection reset", code: "57P01" };

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockFrom.mockReset();
});

/**
 * The core FINANCE-DATA-1 invariant, proven once per collection reader:
 * a successful empty result and a query failure must be OBSERVABLY
 * different outcomes, never both collapsing to `[]`.
 */
describe("getWallets", () => {
  it("successful rows: resolves the mapped collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "w1", name: "Cash", type: "cash", balance: 100 }],
        error: null,
      }),
    );
    await expect(getWallets()).resolves.toEqual([
      { id: "w1", name: "Cash", type: "cash", balance: 100 },
    ]);
  });

  it("successful empty: resolves []", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getWallets()).resolves.toEqual([]);
  });

  it("query error: rejects — never collapses to []", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getWallets()).rejects.toThrow("connection reset");
  });

  it("no authenticated session: resolves [] (legitimate pre-auth state, not a failure)", async () => {
    mockGetSession.mockResolvedValue(NO_SESSION);
    await expect(getWallets()).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("getCategories", () => {
  it("successful rows: resolves the mapped collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "c1", name: "Food", type: "expense", planning_group: "variable" }],
        error: null,
      }),
    );
    const result = await getCategories();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "c1", name: "Food", planningGroup: "variable" });
  });

  it("successful empty: resolves []", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getCategories()).resolves.toEqual([]);
  });

  it("query error: rejects", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getCategories()).rejects.toThrow("connection reset");
  });
});

describe("getTransactions", () => {
  it("successful rows: resolves the mapped collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [
          {
            id: "t1",
            type: "expense",
            amount: 1000,
            categoryId: "c1",
            walletId: "w1",
            note: "",
            date: "2026-01-01",
          },
        ],
        error: null,
      }),
    );
    const result = await getTransactions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });

  it("successful empty: resolves [] (a legitimate account with no transactions yet)", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getTransactions()).resolves.toEqual([]);
  });

  it("query error: rejects — must never be presented as a legitimate zero-transaction period", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getTransactions()).rejects.toThrow("connection reset");
  });
});

describe("getTransactionsInRange", () => {
  it("successful rows: resolves the mapped collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [
          {
            id: "t1",
            type: "income",
            amount: 500,
            categoryId: "c1",
            walletId: "w1",
            note: "",
            date: "2026-03-15",
          },
        ],
        error: null,
      }),
    );
    const result = await getTransactionsInRange("2026-03-01", "2026-03-31");
    expect(result).toHaveLength(1);
  });

  it("successful empty: resolves [] — a legitimate zero-transaction period, not a failure", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(
      getTransactionsInRange("2026-03-01", "2026-03-31"),
    ).resolves.toEqual([]);
  });

  it("query error: rejects — must never certify a period as legitimately empty", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(
      getTransactionsInRange("2026-03-01", "2026-03-31"),
    ).rejects.toThrow("connection reset");
  });
});

describe("getDebts", () => {
  it("successful rows: resolves the collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "d1", name: "Vay", totalAmount: 1000, remainingAmount: 500 }],
        error: null,
      }),
    );
    await expect(getDebts()).resolves.toHaveLength(1);
  });

  it("successful empty: resolves [] (legitimately no debts)", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getDebts()).resolves.toEqual([]);
  });

  it("query error: rejects", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getDebts()).rejects.toThrow("connection reset");
  });
});

describe("getGoals", () => {
  it("successful rows: resolves the mapped collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "g1", name: "Nhà", targetAmount: 1000, currentAmount: 100 }],
        error: null,
      }),
    );
    const result = await getGoals();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g1");
  });

  it("successful empty: resolves [] (legitimately no goals)", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getGoals()).resolves.toEqual([]);
  });

  it("query error: rejects", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getGoals()).rejects.toThrow("connection reset");
  });
});

describe("getBudgets", () => {
  it("successful rows: resolves the collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "b1", categoryId: "c1", month: "2026-03", limitAmount: 1000 }],
        error: null,
      }),
    );
    await expect(getBudgets()).resolves.toHaveLength(1);
  });

  it("successful empty: resolves [] — the legitimate 'no budgets configured' state Budget Attention relies on", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getBudgets()).resolves.toEqual([]);
  });

  it("query error: rejects — must never be presented as 'no budgets configured'", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getBudgets()).rejects.toThrow("connection reset");
  });
});

describe("getInvestments", () => {
  it("successful rows: resolves the collection", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ id: "i1", name: "ETF", type: "stock", investedAmount: 100, currentValue: 120 }],
        error: null,
      }),
    );
    await expect(getInvestments()).resolves.toHaveLength(1);
  });

  it("successful empty: resolves [] (legitimately no investments)", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getInvestments()).resolves.toEqual([]);
  });

  it("query error: rejects", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getInvestments()).rejects.toThrow("connection reset");
  });
});

describe("getTransactionWalletLinks (lookup helper)", () => {
  it("successful rows: resolves the mapped links", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [{ walletId: "w1", transferToWalletId: null }],
        error: null,
      }),
    );
    await expect(getTransactionWalletLinks()).resolves.toEqual([
      { walletId: "w1", transferToWalletId: null },
    ]);
  });

  it("successful empty: resolves [] — legitimately no linked transactions, not a failure", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getTransactionWalletLinks()).resolves.toEqual([]);
  });

  it("query error: rejects — was previously silently swallowed into [], indistinguishable from 'no links'", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getTransactionWalletLinks()).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("getForexCashWalletLinks (lookup helper)", () => {
  it("successful rows: resolves the mapped links", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: [{ wallet_id: "w1" }], error: null }),
    );
    await expect(getForexCashWalletLinks()).resolves.toEqual([
      { walletId: "w1" },
    ]);
  });

  it("successful empty: resolves [] — legitimately no Forex cash links", async () => {
    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(getForexCashWalletLinks()).resolves.toEqual([]);
  });

  it("query error: rejects", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getForexCashWalletLinks()).rejects.toThrow(
      "connection reset",
    );
  });
});

/**
 * The central FINANCE-DATA-1 regression: for every hardened reader, a
 * successful empty result and a query failure must be observably
 * different — this is the exact bug (both collapsed to `[]`) the patch
 * fixes. One representative reader (getBudgets, the one the final
 * Dashboard audit specifically called out) is asserted explicitly; the
 * per-function describe blocks above already prove this for all ten.
 */
describe("empty vs failure are observably different outcomes (core regression)", () => {
  it("getBudgets: successful [] resolves, but a query error rejects — never the same outcome", async () => {
    mockFrom.mockReturnValueOnce(makeQueryResult({ data: [], error: null }));
    await expect(getBudgets()).resolves.toEqual([]);

    mockFrom.mockReturnValueOnce(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(getBudgets()).rejects.toThrow();
  });
});

/**
 * Already-compliant readers (getForexAccounts/getForexCashTransactions/
 * getForexCashTransactionsInRange) already throw on error before this
 * patch — deliberately NOT re-tested/rewritten here per the "do not churn
 * already-correct code" instruction. They served as this patch's own
 * reference pattern (see financeStorage.ts's getWallets etc., now
 * matching their exact if (error) { console.error(...); throw ...} shape).
 */
