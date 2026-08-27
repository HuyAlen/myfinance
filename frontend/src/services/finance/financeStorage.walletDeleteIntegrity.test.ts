import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const storage = readFileSync(path.resolve(__dirname, "financeStorage.ts"), "utf8").replace(/\r\n/g, "\n");
const walletsPage = readFileSync(
  path.resolve(__dirname, "../../components/wallets/WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const schema = readFileSync(
  path.resolve(__dirname, "../../../../supabase/schema.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const migration = readFileSync(
  path.resolve(__dirname, "../../../supabase/wallet-integrity-2-atomic-wallet-delete.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const databaseTypes = readFileSync(
  path.resolve(__dirname, "../../lib/database.types.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

function sliceFunction(source: string, signature: string, nextSignature: string) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("WALLETS-INTEGRITY-2 atomic wallet delete contract", () => {
  it("routes wallet deletion exclusively through delete_wallet_atomic and fails closed", () => {
    const fn = sliceFunction(
      storage,
      "export async function deleteWallet(",
      "export async function hasWalletReferences(",
    );

    expect(fn).toContain('supabase.rpc("delete_wallet_atomic"');
    expect(fn).toContain("p_wallet_id: walletId");
    expect(storage).toContain('case "PGRST202"');
    expect(fn).not.toContain('.from("wallets")');
    expect(fn).not.toContain(".delete()");
  });

  it("keeps the client preflight broad but explicitly non-authoritative", () => {
    const fn = sliceFunction(
      storage,
      "export async function hasWalletReferences(",
      "export async function getTransactionWalletLinks(",
    );

    for (const table of [
      "transactions",
      "forex_cash_transactions",
      "savings",
      "saving_transactions",
    ]) {
      expect(fn).toContain(`.from("${table}")`);
    }
    expect(fn).toContain('.eq("walletId", walletId)');
    expect(fn).toContain('.eq("transferToWalletId", walletId)');
    expect(fn.match(/\.eq\("wallet_id", walletId\)/g)?.length).toBe(3);
    expect(storage).toContain("This check is NOT the correctness boundary");
  });

  it("defines same-user transaction wallet FKs and a destination reference index in the canonical schema", () => {
    const normalized = schema.replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain(
      "constraint wallets_user_id_id_key unique (user_id, id)",
    );
    expect(normalized).toContain(
      'constraint transactions_wallet_id_fkey foreign key (user_id, "walletid") references public.wallets(user_id, id) on delete restrict',
    );
    expect(normalized).toContain(
      'constraint transactions_transfer_to_wallet_id_fkey foreign key (user_id, "transfertowalletid") references public.wallets(user_id, id) on delete restrict',
    );
    expect(normalized).toContain(
      'create index if not exists idx_transactions_transfer_to_wallet on public.transactions (user_id, "transfertowalletid") where "transfertowalletid" is not null',
    );
  });

  it("makes delete_wallet_atomic the server-authoritative lock/check/delete boundary", () => {
    const normalized = schema.replace(/\s+/g, " ").toLowerCase();
    const start = normalized.indexOf(
      "create or replace function public.delete_wallet_atomic(p_wallet_id text)",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const body = normalized.slice(start, start + 7000);

    expect(body).toContain("security invoker");
    expect(body).toContain("for update");
    expect(body).toContain("from public.transactions");
    expect(body).toContain("from public.forex_cash_transactions");
    expect(body).toContain("from public.savings");
    expect(body).toContain("from public.saving_transactions");
    expect(body).toContain("when foreign_key_violation then");
    expect(body).toContain("errcode = 'mfw02'");
    expect(body).toContain("delete from public.wallets");
    expect(normalized).toContain(
      "revoke all on function public.delete_wallet_atomic(text) from public, anon",
    );
    expect(normalized).toContain(
      "grant execute on function public.delete_wallet_atomic(text) to authenticated",
    );
  });

  it("uses NOT VALID forward FKs so legacy orphans cannot block deployment while new writes remain protected", () => {
    const normalized = migration.replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("begin;");
    expect(normalized).toContain("commit;");
    expect(normalized).toContain(
      "constraint transactions_wallet_id_fkey foreign key (user_id, \"walletid\") references public.wallets(user_id, id) on delete restrict not valid",
    );
    expect(normalized).toContain(
      "constraint transactions_transfer_to_wallet_id_fkey foreign key (user_id, \"transfertowalletid\") references public.wallets(user_id, id) on delete restrict not valid",
    );
    expect(normalized).toContain(
      "validate constraint transactions_wallet_id_fkey",
    );
    expect(normalized).toContain(
      "validate constraint transactions_transfer_to_wallet_id_fkey",
    );
    expect(normalized).toContain("legacy source-wallet orphan(s)");
    expect(normalized).toContain("legacy destination-wallet orphan(s)");
  });

  it("keeps Supabase generated types aligned with the new RPC and composite relationships", () => {
    expect(databaseTypes).toContain("delete_wallet_atomic:");
    expect(databaseTypes).toContain("Args: { p_wallet_id: string }");
    expect(databaseTypes).toContain(
      'foreignKeyName: "transactions_wallet_id_fkey"',
    );
    expect(databaseTypes).toContain(
      'foreignKeyName: "transactions_transfer_to_wallet_id_fkey"',
    );
    expect(databaseTypes).toContain('columns: ["user_id", "walletId"]');
    expect(databaseTypes).toContain(
      'columns: ["user_id", "transferToWalletId"]',
    );
    expect(databaseTypes).toContain('referencedColumns: ["user_id", "id"]');
  });

  it("reconciles the Wallet UI when the authoritative delete detects a late reference or missing wallet", () => {
    const fn = sliceFunction(
      walletsPage,
      "async function handleConfirmDelete()",
      "// ─── RENDER",
    );
    expect(fn).toContain('const { error, code } = await deleteWallet(');
    expect(fn).toContain('code === "referenced"');
    expect(fn).toContain('code === "not_found"');
    expect(fn.match(/await runReload\(\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(walletsPage).toContain(
      "this is only an early UX preflight",
    );
  });
});
