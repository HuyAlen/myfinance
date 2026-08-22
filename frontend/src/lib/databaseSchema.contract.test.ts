import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = path.resolve(__dirname, "../../../supabase/schema.sql");
const duplicateSchemaPath = path.resolve(__dirname, "../../supabase_schema.sql");
const sql = readFileSync(schemaPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

const financeDomains = [
  "wallets", "categories", "transactions", "debts", "goals", "budgets",
  "investments", "savings", "saving_transactions", "forex_accounts",
  "forex_cash_transactions",
] as const;

const aiTables = [
  "ai_user_settings", "ai_conversations", "ai_messages", "ai_pending_actions",
  "ai_action_audit_logs", "ai_usage_logs",
] as const;

const requiredRpcs = [
  "create_finance_transaction", "update_finance_transaction",
  "delete_finance_transaction", "create_saving_account",
  "create_saving_movement", "delete_saving_account",
  "create_forex_cash_transaction", "update_forex_cash_transaction",
  "delete_forex_cash_transaction", "export_finance_backup",
  "restore_finance_backup",
] as const;

const forexRpcs = [
  "create_forex_cash_transaction",
  "update_forex_cash_transaction",
  "delete_forex_cash_transaction",
] as const;

describe("DB-SSOT-1 canonical Supabase schema", () => {
  it("is the only complete schema baseline and contains every current application table", () => {
    expect(sql).toContain("MyFinance - Canonical Supabase Schema (DB-SSOT-1)");
    expect(existsSync(duplicateSchemaPath)).toBe(false);
    for (const table of [...financeDomains, ...aiTables]) {
      expect(normalized).toContain(`create table if not exists public.${table}`);
    }
  });

  it("preserves every FINANCE-DATA-2 domain and the atomic RPC surface", () => {
    for (const table of financeDomains) expect(normalized).toContain(`public.${table}`);
    for (const rpc of requiredRpcs) expect(normalized).toContain(`function public.${rpc}`);
  });

  it("tracks current transaction metadata and the live-verified finance enums", () => {
    for (const column of [
      "transfer_fee", "exchange_rate", "transfer_reference",
      "transfer_reference_type", "source_type", "destination_type",
    ]) expect(sql).toContain(column);

    for (const enumDefinition of [
      "create type category_type as enum ('income', 'expense')",
      "create type investment_type as enum ('stock', 'crypto', 'fund', 'gold', 'other')",
      "create type recurrence_freq as enum ('daily', 'weekly', 'monthly', 'yearly')",
      "create type transaction_type as enum ('income', 'expense', 'transfer', 'saving', 'investment')",
      "create type wallet_type as enum ('cash', 'bank', 'ewallet', 'investment')",
    ]) {
      expect(normalized).toContain(enumDefinition);
    }
  });

  it("preserves the live-verified Savings UUID/cardinality/default contract", () => {
    expect(normalized).toContain("create table if not exists public.savings ( id uuid not null default gen_random_uuid()");
    expect(normalized).toContain("user_id uuid default auth.uid()");
    expect(normalized).toContain("wallet_id text");
    expect(normalized).toContain("updated_at timestamptz not null default now()");
    expect(normalized).toContain("create table if not exists public.saving_transactions ( id uuid not null default gen_random_uuid()");
    expect(normalized).toContain("saving_id uuid not null references public.savings(id) on delete cascade");
    expect(normalized).toContain("transaction_date date not null default current_date");
    expect(normalized).toContain("type in ('savings_account','term_deposit','certificate','emergency_fund')");
    expect(normalized).toContain("constraint savings_balance_check check (balance >= 0)");
    expect(normalized).toContain("constraint saving_transactions_amount_check check (amount > 0)");
  });

  it("tracks the live-verified Forex UUID/table/RPC contract", () => {
    expect(normalized).toContain("create table if not exists public.forex_accounts ( id uuid not null");
    expect(normalized).toContain("create table if not exists public.forex_cash_transactions ( id uuid not null");
    expect(normalized).toContain("forex_account_id uuid not null references public.forex_accounts(id) on delete cascade");
    expect(normalized).toContain("transaction_time time not null default localtime");
    expect(normalized).toContain("transacted_at timestamptz");
    expect(normalized).toMatch(/function public\.create_forex_cash_transaction\(\s*p_id uuid/);
    expect(normalized).toMatch(/function public\.update_forex_cash_transaction\(\s*p_id uuid/);
    expect(normalized).toMatch(/function public\.delete_forex_cash_transaction\(\s*p_id uuid\)/);
    expect(normalized).toContain("v_wallet_delta := -(v_amount + v_fee)");
  });

  it("mirrors the live-verified finance CHECK/FK contract without stricter reconstructed constraints", () => {
    expect(normalized).toContain("constraint categories_default_amount_check check");
    expect(normalized).toContain("constraint categories_recurrence_check check");
    expect(normalized).toContain("recurrence is null or recurrence in ('daily','weekly','monthly','yearly')");
    expect(normalized).toContain("constraint categories_default_wallet_fk foreign key (default_wallet_id) references public.wallets(id) on delete set null");

    expect(normalized).toContain("constraint savings_wallet_id_fkey foreign key (wallet_id) references public.wallets(id)");
    expect(normalized).toContain("constraint saving_transactions_wallet_id_fkey foreign key (wallet_id) references public.wallets(id)");

    expect(normalized).toContain("constraint forex_accounts_currency_check check (currency ~ '^[a-z]{3}$')");
    expect(normalized).toContain("constraint forex_cash_transactions_amount_check check (amount > 0)");
    expect(normalized).toContain("constraint forex_cash_transactions_fee_check check (fee >= 0)");
    expect(normalized).toContain("constraint forex_cash_transactions_currency_check check (currency ~ '^[a-z]{3}$')");
    expect(normalized).toContain("constraint forex_cash_transactions_wallet_id_fkey foreign key (wallet_id) references public.wallets(id) on delete restrict");

    expect(normalized).toContain("transfer_reference_type in ('saving','investment','debt')");
    expect(normalized).not.toContain("transactions_transfer_fee_nonnegative");
    expect(normalized).not.toContain("transactions_exchange_rate_positive");
    expect(normalized).not.toContain("savings_name_nonempty");
    expect(normalized).not.toContain("forex_accounts_name_nonempty");
    expect(normalized).not.toContain("forex_accounts_current_equity_nonnegative");
  });

  it("mirrors the live-verified finance secondary-index contract", () => {
    for (const indexDefinition of [
      "create index if not exists idx_wallets_user_id on public.wallets (user_id)",
      "create index if not exists idx_categories_user_recurring_next_run on public.categories (user_id, next_run_date) where is_recurring = true",
      "create index if not exists savings_user_id_created_at_idx on public.savings (user_id, created_at desc)",
      "create index if not exists idx_savings_wallet_id on public.savings (wallet_id)",
      "create index if not exists saving_transactions_saving_id_date_idx on public.saving_transactions (saving_id, transaction_date desc, created_at desc)",
      "create index if not exists idx_saving_transactions_wallet_id on public.saving_transactions (wallet_id)",
      "create index if not exists forex_accounts_user_id_idx on public.forex_accounts (user_id)",
      "create index if not exists forex_cash_transactions_account_date_idx on public.forex_cash_transactions (forex_account_id, transaction_date desc)",
      "create index if not exists forex_cash_transactions_user_id_idx on public.forex_cash_transactions (user_id)",
      "create index if not exists forex_cash_transactions_wallet_id_idx on public.forex_cash_transactions (wallet_id)",
    ]) {
      expect(normalized).toContain(indexDefinition);
    }

    for (const reconstructedIndex of [
      "idx_categories_recurring",
      "idx_savings_user_id",
      "idx_saving_transactions_user_date",
      "idx_saving_transactions_saving_id",
      "idx_forex_accounts_user_id",
      "idx_forex_cash_user_date",
      "idx_forex_cash_account_date",
      "idx_forex_cash_wallet",
    ]) {
      expect(normalized).not.toContain(`create index if not exists ${reconstructedIndex} `);
    }
  });

  it("enables RLS and scopes user-owned policies to auth.uid()", () => {
    expect(normalized).toContain("alter table public.%i enable row level security");
    expect(normalized).toContain("using (auth.uid() = user_id)");
    expect(normalized).toContain("with check (auth.uid() = user_id)");
    for (const table of financeDomains) expect(sql).toContain(`'${table}'`);
  });

  it("mirrors the live-verified effective RLS policy contract without reproducing duplicate AI policies", () => {
    expect(normalized).toContain("create policy saving_transactions_insert on public.saving_transactions for insert with check ( auth.uid() = user_id and exists ( select 1 from public.savings s where s.id = saving_transactions.saving_id and s.user_id = auth.uid() ) )");
    expect(normalized).toContain("create policy forex_cash_transactions_insert on public.forex_cash_transactions for insert with check ( auth.uid() = user_id and exists ( select 1 from public.forex_accounts account where account.id = forex_cash_transactions.forex_account_id and account.user_id = auth.uid() ) )");
    expect(normalized).toContain("create policy forex_cash_transactions_update on public.forex_cash_transactions for update using (auth.uid() = user_id) with check ( auth.uid() = user_id and exists ( select 1 from public.forex_accounts account where account.id = forex_cash_transactions.forex_account_id and account.user_id = auth.uid() ) )");

    expect(normalized).toContain("create policy ai_pending_actions_insert on public.ai_pending_actions for insert to authenticated with check (auth.uid() = user_id)");
    expect(normalized).toContain("create policy ai_pending_actions_delete on public.ai_pending_actions for delete to authenticated using (auth.uid() = user_id)");
    expect(normalized).toContain("create policy ai_action_audit_logs_insert on public.ai_action_audit_logs for insert to authenticated with check (auth.uid() = user_id)");
    expect(normalized).toContain("create policy ai_action_audit_logs_delete on public.ai_action_audit_logs for delete to authenticated using (auth.uid() = user_id)");

    expect(normalized).toContain("create policy ai_user_settings_update on public.ai_user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id)");
    expect(normalized).not.toContain("create policy ai_user_settings_delete");

    expect(normalized).toContain("redundant case-variant copies for ai_conversations/ai_messages");
  });

  it("preserves verified RPC security modes and authenticated-only execute grants", () => {
    expect(normalized).toContain("security invoker");
    expect(normalized).toContain("set search_path = public, pg_temp");

    for (const rpc of forexRpcs) {
      const start = normalized.indexOf(`function public.${rpc}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const body = normalized.slice(start, start + 10000);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path to 'public'");
    }

    for (const rpc of requiredRpcs) {
      expect(normalized).toMatch(new RegExp(`revoke all on function public\\.${rpc}[^;]* from public`));
      expect(normalized).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]* to authenticated`));
    }
  });

  it("hardens Supabase default ACLs instead of reproducing live anon/broad table grants", () => {
    for (const rpc of requiredRpcs) {
      expect(normalized).toMatch(new RegExp(`revoke all on function public\\.${rpc}[^;]* from public, anon`));
    }

    expect(normalized).toContain("revoke all on table public.wallets, public.categories, public.transactions");
    expect(normalized).toContain("public.ai_action_audit_logs, public.ai_usage_logs from anon, authenticated");

    expect(normalized).toContain("grant select, insert, update, delete on table public.wallets");
    expect(normalized).toContain("public.ai_conversations, public.ai_messages, public.ai_pending_actions to authenticated");
    expect(normalized).toContain("grant select, insert, update on table public.ai_user_settings to authenticated");
    expect(normalized).toContain("grant select, insert, delete on table public.ai_action_audit_logs to authenticated");
    expect(normalized).toContain("grant select, insert on table public.ai_usage_logs to authenticated");
  });

  it("does not restore the legacy permissive public read-write policy", () => {
    expect(normalized).not.toContain("public read-write");
    expect(normalized).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(normalized).not.toMatch(/with check\s*\(\s*true\s*\)/);
  });
});
