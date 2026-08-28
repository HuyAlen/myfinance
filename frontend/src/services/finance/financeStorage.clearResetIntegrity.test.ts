import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    rpc: mockRpc,
  },
}));

const {
  FINANCE_BACKUP_DOMAINS,
  clearAllUserData,
  resetFinanceDemoData,
} = await import("./financeStorage");

function makeRestoreReceipt(backup: { data: Record<string, unknown[]> }) {
  const counts = Object.fromEntries(
    FINANCE_BACKUP_DOMAINS.map((domain: string) => [
      domain,
      backup.data[domain].length,
    ]),
  ) as Record<string, number>;

  if (
    counts.net_worth_snapshots === 0 &&
    [
      "wallets",
      "savings",
      "investments",
      "debts",
      "forex_accounts",
      "forex_cash_transactions",
    ].some((domain) => counts[domain] > 0)
  ) {
    counts.net_worth_snapshots = 1;
  }

  return {
    restored: true,
    verified: true,
    source_version: 3,
    counts,
  };
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockRpc.mockReset();
  mockFrom.mockReset();

  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
  });
  mockRpc.mockImplementation(async (name: string, args?: { p_backup?: { data: Record<string, unknown[]> } }) => {
    if (name === "restore_finance_backup" && args?.p_backup) {
      return { data: makeRestoreReceipt(args.p_backup), error: null };
    }
    return { data: null, error: null };
  });
});

describe("NETWORTH-HISTORY-1 clear/reset integrity", () => {
  it("Clear All replaces every persisted domain including Net Worth history with one empty atomic snapshot", async () => {
    await expect(clearAllUserData()).resolves.toEqual({ error: null });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "restore_finance_backup",
      expect.objectContaining({
        p_backup: expect.objectContaining({
          format: "myfinance-backup",
          version: 3,
        }),
      }),
    );

    const backup = mockRpc.mock.calls[0][1].p_backup as {
      data: Record<string, unknown[]>;
    };

    expect(Object.keys(backup.data).sort()).toEqual(
      [...FINANCE_BACKUP_DOMAINS].sort(),
    );
    for (const domain of FINANCE_BACKUP_DOMAINS) {
      expect(backup.data[domain]).toEqual([]);
    }
  });

  it("Reset Demo restores canonical demo state with an empty history payload so the server captures one current baseline", async () => {
    await expect(resetFinanceDemoData()).resolves.toEqual({ error: null });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);

    const backup = mockRpc.mock.calls[0][1].p_backup as {
      data: Record<string, Array<Record<string, unknown>>>;
    };

    expect(Object.keys(backup.data).sort()).toEqual(
      [...FINANCE_BACKUP_DOMAINS].sort(),
    );

    expect(backup.data.wallets.length).toBeGreaterThan(0);
    expect(backup.data.categories.length).toBeGreaterThan(0);
    expect(backup.data.transactions.length).toBeGreaterThan(0);
    expect(backup.data.debts.length).toBeGreaterThan(0);
    expect(backup.data.goals.length).toBeGreaterThan(0);
    expect(backup.data.budgets.length).toBeGreaterThan(0);
    expect(backup.data.investments.length).toBeGreaterThan(0);

    expect(backup.data.savings).toEqual([]);
    expect(backup.data.saving_transactions).toEqual([]);
    expect(backup.data.forex_accounts).toEqual([]);
    expect(backup.data.forex_cash_transactions).toEqual([]);
    expect(backup.data.net_worth_snapshots).toEqual([]);

    for (const domain of [
      "wallets",
      "categories",
      "transactions",
      "debts",
      "goals",
      "budgets",
      "investments",
    ]) {
      for (const row of backup.data[domain]) {
        expect(row.user_id).toBe("user-1");
        expect(typeof row.created_at).toBe("string");
        expect(typeof row.updated_at).toBe("string");
      }
    }
  });

  it("does not fall back to partial browser-side deletes when the atomic RPC fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "restore failed" },
    });

    await expect(clearAllUserData()).resolves.toEqual({
      error: "restore failed",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
