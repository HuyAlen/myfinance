-- ============================================================================
-- WALLETS-INTEGRITY-2 - read-only deployment verification
-- Run AFTER wallet-integrity-2-atomic-wallet-delete.sql.
-- ============================================================================

-- 1) Transaction wallet FKs: both must exist. convalidated=false is allowed
-- only when the corresponding legacy-orphan count below is > 0.
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS validated
FROM pg_constraint con
WHERE con.conrelid = 'public.transactions'::regclass
  AND con.conname IN (
    'transactions_wallet_id_fkey',
    'transactions_transfer_to_wallet_id_fkey'
  )
ORDER BY con.conname;

-- 2) Legacy orphan audit. A non-zero result does not mean the migration failed:
-- NOT VALID FKs still protect new/updated rows and parent deletes.
SELECT 'source_wallet_orphans' AS check_name, count(*) AS orphan_count
FROM public.transactions t
LEFT JOIN public.wallets w
  ON w.user_id = t.user_id AND w.id = t."walletId"
WHERE w.id IS NULL
UNION ALL
SELECT 'destination_wallet_orphans', count(*)
FROM public.transactions t
LEFT JOIN public.wallets w
  ON w.user_id = t.user_id AND w.id = t."transferToWalletId"
WHERE t."transferToWalletId" IS NOT NULL
  AND w.id IS NULL;

-- 3) RPC shape/security.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  NOT p.prosecdef AS security_invoker,
  p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_wallet_atomic';

-- 4) RPC body must contain the wallet row lock and all reference domains.
SELECT pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'delete_wallet_atomic';

-- 5) Execute grant: authenticated yes, PUBLIC/anon no.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'delete_wallet_atomic'
ORDER BY grantee;

-- 6) Destination reference index exists.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_transactions_transfer_to_wallet';
