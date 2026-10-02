import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(process.cwd(), "supabase/savings-internal-transfer-1.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-INTERNAL-TRANSFER-1 SQL contract", () => {
  it("locks both savings in deterministic order and rejects self-transfer", () => {
    expect(sql).toContain("ORDER BY id");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("p_source_saving_id = p_destination_saving_id");
    expect(sql).toContain("ERRCODE = 'MFS07'");
  });

  it("moves equal value without touching wallet/main transaction ledgers", () => {
    expect(sql).toContain("balance = balance - p_amount");
    expect(sql).toContain("balance = balance + p_amount");
    expect(sql).not.toContain("UPDATE wallets");
    expect(sql).not.toContain("create_finance_transaction(");
    expect(sql).not.toContain("INSERT INTO transactions");
  });

  it("writes paired savings ledger rows with one shared reference", () => {
    expect(sql).toContain("'withdraw'");
    expect(sql).toContain("'deposit'");
    expect(sql).toContain("__saving_transfer__:");
    expect(sql).toContain("v_transfer_reference");
  });
});
