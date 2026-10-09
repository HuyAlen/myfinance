import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: vi.fn(),
    rpc: mockRpc,
  },
}));

const { reconcileWalletBalance } = await import("./financeStorage");

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: "member-1" } } },
  });
  mockRpc.mockReset();
});

describe("WALLET-RECONCILIATION-STATUS-UX-1 equal balance", () => {
  it("accepts a zero-difference receipt without inventing a wallet update", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        id: "receipt-equal", user_id: "owner", wallet_id: "wallet-1",
        expected_balance: "0", actual_balance: "0", difference: "0",
        actor_user_id: "member-1", reconciled_at: "2026-10-09T09:00:00Z",
        balance_revision: 2,
      }],
      error: null,
    });

    await expect(reconcileWalletBalance({
      walletId: "wallet-1", expectedBalance: 0, actualBalance: 0,
    })).resolves.toEqual({
      error: null,
      previousBalance: 0,
      actualBalance: 0,
      difference: 0,
      reconciliationId: "receipt-equal",
      reconciledAt: "2026-10-09T09:00:00Z",
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("reconcile_wallet_balance_atomic", {
      p_wallet_id: "wallet-1",
      p_expected_balance: 0,
      p_actual_balance: 0,
      p_note: null,
    });
  });

  it("continues to reject stale-expected-balance conflicts", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFR02", message: "Wallet balance changed" },
    });
    const result = await reconcileWalletBalance({
      walletId: "wallet-1", expectedBalance: 0, actualBalance: 0,
    });
    expect(result.error).not.toBeNull();
    if (result.error !== null) expect(result.code).toBe("conflict");
  });
});
