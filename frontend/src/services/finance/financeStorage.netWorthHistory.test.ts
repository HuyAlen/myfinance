import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    rpc: vi.fn(),
  },
}));

const { getNetWorthSnapshotsInRange } = await import("./financeStorage");

function createQueryResult(result: {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.lte = vi.fn(() => query);
  query.order = vi.fn().mockResolvedValue(result);
  return query;
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockFrom.mockReset();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
  });
});

describe("getNetWorthSnapshotsInRange (NETWORTH-HISTORY-1)", () => {
  it("queries only the authenticated user's bounded month range in ascending order", async () => {
    const query = createQueryResult({
      data: [
        {
          id: "snap-1",
          snapshot_month: "2026-08-01",
          cash_and_wallets: "100.50",
          savings: "20",
          investments: "30",
          forex: "-5.25",
          total_assets: "145.25",
          total_debt: "40",
          net_worth: "105.25",
          captured_at: "2026-08-26T10:00:00.000Z",
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    await expect(
      getNetWorthSnapshotsInRange("2026-01-01", "2026-12-01"),
    ).resolves.toEqual([
      {
        id: "snap-1",
        snapshotMonth: "2026-08-01",
        cashAndWallets: 100.5,
        savings: 20,
        investments: 30,
        forex: -5.25,
        totalAssets: 145.25,
        totalDebt: 40,
        netWorth: 105.25,
        capturedAt: "2026-08-26T10:00:00.000Z",
      },
    ]);

    expect(mockFrom).toHaveBeenCalledWith("net_worth_snapshots");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.gte).toHaveBeenCalledWith("snapshot_month", "2026-01-01");
    expect(query.lte).toHaveBeenCalledWith("snapshot_month", "2026-12-01");
    expect(query.order).toHaveBeenCalledWith("snapshot_month", {
      ascending: true,
    });
  });

  it("returns a legitimate empty result only when the query succeeds empty", async () => {
    const query = createQueryResult({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await expect(
      getNetWorthSnapshotsInRange("2026-01-01", "2026-12-01"),
    ).resolves.toEqual([]);
  });

  it("rejects a real query failure instead of turning it into fake empty history", async () => {
    const query = createQueryResult({
      data: null,
      error: { message: "history unavailable" },
    });
    mockFrom.mockReturnValue(query);

    await expect(
      getNetWorthSnapshotsInRange("2026-01-01", "2026-12-01"),
    ).rejects.toThrow("history unavailable");
  });
});
