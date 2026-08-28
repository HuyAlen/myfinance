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

const {
  FINANCE_BACKUP_DOMAINS,
  clearAllUserData,
  exportFinanceBackup,
  resetFinanceDemoData,
  restoreFinanceBackup,
} = await import("./financeStorage");

type Backup = {
  format: "myfinance-backup";
  version: 3;
  exported_at: string;
  data: Record<string, Array<Record<string, unknown>>>;
};

function makeBackup(): Backup {
  return {
    format: "myfinance-backup",
    version: 3,
    exported_at: "2026-08-28T08:00:00.000Z",
    data: Object.fromEntries(
      FINANCE_BACKUP_DOMAINS.map((domain: string, index: number) => [
        domain,
        [{ id: `${domain}-${index}` }],
      ]),
    ),
  };
}

function makeReceipt(
  backup: { data: Record<string, unknown[]> },
  verified = true,
) {
  const counts = Object.fromEntries(
    FINANCE_BACKUP_DOMAINS.map((domain: string) => [
      domain,
      backup.data[domain].length,
    ]),
  ) as Record<string, number>;

  if (
    verified &&
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
    ...(verified ? { verified: true } : {}),
    source_version: 3,
    counts,
  };
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockRpc.mockReset();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
  });
});

describe("SETTINGS-RECOVERY-INTEGRITY-1 restore receipt", () => {
  it("rejects success-without-confirmation instead of reporting restore success", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(restoreFinanceBackup(makeBackup())).resolves.toEqual({
      error:
        "Máy chủ không xác nhận khôi phục đầy đủ. Hãy tải lại trang và kiểm tra dữ liệu trước khi thao tác tiếp.",
    });
  });

  it("rejects a receipt whose domain counts do not match the requested snapshot", async () => {
    const backup = makeBackup();
    const receipt = makeReceipt(backup);
    receipt.counts.savings = 0;
    mockRpc.mockResolvedValue({ data: receipt, error: null });

    await expect(restoreFinanceBackup(backup)).resolves.toMatchObject({
      error: expect.stringContaining("không xác nhận khôi phục đầy đủ"),
    });
  });

  it("accepts the hardened verified receipt including an auto-created Net Worth baseline", async () => {
    const backup = makeBackup();
    backup.data.net_worth_snapshots = [];
    mockRpc.mockResolvedValue({ data: makeReceipt(backup, true), error: null });

    await expect(restoreFinanceBackup(backup)).resolves.toEqual({ error: null });
  });

  it("remains compatible with the existing V3 receipt during migration rollout", async () => {
    const backup = makeBackup();
    backup.data.net_worth_snapshots = [];
    mockRpc.mockResolvedValue({ data: makeReceipt(backup, false), error: null });

    await expect(restoreFinanceBackup(backup)).resolves.toEqual({ error: null });
  });
});

describe("SETTINGS-RECOVERY-INTEGRITY-1 service round-trip", () => {
  it("round-trips export -> clear -> restore without dropping any persisted domain", async () => {
    const original = makeBackup();
    const restoredPayloads: Backup[] = [];

    mockRpc.mockImplementation(
      async (name: string, args?: { p_backup?: Backup }) => {
        if (name === "export_finance_backup") {
          return { data: original, error: null };
        }
        if (name === "restore_finance_backup" && args?.p_backup) {
          restoredPayloads.push(args.p_backup);
          return { data: makeReceipt(args.p_backup), error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      },
    );

    const exported = await exportFinanceBackup();
    await expect(clearAllUserData()).resolves.toEqual({ error: null });
    await expect(restoreFinanceBackup(exported)).resolves.toEqual({ error: null });

    expect(restoredPayloads).toHaveLength(2);
    const clearSnapshot = restoredPayloads[0];
    const finalSnapshot = restoredPayloads[1];

    expect(Object.keys(clearSnapshot.data).sort()).toEqual(
      [...FINANCE_BACKUP_DOMAINS].sort(),
    );
    for (const domain of FINANCE_BACKUP_DOMAINS) {
      expect(clearSnapshot.data[domain]).toEqual([]);
      expect(finalSnapshot.data[domain]).toEqual(original.data[domain]);
    }
  });

  it("round-trips export -> reset demo -> restore back to the original full snapshot", async () => {
    const original = makeBackup();
    const restoredPayloads: Backup[] = [];

    mockRpc.mockImplementation(
      async (name: string, args?: { p_backup?: Backup }) => {
        if (name === "export_finance_backup") {
          return { data: original, error: null };
        }
        if (name === "restore_finance_backup" && args?.p_backup) {
          restoredPayloads.push(args.p_backup);
          return { data: makeReceipt(args.p_backup), error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      },
    );

    const exported = await exportFinanceBackup();
    await expect(resetFinanceDemoData()).resolves.toEqual({ error: null });
    await expect(restoreFinanceBackup(exported)).resolves.toEqual({ error: null });

    expect(restoredPayloads).toHaveLength(2);
    const demoSnapshot = restoredPayloads[0];
    const finalSnapshot = restoredPayloads[1];

    expect(Object.keys(demoSnapshot.data).sort()).toEqual(
      [...FINANCE_BACKUP_DOMAINS].sort(),
    );
    for (const domain of FINANCE_BACKUP_DOMAINS) {
      expect(finalSnapshot.data[domain]).toEqual(original.data[domain]);
    }
  });
});
