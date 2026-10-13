import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: "account-1" } } } })) },
    rpc,
    from: vi.fn(),
  },
}));

const {
  FINANCE_BACKUP_DOMAINS,
  exportFinanceBackup,
  restoreFinanceBackup,
  resetFinanceDemoData,
  clearAllUserData,
} = await import("./financeStorage");

const workspace = "22222222-2222-4222-8222-222222222222";
const backup = {
  format: "myfinance-backup",
  version: 4,
  exported_at: "2026-10-13T06:00:00Z",
  data: Object.fromEntries(FINANCE_BACKUP_DOMAINS.map((name) => [name, []])),
};
const receipt = {
  restored: true,
  verified: true,
  source_version: 4,
  counts: Object.fromEntries(FINANCE_BACKUP_DOMAINS.map((name) => [name, 0])),
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string, args?: { p_backup?: { data: Record<string, unknown[]> } }) => {
    if (name === "export_finance_backup_scoped") return { data: backup, error: null };
    if (name === "restore_finance_backup_scoped" && args?.p_backup) {
      const counts = Object.fromEntries(FINANCE_BACKUP_DOMAINS.map((domain) => [
        domain, args.p_backup!.data[domain].length,
      ])) as Record<string, number>;
      if (counts.net_worth_snapshots === 0 &&
        ["wallets", "savings", "investments", "debts", "forex_accounts", "forex_cash_transactions"]
          .some((domain) => counts[domain] > 0)) {
        counts.net_worth_snapshots = 1;
      }
      return { data: { ...receipt, counts }, error: null };
    }
    return { data: null, error: { code: "MFB06", message: "denied" } };
  });
});

describe("SETTINGS-HOUSEHOLD-DATA-SAFETY-1 service boundary", () => {
  it("exports only with the server-checked expected workspace", async () => {
    await expect(exportFinanceBackup(workspace)).resolves.toEqual(backup);
    expect(rpc).toHaveBeenCalledWith("export_finance_backup_scoped", { p_expected_household_id: workspace });
  });
  it("restores only through the scoped RPC and retains atomic receipt verification", async () => {
    await expect(restoreFinanceBackup(backup, workspace)).resolves.toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith("restore_finance_backup_scoped", {
      p_expected_household_id: workspace,
      p_backup: backup,
    });
  });
  it("uses the scoped restore RPC for both reset and clear", async () => {
    await expect(resetFinanceDemoData(workspace)).resolves.toEqual({ error: null });
    await expect(clearAllUserData(workspace)).resolves.toEqual({ error: null });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every((args) => args[0] === "restore_finance_backup_scoped")).toBe(true);
  });
  it("never falls back to legacy RPC on an explicit malformed workspace ID", async () => {
    await expect(exportFinanceBackup("not-uuid")).rejects.toThrow(/không gian tài chính/);
    await expect(restoreFinanceBackup(backup, "not-uuid")).resolves.toMatchObject({ error: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("maps permission rejection into a clear, non-destructive error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "MFB06", message: "denied" } });
    await expect(restoreFinanceBackup(backup, workspace)).resolves.toMatchObject({ error: expect.stringContaining("không gian") });
  });
});
