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

const financeStorage = await import("./financeStorage");

type CoverageReader = () => Promise<Array<{
  id: string;
  userId: string;
  walletId: string;
  expectedBalance: number;
  actualBalance: number;
  difference: number;
  note: string | null;
  actorUserId: string;
  reconciledAt: string;
}>>;

function getCoverageReader() {
  return (
    financeStorage as typeof financeStorage & {
      getWalletReconciliationCoverage?: CoverageReader;
    }
  ).getWalletReconciliationCoverage;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
  });
  mockRpc.mockReset();
});

describe("WALLET-RECONCILIATION-COVERAGE-SSOT-1 storage", () => {
  it("exposes a dedicated coverage reader instead of reusing capped history", () => {
    expect(getCoverageReader()).toBeTypeOf("function");
  });

  it("maps latest-per-wallet rows returned by the coverage RPC", async () => {
    const reader = getCoverageReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockRpc.mockResolvedValue({
      data: [
        {
          id: "receipt-1",
          user_id: "user-1",
          wallet_id: "wallet-1",
          expected_balance: "100",
          actual_balance: "120",
          difference: "20",
          note: null,
          actor_user_id: "actor-1",
          reconciled_at: "2026-01-02T03:04:05.000Z",
          created_at: "2026-01-02T03:04:05.000Z",
          balance_revision: null,
        },
      ],
      error: null,
    });

    await expect(reader()).resolves.toEqual([
      {
        id: "receipt-1",
        userId: "user-1",
        walletId: "wallet-1",
        expectedBalance: 100,
        actualBalance: 120,
        difference: 20,
        note: null,
        actorUserId: "actor-1",
        reconciledAt: "2026-01-02T03:04:05.000Z",
        balanceRevision: null,
      },
    ]);
    expect(mockRpc).toHaveBeenCalledWith(
      "get_wallet_reconciliation_coverage",
    );
  });

  it("preserves the version of a newly verified wallet", async () => {
    const reader = getCoverageReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockRpc.mockResolvedValue({
      data: [
        {
          id: "receipt-versioned",
          user_id: "user-1",
          wallet_id: "wallet-2",
          expected_balance: "50",
          actual_balance: "50",
          difference: "0",
          note: null,
          actor_user_id: "actor-1",
          reconciled_at: "2026-10-09T09:00:00.000Z",
          created_at: "2026-10-09T09:00:00.000Z",
          balance_revision: 7,
        },
      ],
      error: null,
    });

    await expect(reader()).resolves.toEqual([
      expect.objectContaining({
        walletId: "wallet-2",
        balanceRevision: 7,
      }),
    ]);
  });
  it("rejects a coverage RPC failure instead of certifying fake zero coverage", async () => {
    const reader = getCoverageReader();
    expect(reader).toBeTypeOf("function");
    if (!reader) return;

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "coverage unavailable", code: "XX000" },
    });

    await expect(reader()).rejects.toThrow();
  });
});
