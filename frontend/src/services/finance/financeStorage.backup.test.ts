import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    rpc: mockRpc,
  },
}));

const {
  FINANCE_BACKUP_DOMAINS,
  FINANCE_BACKUP_V2_DOMAINS,
  exportFinanceBackup,
  restoreFinanceBackup,
  validateFinanceBackup,
} = await import("./financeStorage");

function makeV3Backup() {
  return {
    format: "myfinance-backup",
    version: 3,
    exported_at: "2026-08-22T07:00:00.000Z",
    data: Object.fromEntries(
      FINANCE_BACKUP_DOMAINS.map((domain: string) => [domain, []]),
    ),
  };
}

function makeV2Backup() {
  return {
    format: "myfinance-backup",
    version: 2,
    exported_at: "2026-08-22T07:00:00.000Z",
    data: Object.fromEntries(
      FINANCE_BACKUP_V2_DOMAINS.map((domain: string) => [domain, []]),
    ),
  };
}

beforeEach(() => {
  mockRpc.mockReset();
});

describe("NETWORTH-HISTORY-1 backup validation", () => {
  it("accepts a complete V3 envelope including Net Worth snapshots", () => {
    const result = validateFinanceBackup(makeV3Backup());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceVersion).toBe(3);
    expect(result.backup.data.net_worth_snapshots).toEqual([]);
  });

  it("keeps V2 backups restorable by normalizing them to V3 with no fabricated history", () => {
    const result = validateFinanceBackup(makeV2Backup());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sourceVersion).toBe(2);
    expect(result.backup.version).toBe(3);
    expect(result.backup.data.net_worth_snapshots).toEqual([]);
  });

  it("rejects a generic object instead of interpreting missing domains as empty", () => {
    expect(validateFinanceBackup({})).toMatchObject({ ok: false });
  });

  it("rejects legacy pf_* backups with the existing safe error", () => {
    expect(validateFinanceBackup({ pf_wallets: [] })).toEqual({
      ok: false,
      error:
        "Đây là backup phiên bản cũ và không chứa đầy đủ Savings/Forex. Không thể khôi phục tự động để tránh mất dữ liệu.",
    });
  });

  it("rejects V3 when net_worth_snapshots is missing", () => {
    const backup = makeV3Backup();
    delete (backup.data as Record<string, unknown>).net_worth_snapshots;

    expect(validateFinanceBackup(backup)).toEqual({
      ok: false,
      error: "Backup thiếu dữ liệu bắt buộc: net_worth_snapshots.",
    });
  });

  it("rejects non-object rows inside snapshot history", () => {
    const backup = makeV3Backup();
    (backup.data as Record<string, unknown>).net_worth_snapshots = ["bad"];

    expect(validateFinanceBackup(backup)).toEqual({
      ok: false,
      error: "Backup có dữ liệu không hợp lệ trong net_worth_snapshots.",
    });
  });
});

describe("NETWORTH-HISTORY-1 backup RPC boundary", () => {
  it("does not call restore RPC when client preflight fails", async () => {
    await expect(restoreFinanceBackup({})).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("restores V2 through one atomic RPC after safe V3 normalization", async () => {
    const backup = makeV2Backup();
    mockRpc.mockResolvedValue({ data: { restored: true }, error: null });

    await expect(restoreFinanceBackup(backup)).resolves.toEqual({ error: null });
    expect(mockRpc).toHaveBeenCalledTimes(1);

    const sent = mockRpc.mock.calls[0][1].p_backup;
    expect(sent.version).toBe(3);
    expect(sent.data.net_worth_snapshots).toEqual([]);
  });

  it("exports one complete V3 snapshot through a single RPC call", async () => {
    const backup = makeV3Backup();
    mockRpc.mockResolvedValue({ data: backup, error: null });

    await expect(exportFinanceBackup()).resolves.toEqual(backup);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("export_finance_backup");
  });

  it("rejects a stale V2 payload returned by the export RPC", async () => {
    mockRpc.mockResolvedValue({ data: makeV2Backup(), error: null });

    await expect(exportFinanceBackup()).rejects.toThrow(
      "Máy chủ trả về backup cũ",
    );
  });
});
