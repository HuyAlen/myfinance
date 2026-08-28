-- ============================================================================
-- MyFinance DB-SSOT-1 - Read-only schema verification
--
-- Run this against an existing Supabase project before/after reviewed forward
-- migrations. Every statement below is read-only: no DDL/DML is performed.
-- The canonical clean-install baseline is supabase/schema.sql.
-- ============================================================================

-- 1) Required application tables and RLS state.
WITH required(table_name) AS (
  VALUES
    ('wallets'), ('categories'), ('transactions'), ('debts'), ('goals'),
    ('budgets'), ('investments'), ('savings'), ('saving_transactions'),
    ('forex_accounts'), ('forex_cash_transactions'), ('ai_user_settings'),
    ('ai_conversations'), ('ai_messages'), ('ai_pending_actions'),
    ('ai_action_audit_logs'), ('ai_usage_logs')
)
SELECT
  r.table_name,
  c.oid IS NOT NULL AS exists,
  COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM required r
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid
  AND c.relname = r.table_name
  AND c.relkind IN ('r', 'p')
ORDER BY r.table_name;

-- 2a) Finance columns, types, nullability, and defaults. Kept separate from
--     AI so Supabase SQL Editor result caps do not truncate the output.
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.numeric_precision,
  c.numeric_scale
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 2b) AI columns, types, nullability, and defaults.
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
    'ai_action_audit_logs','ai_usage_logs'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 3) Primary/unique/foreign/check constraints and exact definitions.
SELECT
  c.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    ELSE con.contype::text
  END AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS validated
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
    'ai_action_audit_logs','ai_usage_logs'
  )
ORDER BY table_name, constraint_type, constraint_name;

-- 4) Index definitions.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
    'ai_action_audit_logs','ai_usage_logs'
  )
ORDER BY tablename, indexname;

-- 5) RLS policies, including USING and WITH CHECK expressions.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
    'ai_action_audit_logs','ai_usage_logs'
  )
ORDER BY tablename, policyname;

-- 6) Required RPCs: exact identity arguments, result type, security mode,
--    and function definition. SECURITY INVOKER means prosecdef=false.
WITH required(function_name) AS (
  VALUES
    ('create_finance_transaction'),
    ('update_finance_transaction'),
    ('delete_finance_transaction'),
    ('assert_finance_transaction_effects'),
    ('delete_category_atomic'),
    ('create_saving_account'),
    ('create_saving_movement'),
    ('delete_saving_account'),
    ('create_forex_cash_transaction'),
    ('update_forex_cash_transaction'),
    ('delete_forex_cash_transaction'),
    ('delete_forex_account_atomic'),
    ('export_finance_backup'),
    ('restore_finance_backup')
)
SELECT
  r.function_name,
  p.oid IS NOT NULL AS exists,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  NOT p.prosecdef AS security_invoker,
  p.proconfig AS function_config,
  CASE WHEN p.oid IS NULL THEN NULL ELSE pg_get_functiondef(p.oid) END AS definition
FROM required r
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = r.function_name
ORDER BY r.function_name, identity_arguments;

-- 7) Effective table/function ACLs for application roles. A hardened baseline
--    expects no anon table privileges and no anon/PUBLIC EXECUTE on application
--    mutation/backup RPCs; authenticated receives only the operations used by
--    the application. This intentionally exposes broad Supabase default ACLs as
--    deployment drift instead of silently accepting them.
WITH target_tables AS (
  SELECT c.oid, c.relname AS object_name, c.relowner, c.relacl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname IN (
      'wallets','categories','transactions','debts','goals','budgets','investments',
      'savings','saving_transactions','forex_accounts','forex_cash_transactions',
      'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
      'ai_action_audit_logs','ai_usage_logs'
    )
),
table_grants AS (
  SELECT
    'TABLE'::text AS object_type,
    t.object_name,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
    a.privilege_type
  FROM target_tables t
  CROSS JOIN LATERAL aclexplode(COALESCE(t.relacl, acldefault('r', t.relowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
),
target_functions AS (
  SELECT
    p.oid,
    p.proname,
    p.proowner,
    p.proacl,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_finance_transaction','update_finance_transaction','delete_finance_transaction',
      'assert_finance_transaction_effects','delete_category_atomic',
      'create_saving_account','create_saving_movement','delete_saving_account',
      'create_forex_cash_transaction','update_forex_cash_transaction','delete_forex_cash_transaction',
      'delete_forex_account_atomic',
      'export_finance_backup','restore_finance_backup'
    )
),
function_grants AS (
  SELECT
    'FUNCTION'::text AS object_type,
    f.proname || '(' || f.identity_arguments || ')' AS object_name,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
    a.privilege_type
  FROM target_functions f
  CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
)
SELECT
  object_type,
  object_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM (
  SELECT * FROM table_grants
  UNION ALL
  SELECT * FROM function_grants
) grants
WHERE grantee IN ('PUBLIC','anon','authenticated','service_role','postgres')
GROUP BY object_type, object_name, grantee
ORDER BY object_type, object_name, grantee;

-- 8) Triggers used by the baseline, including auth.users category seeding.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND (
    (n.nspname = 'public' AND c.relname IN (
      'wallets','categories','transactions','debts','goals','budgets','investments',
      'savings','saving_transactions','forex_accounts','forex_cash_transactions',
      'ai_user_settings','ai_conversations','ai_pending_actions'
    ))
    OR (n.nspname = 'auth' AND c.relname = 'users')
  )
ORDER BY schema_name, table_name, trigger_name;

-- 9) Realtime publication membership for persisted finance domains.
WITH required(table_name) AS (
  VALUES
    ('wallets'), ('categories'), ('transactions'), ('debts'), ('goals'),
    ('budgets'), ('investments'), ('forex_accounts'), ('forex_cash_transactions')
)
SELECT
  r.table_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables p
    WHERE p.pubname = 'supabase_realtime'
      AND p.schemaname = 'public'
      AND p.tablename = r.table_name
  ) AS in_supabase_realtime
FROM required r
ORDER BY r.table_name;

-- 10) Database enum labels used by the finance baseline.
SELECT
  t.typname AS enum_name,
  e.enumsortorder,
  e.enumlabel
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND t.typname IN ('wallet_type','category_type','transaction_type','recurrence_freq','investment_type')
ORDER BY t.typname, e.enumsortorder;
