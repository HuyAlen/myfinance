import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(process.cwd(), "supabase/investment-capital-flow-ssot-1.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("INVESTMENT-CAPITAL-FLOW-SSOT-1 SQL contract", () => {
  it("allows fully withdrawn Portfolio principal without allowing negative invested amount", () => {
    expect(sql).toContain(
      'constraint investments_invested_nonnegative check ("investedamount" >= 0)',
    );
  });

  it("owns Wallet + Investment + main-ledger mutation inside one RPC", () => {
    expect(sql).toContain(
      "create or replace function public.create_investment_capital_movement",
    );
    expect(sql).toContain("from public.investments");
    expect(sql).toContain("from public.wallets");
    expect(sql).toContain("for update");
    expect(sql).toContain("update public.wallets");
    expect(sql).toContain("update public.investments");
    expect(sql).toContain("insert into public.transactions");
  });

  it("writes explicit Investment ownership and direction metadata", () => {
    expect(sql).toContain("transfer_reference_type");
    expect(sql).toContain("'investment'");
    expect(sql).toContain("'wallet'");
    expect(sql).toContain("p_investment_id");
  });

  it("moves invested amount and current value together to preserve existing unrealized P/L", () => {
    expect(sql).toContain('"investedamount" = "investedamount" + case');
    expect(sql).toContain('"currentvalue" = "currentvalue" + case');
    expect(sql).toContain("insufficient investment capital/value");
  });

  it("prevents direct principal edits after canonical capital history exists", () => {
    expect(sql).toContain(
      "create or replace function public.update_investment_snapshot_atomic",
    );
    expect(sql).toContain(
      "p_invested_amount is distinct from v_existing.\"investedamount\"",
    );
    expect(sql).toContain("errcode = 'mfi08'");
  });

  it("prevents deleting an Investment once canonical capital history exists", () => {
    expect(sql).toContain(
      "create or replace function public.delete_investment_atomic",
    );
    expect(sql).toContain("transfer_reference_type = 'investment'");
    expect(sql).toContain("transfer_reference = p_investment_id");
    expect(sql).toContain("errcode = 'mfi07'");
  });

  it("keeps both mutation RPCs authenticated-only", () => {
    expect(sql).toContain(
      "grant execute on function public.create_investment_capital_movement",
    );
    expect(sql).toContain(
      "grant execute on function public.update_investment_snapshot_atomic",
    );
    expect(sql).toContain(
      "grant execute on function public.delete_investment_atomic(text) to authenticated",
    );
  });
});