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
  exportFinanceBackup,
  restoreFinanceBackup,
  validateFinanceBackup,
} = await import("./financeStorage");

function makeBackup() {
  const data = Object.fromEntries(
    FINANCE_BACKUP_DOMAINS.map((domain: string) => [domain, []]),
  );

  return {
    format: "myfinance-backup",
    version: 2,
    exported_at: "2026-08-22T07:00:00.000Z",
    data,
  };
}

beforeEach(() => {
  mockRpc.mockReset();
});

describe("FINANCE-DATA-2 backup validation", () => {
  it("accepts only a complete V2 envelope with all eleven domains", () => {
    const result = validateFinanceBackup(makeBackup());
    expect(result.ok).toBe(true);
  });

  it("rejects a generic object instead of interpreting missing domains as empty", () => {
    const result = validateFinanceBackup({});
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects legacy pf_* backups with a specific safe error", () => {
    const result = validateFinanceBackup({ pf_wallets: [] });
    expect(result).toEqual({
      ok: false,
      error:
        "Đây là backup phiên bản cũ và không chứa đầy đủ Savings/Forex. Không thể khôi phục tự động để tránh mất dữ liệu.",
    });
  });

  it("rejects a V2 backup when even one mandatory domain is missing", () => {
    const backup = makeBackup();
    delete (backup.data as Record<string, unknown>).savings;

    const result = validateFinanceBackup(backup);
    expect(result).toEqual({
      ok: false,
      error: "Backup thiếu dữ liệu bắt buộc: savings.",
    });
  });

  it("rejects non-object rows inside a domain", () => {
    const backup = makeBackup();
    (backup.data as Record<string, unknown>).wallets = ["not-a-row"];

    const result = validateFinanceBackup(backup);
    expect(result).toEqual({
      ok: false,
      error: "Backup có dữ liệu không hợp lệ trong wallets.",
    });
  });
});

describe("FINANCE-DATA-2 backup RPC boundary", () => {
  it("does not call restore RPC when client preflight fails", async () => {
    await expect(restoreFinanceBackup({})).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("restores a valid V2 backup with one atomic RPC call", async () => {
    const backup = makeBackup();
    mockRpc.mockResolvedValue({ data: { restored: true }, error: null });

    await expect(restoreFinanceBackup(backup)).resolves.toEqual({ error: null });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("restore_finance_backup", {
      p_backup: backup,
    });
  });

  it("exports one complete snapshot through a single RPC call", async () => {
    const backup = makeBackup();
    mockRpc.mockResolvedValue({ data: backup, error: null });

    await expect(exportFinanceBackup()).resolves.toEqual(backup);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("export_finance_backup");
  });

  it("rejects an invalid payload returned by the export RPC", async () => {
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await expect(exportFinanceBackup()).rejects.toThrow(
      "File không phải backup MyFinance hợp lệ.",
    );
  });
});
