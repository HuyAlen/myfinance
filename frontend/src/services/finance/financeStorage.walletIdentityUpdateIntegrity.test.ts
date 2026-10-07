import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

const { updateWallet } = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };
const WALLET = {
  id: "wallet-1",
  name: "Ví chính",
  type: "bank" as const,
  balance: 1_000_000,
};
const INTEGRITY_ERROR =
  "Không thể xác nhận cập nhật ví. Vui lòng tải lại và thử lại.";

function makeUpdateQuery(result: { data: unknown; error: unknown }) {
  const thenable = Promise.resolve(result);
  const chain: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: typeof thenable.then;
    catch: typeof thenable.catch;
  } = {} as never;

  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = thenable.then.bind(thenable);
  chain.catch = thenable.catch.bind(thenable);
  return chain;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockFrom.mockReset();
});

describe("WALLET-IDENTITY-UPDATE-INTEGRITY-1 storage receipt", () => {
  it("accepts success only after Supabase returns the requested wallet id", async () => {
    const query = makeUpdateQuery({ data: { id: WALLET.id }, error: null });
    mockFrom.mockReturnValue(query);

    await expect(updateWallet(WALLET)).resolves.toEqual({ error: null });

    expect(mockFrom).toHaveBeenCalledWith("wallets");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing query-error result while still requesting a mutation receipt", async () => {
    const query = makeUpdateQuery({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    mockFrom.mockReturnValue(query);

    await expect(updateWallet(WALLET)).resolves.toEqual({
      error: "permission denied",
    });

    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("fails closed when PostgREST reports no error but returns no updated row", async () => {
    const query = makeUpdateQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);

    await expect(updateWallet(WALLET)).resolves.toEqual({
      error: INTEGRITY_ERROR,
    });
  });

  it("fails closed when the returned mutation receipt belongs to a different wallet", async () => {
    const query = makeUpdateQuery({ data: { id: "wallet-other" }, error: null });
    mockFrom.mockReturnValue(query);

    await expect(updateWallet(WALLET)).resolves.toEqual({
      error: INTEGRITY_ERROR,
    });
  });
});
