-- MYFINANCE-PRODUCTION-DATA-AUDIT-1 / 01 PREFLIGHT
-- READ ONLY. Run first in the production Supabase SQL Editor.
-- One result grid only. No user IDs, emails, wallet balances, or transaction amounts.
-- Do not proceed to 02 unless missing critical tables/columns are resolved.
-- Baseline: git main 6f27cd833335fcca5f9bdcf92cb7f2549c7f58e3.
WITH
expected_tables(table_name, domain) AS (
  VALUES
    ('wallets','finance'), ('categories','finance'),
    ('transactions','finance'), ('debts','finance'),
    ('goals','finance'), ('budgets','finance'),
    ('investments','finance'), ('savings','finance'),
    ('saving_transactions','finance'), ('forex_accounts','finance'),
    ('forex_cash_transactions','finance'),
    ('net_worth_snapshots','finance'), ('forex_balance_snapshots','finance'),
    ('wallet_reconciliations','finance'), ('transaction_rules','finance'),
    ('transaction_review_acknowledgements','finance'),
    ('households','household'), ('household_members','household'),
    ('household_invites','household'), ('finance_workspace_preferences','household'),
    ('finance_audit_log','audit'),
    ('ai_user_settings','ai'), ('ai_conversations','ai'),
    ('ai_messages','ai'), ('ai_pending_actions','ai'),
    ('ai_action_audit_logs','ai'), ('ai_usage_logs','ai')
),
actual_tables AS (
  SELECT c.relname::text AS table_name, c.oid, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
expected_rpcs(function_name, sensitive) AS (
  VALUES
    ('create_finance_transaction',true),
    ('update_finance_transaction',true),
    ('delete_finance_transaction',true),
    ('create_saving_account',true),
    ('create_saving_movement',true),
    ('delete_saving_account',true),
    ('create_forex_account_atomic',true),
    ('update_forex_account_atomic',true),
    ('delete_forex_account_atomic',true),
    ('create_forex_cash_transaction',true),
    ('update_forex_cash_transaction',true),
    ('delete_forex_cash_transaction',true),
    ('create_investment_capital_movement',true),
    ('update_investment_snapshot_atomic',true),
    ('delete_investment_atomic',true),
    ('export_finance_backup',true),
    ('restore_finance_backup',true),
    ('clone_previous_month_budgets_atomic',true),
    ('reconcile_wallet_balance_atomic',true),
    ('get_wallet_reconciliation_coverage',false),
    ('current_finance_scope_owner_user_id',false),
    ('current_finance_write_owner_user_id',false),
    ('current_finance_admin_owner_user_id',false),
    ('switch_finance_workspace',true),
    ('accept_household_invite',true)
),
required_read_tables(table_name) AS (
  VALUES
    ('wallets'), ('categories'), ('transactions'), ('debts'),
    ('goals'), ('budgets'), ('investments'), ('savings'),
    ('saving_transactions'), ('forex_accounts'),
    ('forex_cash_transactions'), ('net_worth_snapshots'),
    ('forex_balance_snapshots'), ('wallet_reconciliations'),
    ('transaction_rules'), ('transaction_review_acknowledgements'),
    ('finance_audit_log')
),
required_rpc_signatures(identity) AS (
  VALUES
    ('public.export_finance_backup()'),
    ('public.restore_finance_backup(jsonb)'),
    ('public.clone_previous_month_budgets_atomic(text)'),
    ('public.get_wallet_reconciliation_coverage()'),
    ('public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)'),
    ('public.create_investment_capital_movement(text,text,text,text,numeric,date,text)')
),
actual_rpcs AS (
  SELECT p.oid, p.proname::text AS function_name, p.prosecdef,
         p.proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
required_fk(table_name, constraint_name) AS (
  VALUES
    ('transactions','transactions_wallet_id_fkey'),
    ('transactions','transactions_transfer_to_wallet_id_fkey'),
    ('budgets','budgets_category_owner_fk'),
    ('savings','savings_wallet_id_fkey'),
    ('saving_transactions','saving_transactions_wallet_id_fkey'),
    ('forex_cash_transactions','forex_cash_transactions_wallet_id_fkey'),
    ('forex_balance_snapshots','forex_balance_snapshots_source_transaction_id_fkey')
),
required_columns(table_name, column_name) AS (
  VALUES
    ('transactions','user_id'), ('transactions','walletId'),
    ('transactions','transferToWalletId'), ('transactions','transfer_reference_type'),
    ('savings','user_id'), ('savings','wallet_id'),
    ('saving_transactions','saving_id'), ('saving_transactions','wallet_id'),
    ('forex_cash_transactions','forex_account_id'),
    ('forex_cash_transactions','wallet_id'),
    ('forex_balance_snapshots','source_transaction_id'),
    ('investments','investedAmount'),
    ('finance_workspace_preferences','active_household_id'),
    ('transaction_review_acknowledgements','transaction_id')
),
checks AS (
  SELECT 'TABLE_PRESENT:' || e.table_name AS check_id, e.domain,
         'P0'::text AS priority,
         CASE WHEN a.oid IS NULL THEN 1 ELSE 0 END::bigint AS issue_count,
         'Required table exists'::text AS expectation
  FROM expected_tables e LEFT JOIN actual_tables a USING (table_name)

  UNION ALL
  SELECT 'RLS_ENABLED:' || e.table_name, e.domain, 'P0',
         CASE WHEN a.oid IS NULL OR NOT a.rls_enabled THEN 1 ELSE 0 END::bigint,
         'User-owned table has RLS enabled'
  FROM expected_tables e LEFT JOIN actual_tables a USING (table_name)

  UNION ALL
  SELECT 'ANON_TABLE_ACCESS:' || e.table_name, e.domain, 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN has_table_privilege('anon', a.oid,
                   'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
              THEN 1 ELSE 0 END::bigint,
         'No effective anon table privileges'
  FROM expected_tables e LEFT JOIN actual_tables a USING (table_name)

  UNION ALL
  SELECT 'AUTH_DANGEROUS_ACL:' || e.table_name, e.domain, 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN has_table_privilege('authenticated', a.oid,
                   'TRUNCATE,TRIGGER,REFERENCES')
              THEN 1 ELSE 0 END::bigint,
         'Authenticated cannot TRUNCATE, TRIGGER, or REFERENCES'
  FROM expected_tables e LEFT JOIN actual_tables a USING (table_name)

  UNION ALL
  SELECT 'AUTH_SELECT_ACCESS:' || r.table_name, 'security', 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN has_table_privilege('authenticated', a.oid, 'SELECT')
              THEN 0 ELSE 1 END::bigint,
         'Directly readable finance table grants SELECT to authenticated'
  FROM required_read_tables r
  LEFT JOIN actual_tables a ON a.table_name = r.table_name

  UNION ALL
  SELECT 'RLS_READ_POLICY:' || r.table_name, 'security', 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN EXISTS (
                SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = r.table_name
                  AND p.cmd IN ('SELECT', 'ALL')
                  AND p.roles && ARRAY['authenticated', 'public']::name[]
              ) THEN 0 ELSE 1 END::bigint,
         'Directly readable finance table has an authenticated read policy'
  FROM required_read_tables r
  LEFT JOIN actual_tables a ON a.table_name = r.table_name

  UNION ALL
  SELECT 'RPC_SIGNATURE:' || r.identity, 'rpc', 'P0',
         CASE WHEN to_regprocedure(r.identity) IS NULL THEN 1 ELSE 0 END::bigint,
         'Canonical critical RPC signature resolves exactly'
  FROM required_rpc_signatures r

  UNION ALL
  SELECT 'REQUIRED_COLUMN:' || e.table_name || '.' || e.column_name,
         'schema', 'P0',
         CASE WHEN c.column_name IS NULL THEN 1 ELSE 0 END::bigint,
         'Required application data column exists'
  FROM required_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = e.table_name
   AND c.column_name = e.column_name

  UNION ALL
  SELECT 'REQUIRED_RPC:' || e.function_name, 'rpc', 'P0',
         CASE WHEN count(p.oid) = 0 THEN 1 ELSE 0 END::bigint,
         'Required finance or household RPC exists'
  FROM expected_rpcs e
  LEFT JOIN actual_rpcs p USING (function_name)
  GROUP BY e.function_name

  UNION ALL
  SELECT 'ANON_RPC_EXECUTE:' || e.function_name, 'rpc', 'P0',
         count(p.oid) FILTER (
           WHERE COALESCE(has_function_privilege('anon', p.oid, 'EXECUTE'), false)
         )::bigint,
         'Anon must not execute this sensitive RPC (all overloads)'
  FROM expected_rpcs e
  LEFT JOIN actual_rpcs p USING (function_name)
  WHERE e.sensitive
  GROUP BY e.function_name

  UNION ALL
  SELECT 'DEFINER_SEARCH_PATH:' || p.function_name, 'rpc', 'P0',
         count(*) FILTER (
           WHERE p.prosecdef
             AND COALESCE(array_to_string(p.proconfig, ','), '') NOT ILIKE '%search_path=%'
         )::bigint,
         'SECURITY DEFINER RPC must pin its search_path'
  FROM actual_rpcs p
  JOIN expected_rpcs e USING (function_name)
  GROUP BY p.function_name

  UNION ALL
  SELECT 'FK_PRESENT:' || e.constraint_name, 'schema', 'P0',
         CASE WHEN count(con.oid) = 0 THEN 1 ELSE 0 END::bigint,
         'Canonical cross-domain foreign key exists'
  FROM required_fk e
  LEFT JOIN actual_tables t ON t.table_name = e.table_name
  LEFT JOIN pg_constraint con
    ON con.conrelid = t.oid AND con.conname = e.constraint_name
   AND con.contype = 'f'
  GROUP BY e.constraint_name

  UNION ALL
  SELECT 'FK_UNVALIDATED:' || e.constraint_name, 'schema', 'P1',
         count(con.oid) FILTER (WHERE NOT con.convalidated)::bigint,
         'Legacy NOT VALID constraint requires explicit orphan review'
  FROM required_fk e
  LEFT JOIN actual_tables t ON t.table_name = e.table_name
  LEFT JOIN pg_constraint con
    ON con.conrelid = t.oid AND con.conname = e.constraint_name
   AND con.contype = 'f'
  GROUP BY e.constraint_name

  UNION ALL
  SELECT 'PERMISSIVE_TRUE_RLS', 'security', 'P0',
         count(*)::bigint,
         'No permissive unconditional TRUE finance RLS policy'
  FROM pg_policies p
  JOIN expected_tables e ON e.table_name = p.tablename
  WHERE p.schemaname = 'public'
    AND p.permissive = 'PERMISSIVE'
    AND (
      regexp_replace(COALESCE(p.qual, ''), '[[:space:]()]', '', 'g') = 'true'
      OR regexp_replace(COALESCE(p.with_check, ''), '[[:space:]()]', '', 'g') = 'true'
    )

  UNION ALL
  SELECT 'AUDIT_AUTH_MUTATION_ACL', 'audit', 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN has_table_privilege('authenticated', a.oid, 'INSERT,UPDATE,DELETE')
              THEN 1 ELSE 0 END::bigint,
         'Finance audit log is append-only for authenticated clients'
  FROM (VALUES ('finance_audit_log')) AS expected(table_name)
  LEFT JOIN actual_tables a ON a.table_name = expected.table_name

  UNION ALL
  SELECT 'PREFERENCES_AUTH_DIRECT_ACL', 'household', 'P0',
         CASE WHEN a.oid IS NULL THEN 1
              WHEN has_table_privilege('authenticated', a.oid, 'SELECT,INSERT,UPDATE,DELETE')
              THEN 1 ELSE 0 END::bigint,
         'Active workspace preference is RPC-only for authenticated clients'
  FROM (VALUES ('finance_workspace_preferences')) AS expected(table_name)
  LEFT JOIN actual_tables a ON a.table_name = expected.table_name

  UNION ALL
  SELECT 'HOUSEHOLD_LEGACY_USER_UNIQUE', 'household', 'P0',
         count(*)::bigint,
         'Multi-workspace membership must not be blocked by UNIQUE(user_id)'
  FROM pg_constraint con
  JOIN actual_tables a ON a.oid = con.conrelid
  WHERE a.table_name = 'household_members'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) = 'UNIQUE (user_id)'
),
-- Consolidate table/RPC checks into compact groups to avoid SQL Editor row caps.
-- Names of affected schema objects (never row IDs) appear in expectation.
compact_checks AS (
  SELECT split_part(check_id, ':', 1) AS check_id,
         domain, priority,
         sum(issue_count)::bigint AS issue_count,
         CASE WHEN sum(issue_count) > 0
           THEN 'Affected objects: ' || LEFT(
             string_agg(check_id, ', ' ORDER BY check_id)
               FILTER (WHERE issue_count > 0), 500
           )
           ELSE max(expectation) || ' (' || count(*) || ' objects verified)'
         END AS expectation
  FROM checks
  GROUP BY split_part(check_id, ':', 1), domain, priority
),
scored AS (
  SELECT check_id, domain, priority, issue_count, expectation,
         CASE WHEN issue_count = 0 THEN 'PASS'
              WHEN priority = 'P0' THEN 'FAIL'
              ELSE 'WARN' END AS status
  FROM compact_checks
)
SELECT check_id, domain, priority, status, issue_count, expectation,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_checks,
       count(*) FILTER (WHERE status = 'WARN') OVER () AS warning_checks,
       CURRENT_TIMESTAMP AS checked_at
FROM scored
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
         domain, check_id;
