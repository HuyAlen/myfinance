import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
    from: vi.fn(),
  },
}));

const {
  createInvestmentCapitalMovement,
  deleteInvestment,
  updateInvestment,
} = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };

describe("INVESTMENT-CAPITAL-FLOW-SSOT-1 storage RPC boundary", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("creates capital movement only through the atomic Investment RPC", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await createInvestmentCapitalMovement({
      transactionId: "tx-capital-1",
      investmentId: "investment-1",
      walletId: "wallet-1",
      type: "deposit",
      amount: 2_000_000,
      date: "2026-10-06",
      note: "Nạp thêm vốn",
    });

    expect(result).toEqual({ error: null });
    expect(mockRpc).toHaveBeenCalledWith(
      "create_investment_capital_movement",
      {
        p_transaction_id: "tx-capital-1",
        p_investment_id: "investment-1",
        p_wallet_id: "wallet-1",
        p_type: "deposit",
        p_amount: 2_000_000,
        p_transaction_date: "2026-10-06",
        p_note: "Nạp thêm vốn",
      },
    );
  });

  it("maps insufficient Wallet funds without claiming success", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFI05", message: "Insufficient wallet balance" },
    });

    const result = await createInvestmentCapitalMovement({
      transactionId: "tx-capital-2",
      investmentId: "investment-1",
      walletId: "wallet-1",
      type: "deposit",
      amount: 20_000_000,
      date: "2026-10-06",
    });

    expect(result.error).toMatch(/Số dư ví không đủ/);
  });

  it("updates snapshot metadata through the server-side principal guard", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await updateInvestment({
      id: "investment-1",
      name: "ETF dài hạn",
      type: "fund",
      symbol: "ETF",
      investedAmount: 5_000_000,
      currentValue: 5_500_000,
      purchaseDate: "2026-01-02",
      notes: "Theo dõi dài hạn",
    });

    expect(result).toEqual({ error: null });
    expect(mockRpc).toHaveBeenCalledWith(
      "update_investment_snapshot_atomic",
      {
        p_investment_id: "investment-1",
        p_name: "ETF dài hạn",
        p_type: "fund",
        p_symbol: "ETF",
        p_invested_amount: 5_000_000,
        p_current_value: 5_500_000,
        p_purchase_date: "2026-01-02",
        p_notes: "Theo dõi dài hạn",
      },
    );
  });

  it("maps a direct principal edit conflict after capital history exists", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "MFI08",
        message: "Investment principal is managed by capital movement history",
      },
    });

    const result = await updateInvestment({
      id: "investment-1",
      name: "ETF dài hạn",
      type: "fund",
      investedAmount: 7_000_000,
      currentValue: 7_500_000,
    });

    expect(result.error).toMatch(/Nạp vốn|Rút vốn/);
  });

  it("deletes Portfolio assets only through the atomic history guard", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await deleteInvestment("investment-1");

    expect(result).toEqual({ error: null });
    expect(mockRpc).toHaveBeenCalledWith("delete_investment_atomic", {
      p_investment_id: "investment-1",
    });
  });

  it("preserves capital history by refusing deletion when the server reports references", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFI07", message: "Investment has capital movement history" },
    });

    const result = await deleteInvestment("investment-1");

    expect(result.error).toMatch(/lịch sử nạp\/rút vốn/);
  });
});