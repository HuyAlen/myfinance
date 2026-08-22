-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE-ENGINE-2.0.1 — Deployment verification queries (ALL READ-ONLY)
--
-- Run each section in the Supabase SQL Editor, in order. Nothing here
-- mutates data or schema. Paste results back for review before applying
-- finance-engine-2-atomic-transactions.sql, and again after applying it.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — BEFORE migration: confirm the live "transactions" schema.
--
-- financeStorage.ts and the new RPCs assume these columns exist:
--   id, user_id, type, amount, "categoryId", "walletId", note, date,
--   "transferToWalletId", "isRecurring", recurrence, "nextRunDate",
--   transfer_fee, exchange_rate, transfer_reference,
--   transfer_reference_type, source_type, destination_type,
--   created_at, updated_at
-- The last 6 were missing from the legacy baseline when FINANCE-ENGINE-2
-- shipped. DB-SSOT-1 now tracks them in /supabase/schema.sql; this historical
-- query remains useful for checking an existing live database for drift.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'wallets'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'forex_cash_transactions'
ORDER BY ordinal_position;

-- Primary keys and other constraints on transactions/wallets, for context.
SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('transactions', 'wallets')
ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position;

-- Enum values actually accepted by transaction_type / recurrence_freq —
-- the RPC casts p_type::transaction_type and p_recurrence::recurrence_freq,
-- so confirm these enums still contain exactly what the app sends
-- ('income'/'expense'/'transfer' and 'daily'/'weekly'/'monthly'/'yearly').
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('transaction_type', 'recurrence_freq')
ORDER BY t.typname, e.enumsortorder;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Manual decision point.
--
-- If STEP 1's first query is missing any of transfer_fee / exchange_rate /
-- transfer_reference / transfer_reference_type / source_type /
-- destination_type: DO NOT run finance-engine-2-atomic-transactions.sql yet.
-- The INSERT/UPDATE column lists in that file will fail with
-- "column ... does not exist" for any column that's actually missing, and
-- the migration will not partially apply (CREATE FUNCTION either succeeds
-- whole or fails whole — Postgres parses the function body at creation
-- time only loosely for plpgsql, but a genuinely missing column referenced
-- in a plain SQL statement inside the body will still surface at CREATE
-- time or at first CALL; either way, do not proceed past this check
-- without confirming the columns exist).
--
-- If all columns are present with compatible types (numeric for
-- transfer_fee/exchange_rate, text for the rest): proceed to apply
-- finance-engine-2-atomic-transactions.sql.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — AFTER applying finance-engine-2-atomic-transactions.sql:
-- confirm the 3 functions exist with the expected security type.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_finance_transaction',
    'update_finance_transaction',
    'delete_finance_transaction'
  );
-- Expected: all three rows present, security_type = 'INVOKER' for all three.

-- Exact parameter list/order/types as actually registered — compare this
-- against the p_* keys financeStorage.ts sends (see the .rpc(...) calls in
-- src/services/finance/financeStorage.ts) to catch any silent drift.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_arguments(p.oid) AS full_arguments,
       pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_finance_transaction',
    'update_finance_transaction',
    'delete_finance_transaction'
  );

-- Confirm PUBLIC has no execute grant and `authenticated` does — i.e. the
-- REVOKE/GRANT statements at the end of the migration actually took effect.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_finance_transaction',
    'update_finance_transaction',
    'delete_finance_transaction'
  )
ORDER BY routine_name, grantee;
-- Expected: no row with grantee = 'PUBLIC'; a row with grantee =
-- 'authenticated' (or a role that includes it) and privilege_type = 'EXECUTE'
-- for each of the three functions.
