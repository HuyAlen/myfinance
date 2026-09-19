import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "frontend/supabase/forex-balance-asof-1b.sql",
);
const schemaPath = path.join(repoRoot, "supabase/schema.sql");
const storagePath = path.join(__dirname, "financeStorage.ts");

const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const schema = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";
const storage = readFileSync(storagePath, "utf8");
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

function rpcStorageBlock(name: string, nextMarker: string): string {
  const start = storage.indexOf(`export async function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = storage.indexOf(nextMarker, start);
  expect(end).toBeGreaterThan(start);
  return storage.slice(start, end);
}

describe("FOREX-BALANCE-ASOF-1B atomic snapshot writes", () => {
  it("ships one transactional forward migration and exact canonical overlay parity", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(schemaPath)).toBe(true);
    expect(normalizedMigration).toContain("begin;");
    expect(normalizedMigration).toMatch(/commit;$/);

    const migrationBody = migration
      .slice(
        migration.indexOf("BEGIN;") + "BEGIN;".length,
        migration.lastIndexOf("COMMIT;"),
      )
      .trim();
    const overlayStart = schema.indexOf(
      "-- BEGIN FOREX-BALANCE-ASOF-1B CANONICAL OVERLAY",
    );
    const overlayEnd = schema.indexOf(
      "-- END FOREX-BALANCE-ASOF-1B CANONICAL OVERLAY",
    );
    expect(overlayStart).toBeGreaterThanOrEqual(0);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    const overlay = schema
      .slice(schema.indexOf("\n", overlayStart) + 1, overlayEnd)
      .trim();
    expect(normalize(overlay)).toBe(normalize(migrationBody));
  });

  it("keeps snapshot history after ledger deletion and keeps the client read-only", () => {
    expect(normalizedMigration).toContain(
      "foreign key (source_transaction_id) references public.forex_cash_transactions(id) on delete set null",
    );
    expect(normalizedMigration).toContain(
      "revoke all on table public.forex_balance_snapshots from public, anon, authenticated",
    );
    expect(normalizedMigration).toContain(
      "grant select on table public.forex_balance_snapshots to authenticated",
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.capture_forex_balance_snapshot(uuid,uuid,numeric,text,uuid) from public, anon, authenticated",
    );
    const helper = functionBody("capture_forex_balance_snapshot");
    expect(helper).toContain("captured_at");
    expect(helper).toContain("now()");
    expect(helper).not.toContain("p_transaction_date");

    const snapshotReads = storage
      .split('.from("forex_balance_snapshots")')
      .length - 1;
    expect(snapshotReads).toBe(1);
    expect(storage).not.toContain('.from("forex_balance_snapshots").insert(');
    expect(storage).not.toContain('.from("forex_balance_snapshots").update(');
    expect(storage).not.toContain('.from("forex_balance_snapshots").delete(');
  });

  it("routes account creation and manual Balance updates through atomic RPCs", () => {
    const add = rpcStorageBlock("addForexAccount", "export async function updateForexAccount(");
    const update = rpcStorageBlock("updateForexAccount", "export async function deleteForexAccount(");
    expect(add).toContain('supabase.rpc("create_forex_account_atomic"');
    expect(update).toContain('supabase.rpc("update_forex_account_atomic"');
    expect(add).not.toContain('.from("forex_accounts")');
    expect(update).not.toContain('.from("forex_accounts")');

    const createAccount = functionBody("create_forex_account_atomic");
    const updateAccount = functionBody("update_forex_account_atomic");
    expect(createAccount).toContain("insert into public.forex_accounts");
    expect(createAccount).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, p_id, p_current_equity, 'manual', null )",
    );
    expect(updateAccount).toContain("set name = trim(p_name)");
    expect(updateAccount).toContain("current_equity = p_current_equity");
    expect(updateAccount).toContain(
      "p_current_equity is distinct from v_old.current_equity",
    );
    expect(updateAccount).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, p_id, p_current_equity, 'manual', null )",
    );
  });

  it("deposit and withdrawal commit Balance, wallet, ledger, and snapshot together with fees excluded from Balance", () => {
    const body = functionBody("create_forex_cash_transaction");
    expect(body).toContain(
      "v_balance_delta := case when p_type = 'deposit' then v_amount else -v_amount end",
    );
    expect(body).toContain("v_wallet_delta := -(v_amount + v_fee)");
    expect(body).toContain("v_wallet_delta := v_amount - v_fee");
    expect(body).toContain("insert into public.forex_cash_transactions");
    expect(body).toContain("set current_equity = v_new_balance");
    expect(body).toContain("set balance = balance + v_wallet_delta");
    expect(body).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, p_forex_account_id, v_new_balance, p_type, v_result.id )",
    );
    const ledgerAt = body.indexOf("insert into public.forex_cash_transactions");
    const accountAt = body.indexOf("update public.forex_accounts");
    const walletAt = body.indexOf("update public.wallets");
    const snapshotAt = body.indexOf("perform public.capture_forex_balance_snapshot(");
    expect(snapshotAt).toBeGreaterThan(ledgerAt);
    expect(snapshotAt).toBeGreaterThan(accountAt);
    expect(snapshotAt).toBeGreaterThan(walletAt);
    expect(body).not.toContain("v_balance_delta := v_amount + v_fee");
    expect(body).not.toContain("v_balance_delta := v_amount - v_fee");
  });

  it("edits same-account transactions with one final snapshot", () => {
    const body = functionBody("update_forex_cash_transaction");
    expect(body).toContain("if p_forex_account_id = v_old.forex_account_id then");
    expect(body).toContain(
      "v_same_account_balance := v_old_account_balance + v_reverse_old_balance_delta + v_apply_new_balance_delta",
    );
    expect(body).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, p_forex_account_id, v_same_account_balance, p_type, p_id )",
    );
  });

  it("edits across accounts by snapshotting both the reversed old account and applied new account", () => {
    const body = functionBody("update_forex_cash_transaction");
    expect(body).toContain(
      "set current_equity = v_old_account_balance + v_reverse_old_balance_delta",
    );
    expect(body).toContain(
      "set current_equity = v_new_account_balance + v_apply_new_balance_delta",
    );
    expect(body).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, v_old.forex_account_id, v_old_account_balance + v_reverse_old_balance_delta, v_old.type, p_id )",
    );
    expect(body).toContain(
      "perform public.capture_forex_balance_snapshot( v_user_id, p_forex_account_id, v_new_account_balance + v_apply_new_balance_delta, p_type, p_id )",
    );
    expect(body).not.toContain("v_apply_new_balance_delta := v_amount + v_fee");
    expect(body).not.toContain("v_apply_new_balance_delta := v_amount - v_fee");
  });

  it("deletes by reversing Balance and wallet, capturing the result, then deleting the ledger", () => {
    const body = functionBody("delete_forex_cash_transaction");
    expect(body).toContain(
      "v_reverse_balance_delta := case when v_transaction.type = 'deposit' then -v_transaction.amount else v_transaction.amount end",
    );
    expect(body).toContain("set current_equity = v_new_balance");
    expect(body).toContain("set balance = balance + v_reverse_wallet_delta");

    const snapshotAt = body.indexOf("perform public.capture_forex_balance_snapshot(");
    const deleteAt = body.indexOf("delete from public.forex_cash_transactions");
    expect(snapshotAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(snapshotAt);
    expect(body).toContain(
      "v_transaction.forex_account_id, v_new_balance, v_transaction.type, v_transaction.id",
    );
  });

  it("fails closed: snapshot errors are not swallowed, so PostgreSQL rolls the entire RPC statement back", () => {
    const helper = functionBody("capture_forex_balance_snapshot");
    expect(helper).toContain("insert into public.forex_balance_snapshots");
    expect(helper).toContain("raise exception");

    for (const name of [
      "create_forex_account_atomic",
      "update_forex_account_atomic",
      "create_forex_cash_transaction",
      "update_forex_cash_transaction",
      "delete_forex_cash_transaction",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("public.capture_forex_balance_snapshot(");
      expect(body).not.toContain("exception when");
    }
  });

  it("keeps every public mutation RPC authenticated-only", () => {
    for (const signature of [
      "create_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric)",
      "update_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric)",
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
