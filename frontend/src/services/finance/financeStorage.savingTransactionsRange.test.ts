import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

const financeStorage = await import("./financeStorage");
const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };
const SUPABASE_ERROR = { message: "connection reset", code: "57P01" };

function makeQueryResult(result: { data: unknown; error: unknown }) {
  const thenable = Promise.resolve(result);
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    then: thenable.then.bind(thenable),
    catch: thenable.catch.bind(thenable),
  };
  return chain;
}

type SavingRangeReader = (
  startDate: string,
  endDate: string,
) => Promise<Array<{
  id: string;
  saving_id: string;
  type: string;
  amount: number;
  wallet_id?: string | null;
  transaction_date: string;
  note: string | null;
  created_at?: string;
}>>;

function getReader() {
  return (financeStorage as typeof financeStorage & {
    getSavingTransactionsInRange?: SavingRangeReader;
  }).getSavingTransactionsInRange;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockFrom.mockReset();
});

describe("getSavingTransactionsInRange", () => {
  it("returns bounded Savings ledger rows with numeric amounts", async () => {
    const reader = getReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [
          {
            id: "st-1",
            saving_id: "saving-1",
            type: "deposit",
            amount: "2500000",
            wallet_id: "wallet-1",
            transaction_date: "2026-10-07",
            note: null,
            created_at: "2026-10-07T09:00:00Z",
          },
        ],
        error: null,
      }),
    );

    await expect(reader("2026-10-01", "2026-10-31")).resolves.toEqual([
      {
        id: "st-1",
        saving_id: "saving-1",
        type: "deposit",
        amount: 2_500_000,
        wallet_id: "wallet-1",
        transaction_date: "2026-10-07",
        note: null,
        created_at: "2026-10-07T09:00:00Z",
      },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("saving_transactions");
  });

  it("returns a legitimate empty period as []", async () => {
    const reader = getReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(reader("2026-10-01", "2026-10-31")).resolves.toEqual([]);
  });

  it("rejects query failure instead of certifying a fake zero-movement period", async () => {
    const reader = getReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(reader("2026-10-01", "2026-10-31")).rejects.toThrow(
      "connection reset",
    );
  });
});
