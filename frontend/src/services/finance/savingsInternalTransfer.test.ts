import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
  },
}));

const { createSavingInternalTransfer } = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };

describe("SAVINGS-INTERNAL-TRANSFER-1 financeStorage", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("calls transfer_saving_balance with canonical params", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        source_saving: { id: "source", balance: 0 },
        destination_saving: { id: "destination", balance: 600 },
        source_transaction: { id: "source-tx", saving_id: "source", type: "withdraw", amount: 500 },
        destination_transaction: { id: "destination-tx", saving_id: "destination", type: "deposit", amount: 500 },
        transfer_reference: "11111111-1111-1111-1111-111111111111",
      }],
      error: null,
    });

    const result = await createSavingInternalTransfer({
      sourceSavingId: "source",
      destinationSavingId: "destination",
      amount: 500,
      transactionDate: "2026-10-02",
      sourceTransactionId: "source-tx",
      destinationTransactionId: "destination-tx",
      note: "Gom quỹ",
    });

    expect(mockRpc).toHaveBeenCalledWith("transfer_saving_balance", {
      p_source_saving_id: "source",
      p_destination_saving_id: "destination",
      p_amount: 500,
      p_transaction_date: "2026-10-02",
      p_source_transaction_id: "source-tx",
      p_destination_transaction_id: "destination-tx",
      p_note: "Gom quỹ",
    });
    expect(result.error).toBeNull();
    expect(result.data?.sourceSaving.balance).toBe(0);
    expect(result.data?.destinationSaving.balance).toBe(600);
  });

  it("maps same-source rejection", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS07", message: "Source and destination must differ" },
    });

    const result = await createSavingInternalTransfer({
      sourceSavingId: "same",
      destinationSavingId: "same",
      amount: 100,
      transactionDate: "2026-10-02",
      sourceTransactionId: "a",
      destinationTransactionId: "b",
      note: null,
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/khác nhau/);
  });

  it("maps MFS02 insufficient source balance", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS02", message: "Insufficient savings balance" },
    });

    const result = await createSavingInternalTransfer({
      sourceSavingId: "source",
      destinationSavingId: "destination",
      amount: 999,
      transactionDate: "2026-10-02",
      sourceTransactionId: "a",
      destinationTransactionId: "b",
      note: null,
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/không đủ/);
  });
});
