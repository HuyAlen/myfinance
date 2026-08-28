import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
    from: mockFrom,
  },
}));

const {
  addTransaction,
  clonePreviousMonthBudgets,
  deleteTransaction,
  updateTransaction,
} = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };

const savingsMirror = {
  id: "tx-saving-1",
  type: "transfer" as const,
  amount: 250_000,
  categoryId: "",
  walletId: "wallet-1",
  note: "Nạp vào tiết kiệm",
  date: "2026-08-28",
  transferToWalletId: undefined,
  transferReference: "saving:saving-1",
  transferReferenceType: "saving",
  sourceType: "wallet",
  destinationType: "saving",
};

function mockTransactionFetch(row = savingsMirror) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [row], error: null });
  mockFrom.mockReturnValue(query);
  return query;
}

describe("CROSS-DOMAIN-INTEGRITY-1 storage ownership guards", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it("refuses to create a Savings-owned mirror through generic transaction CRUD", async () => {
    const result = await addTransaction(savingsMirror);

    expect(result.error).toMatch(/Tiết kiệm/);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses to edit an existing Savings-owned mirror before generic wallet reconciliation", async () => {
    mockTransactionFetch();

    const result = await updateTransaction({
      ...savingsMirror,
      amount: 300_000,
    });

    expect(result.error).toMatch(/Tiết kiệm/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses to delete a Savings-owned mirror before generic wallet reconciliation", async () => {
    mockTransactionFetch();

    const result = await deleteTransaction(savingsMirror.id);

    expect(result.error).toMatch(/Tiết kiệm/);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("CROSS-DOMAIN-INTEGRITY-1 atomic budget clone receipt", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it("accepts only a verified server receipt for the requested target month", async () => {
    mockRpc.mockResolvedValue({
      data: {
        cloned: 4,
        source_month: "2026-07",
        target_month: "2026-08",
        verified: true,
      },
      error: null,
    });

    const result = await clonePreviousMonthBudgets("2026-08");

    expect(mockRpc).toHaveBeenCalledWith(
      "clone_previous_month_budgets_atomic",
      { p_target_month: "2026-08" },
    );
    expect(result).toEqual({ cloned: 4, error: null });
  });

  it("fails closed when the RPC returns success without a valid receipt", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await clonePreviousMonthBudgets("2026-08");

    expect(result.cloned).toBe(0);
    expect(result.error).toMatch(/chưa xác nhận/);
  });

  it("maps an invalid target month without claiming any rows were cloned", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFBG2", message: "Invalid target month" },
    });

    const result = await clonePreviousMonthBudgets("2026-13");

    expect(result).toEqual({ cloned: 0, error: "Tháng ngân sách không hợp lệ." });
  });
});
