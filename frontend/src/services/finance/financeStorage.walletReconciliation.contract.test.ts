import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "financeStorage.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("WALLET-RECONCILIATION-CENTER-1 storage", () => {
  it("reads durable reconciliation receipts newest first", () => {
    expect(source).toContain('from("wallet_reconciliations")');
    expect(source).toContain('.order("reconciled_at", { ascending: false })');
    expect(source).toContain("getWalletReconciliations");
  });

  it("writes through the atomic reconciliation RPC", () => {
    expect(source).toContain('rpc("reconcile_wallet_balance_atomic"');
    expect(source).toContain("p_expected_balance");
    expect(source).toContain("p_actual_balance");
    expect(source).toContain("p_note");
  });

  it("maps stale balance to an explicit conflict result", () => {
    expect(source).toContain('case "MFR02"');
    expect(source).toContain('code: "conflict"');
  });
});
