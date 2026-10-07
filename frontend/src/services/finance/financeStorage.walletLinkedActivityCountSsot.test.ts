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
    then: thenable.then.bind(thenable),
    catch: thenable.catch.bind(thenable),
  };
  return chain;
}

type SavingLinkReader = () => Promise<
  Array<{ walletId: string; savingId: string }>
>;

function getSavingReader() {
  return (
    financeStorage as typeof financeStorage & {
      getSavingTransactionWalletLinks?: SavingLinkReader;
    }
  ).getSavingTransactionWalletLinks;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockFrom.mockReset();
});

describe("WALLETS-LINKED-ACTIVITY-COUNT-SSOT-1 storage readers", () => {
  it("exposes Savings mirror metadata on the existing main-transaction link reader", async () => {
    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [
          {
            walletId: "wallet-1",
            transferToWalletId: null,
            transfer_reference: "saving_deposit:saving-1:2026-10-07 10:00:00+00",
            transfer_reference_type: "saving",
          },
        ],
        error: null,
      }),
    );

    await expect(financeStorage.getTransactionWalletLinks()).resolves.toEqual([
      {
        walletId: "wallet-1",
        transferToWalletId: null,
        transferReference: "saving_deposit:saving-1:2026-10-07 10:00:00+00",
        transferReferenceType: "saving",
      },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("transactions");
  });

  it("returns only Savings ledger rows that actually link to a Wallet", async () => {
    const reader = getSavingReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(
      makeQueryResult({
        data: [
          { saving_id: "saving-1", wallet_id: "wallet-1" },
          { saving_id: "saving-2", wallet_id: null },
        ],
        error: null,
      }),
    );

    await expect(reader()).resolves.toEqual([
      { walletId: "wallet-1", savingId: "saving-1" },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("saving_transactions");
  });

  it("returns a legitimate empty Savings-link collection as []", async () => {
    const reader = getSavingReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(makeQueryResult({ data: [], error: null }));
    await expect(reader()).resolves.toEqual([]);
  });

  it("rejects Savings-link query failure instead of certifying a fake zero count", async () => {
    const reader = getSavingReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockFrom.mockReturnValue(
      makeQueryResult({ data: null, error: SUPABASE_ERROR }),
    );
    await expect(reader()).rejects.toThrow("connection reset");
  });
});
