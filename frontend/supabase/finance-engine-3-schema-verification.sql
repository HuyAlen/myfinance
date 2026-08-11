-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE-ENGINE-3 — Schema Verification Script (READ-ONLY)
--
-- STATUS: this script has already been run once against the live database
-- and finance-engine-3-savings-atomic.sql has been reconciled with the
-- confirmed results (see that file's own header for the verified facts:
-- savings.id/saving_transactions.id/saving_transactions.saving_id are
-- uuid, not text; the savings type CHECK excludes 'other'; RLS is enabled
-- with auth.uid() = user_id policies; create_finance_transaction's
-- deployed signature matches the tracked FINANCE-ENGINE-2 definition).
--
-- Kept as a reusable diagnostic, not a one-time artifact: re-run this
-- script immediately before actually applying finance-engine-3-savings-
-- atomic.sql, in case the schema has drifted again since it was last
-- checked — schema verification is a point-in-time fact, not a permanent
-- guarantee.
--
-- Every statement here is read-only (information_schema / pg_catalog
-- SELECTs) — it makes no changes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Column definitions for every table the new migration touches ───────
select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('savings', 'saving_transactions', 'wallets', 'transactions')
order by table_name, ordinal_position;

-- Confirmed live shape (finance-engine-3-savings-atomic.sql matches this):
--
-- savings:
--   id             uuid        not null   (primary key)
--   user_id        uuid        not null
--   name           text
--   type           text        -- CHECK: 'savings_account'|'term_deposit'|'certificate'|'emergency_fund' (NOT 'other')
--   balance        numeric     not null default 0, CHECK (balance >= 0)
--   wallet_id      text        null
--   interest_rate  numeric     null
--   maturity_date  date        null
--   notes          text        null
--   created_at     timestamptz
--   updated_at     timestamptz
--
-- saving_transactions:
--   id                uuid        not null   (primary key)
--   saving_id         uuid        not null, FK -> savings.id ON DELETE CASCADE
--   user_id           uuid        not null
--   type              text        -- 'deposit'|'withdraw'|'interest'|'settlement'
--   amount            numeric     CHECK (amount > 0)
--   transaction_date  date
--   note              text        null
--   wallet_id         text        null
--   created_at        timestamptz
--
-- Re-run the query below to reconfirm nothing has drifted since.


-- ── 2. Constraints (PK/FK/CHECK/UNIQUE) on the same tables ────────────────
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('savings', 'saving_transactions', 'wallets', 'transactions')
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- Confirmed:
--   - "savings" has `savings_balance_check CHECK (balance >= 0)`.
--     delete_saving_account still rejects `balance <> 0` (not just `> 0`)
--     rather than relying on this constraint — belt-and-suspenders, not a
--     sign it's unneeded.
--   - "saving_transactions.saving_id" has an FK to savings.id with
--     ON DELETE CASCADE. This means deleting a "savings" row alone already
--     deletes its saving_transactions history automatically — the explicit
--     DELETE FROM saving_transactions in delete_saving_account is
--     therefore redundant with the FK, kept only so the ledger deletion
--     isn't an invisible side effect. Neither wallets.id nor
--     saving_transactions.wallet_id/savings.wallet_id carry a matching FK
--     (both are plain TEXT columns, same as transactions.walletId) — a
--     wallet delete does NOT cascade into savings/saving_transactions.


-- ── 3. RLS status + policies on the same tables ────────────────────────────
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('savings', 'saving_transactions', 'wallets', 'transactions')
  and relnamespace = 'public'::regnamespace;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('savings', 'saving_transactions', 'wallets', 'transactions')
order by tablename, policyname;

-- Confirmed: RLS is enabled on savings, saving_transactions, wallets, and
-- transactions, with policies restricting rows to `auth.uid() = user_id`.
-- Every new function in finance-engine-3-savings-atomic.sql is SECURITY
-- INVOKER specifically so RLS remains the independent second check
-- underneath its own auth.uid()/ownership logic — this is why SECURITY
-- DEFINER was never used.


-- ── 4. Deployed create_finance_transaction() signature ─────────────────────
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.proconfig as config -- look for search_path here
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_finance_transaction',
    'update_finance_transaction',
    'delete_finance_transaction'
  )
order by p.proname;

-- Confirmed: the deployed create_finance_transaction has 9 required +
-- 12 DEFAULT-valued arguments matching supabase/finance-engine-2-atomic-
-- transactions.sql's tracked definition exactly (name, order, and type),
-- and is GRANTed to authenticated/postgres/service_role.
--
-- finance-engine-3-savings-atomic.sql's create_saving_movement() calls it
-- by NAME with NAMED arguments (p_id =>, p_type =>, ...), not positionally
-- — so the nested call stays safe even if further optional parameters are
-- added to the deployed function later. It requires only these named
-- parameters, all confirmed present with matching types:
--   p_id text, p_type text, p_amount numeric, p_category_id text,
--   p_wallet_id text, p_note text, p_date date,
--   p_effect_wallet_id_1 text, p_effect_delta_1 numeric,
--   p_transfer_reference text, p_transfer_reference_type text,
--   p_source_type text, p_destination_type text
-- (all other create_finance_transaction parameters are optional/DEFAULT
-- NULL and are not passed by create_saving_movement — confirmed body
-- inspection shows no validation path requires them for p_type='transfer'
-- with a single wallet effect; see finance-engine-3-savings-atomic.sql's
-- header for the full semantic reasoning.)


-- ── 5. Existing grants on the Finance Engine functions (sanity check) ──────
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'create_finance_transaction',
    'create_saving_account',
    'create_saving_movement',
    'delete_saving_account'
  )
order by routine_name, grantee;

-- Confirm create_finance_transaction is already GRANTed EXECUTE to
-- "authenticated" (required for create_saving_movement's nested call to
-- succeed under RLS/SECURITY INVOKER — the invoking user must themselves
-- be allowed to execute it, since SECURITY INVOKER runs with the caller's
-- privileges, not elevated ones). The three new functions won't appear
-- here until finance-engine-3-savings-atomic.sql has been applied.
-- ═══════════════════════════════════════════════════════════════════════════
