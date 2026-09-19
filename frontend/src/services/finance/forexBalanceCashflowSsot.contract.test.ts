import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "frontend/supabase/forex-balance-cashflow-ssot-1.sql",
);
const schemaPath = path.join(repoRoot, "supabase/schema.sql");
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const schema = readFileSync(schemaPath, "utf8");
const normalize = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
const normalizedMigration = normalize(migration);

function functionBody(name: string): string {
  const signature = `create or replace function public.${name}`;
  const start = normalizedMigration.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = normalizedMigration.indexOf(
    "create or replace function public.",
    start + signature.length,
  );
  return normalizedMigration.slice(start, next === -1 ? undefined : next);
}

describe("FOREX-BALANCE-CASHFLOW-SSOT-1", () => {
  it("ships one transactional forward migration and exact canonical overlay parity", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(normalizedMigration).toContain("begin;");
    expect(normalizedMigration).toMatch(/commit;$/);

    const migrationBody = migration
      .slice(
        migration.indexOf("BEGIN;") + "BEGIN;".length,
        migration.lastIndexOf("COMMIT;"),
      )
      .trim();
    const overlayStart = schema.indexOf(
      "-- BEGIN FOREX-BALANCE-CASHFLOW-SSOT-1 CANONICAL OVERLAY",
    );
    const overlayEnd = schema.indexOf(
      "-- END FOREX-BALANCE-CASHFLOW-SSOT-1 CANONICAL OVERLAY",
    );
    expect(overlayStart).toBeGreaterThanOrEqual(0);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    const overlay = schema
      .slice(schema.indexOf("\n", overlayStart) + 1, overlayEnd)
      .trim();
    expect(normalize(overlay)).toBe(normalize(migrationBody));
  });

  it("create atomically moves wallet cash and broker Balance with fee excluded from Balance", () => {
    const body = functionBody("create_forex_cash_transaction");
    expect(body).toContain(
      "v_user_id uuid := public.current_finance_write_owner_user_id()",
    );
    expect(body).toContain(
      "v_balance_delta := case when p_type = 'deposit' then v_amount else -v_amount end",
    );
    expect(body).toContain("v_wallet_delta := -(v_amount + v_fee)");
    expect(body).toContain("v_wallet_delta := v_amount - v_fee");
    expect(body).toContain("set current_equity = v_new_balance");
    expect(body).toContain("if v_new_balance < 0 then");
    expect(body).toContain("insert into public.forex_cash_transactions");
  });

  it("update reverses the old Balance effect then applies the new effect, including account moves", () => {
    const body = functionBody("update_forex_cash_transaction");
    expect(body).toContain(
      "v_reverse_old_balance_delta := case when v_old.type = 'deposit' then -v_old.amount else v_old.amount end",
    );
    expect(body).toContain(
      "v_apply_new_balance_delta := case when p_type = 'deposit' then v_amount else -v_amount end",
    );
    expect(body).toContain("if p_forex_account_id = v_old.forex_account_id then");
    expect(body).toContain(
      "v_same_account_balance := v_old_account_balance + v_reverse_old_balance_delta + v_apply_new_balance_delta",
    );
    expect(body).toContain(
      "set current_equity = v_old_account_balance + v_reverse_old_balance_delta",
    );
    expect(body).toContain(
      "set current_equity = v_new_account_balance + v_apply_new_balance_delta",
    );
    expect(body).toContain("order by id for update");
  });

  it("delete reverses both broker Balance and wallet cash in the same RPC", () => {
    const body = functionBody("delete_forex_cash_transaction");
    expect(body).toContain(
      "v_reverse_balance_delta := case when v_transaction.type = 'deposit' then -v_transaction.amount else v_transaction.amount end",
    );
    expect(body).toContain("set current_equity = v_new_balance");
    expect(body).toContain("set balance = balance + v_reverse_wallet_delta");
    expect(body).toContain("delete from public.forex_cash_transactions");
  });

  it("derives a missing legacy Balance from deposit/withdraw amounts only, never transfer fees", () => {
    expect(normalizedMigration).toContain(
      "sum(case when type = 'deposit' then amount else -amount end)",
    );
    expect(normalizedMigration).not.toContain(
      "sum(case when type = 'deposit' then amount - fee",
    );
  });

  it("keeps the RPC surface authenticated-only", () => {
    for (const signature of [
      "create_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text)",
      "update_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text)",
      "delete_forex_cash_transaction(uuid)",
    ]) {
      expect(normalizedMigration).toContain(
        `revoke all on function public.${signature} from public, anon`,
      );
      expect(normalizedMigration).toContain(
        `grant execute on function public.${signature} to authenticated`,
      );
    }
  });
});
