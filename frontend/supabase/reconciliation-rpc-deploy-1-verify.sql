-- MYFINANCE-RECONCILIATION-RPC-DEPLOY-1 / READ-ONLY VERIFICATION
-- Run before deployment (FAIL expected for absent RPC) and after (all PASS).
-- Catalog metadata and privileges only; never selects finance/household rows.
WITH objects AS (
  SELECT
    to_regprocedure('public.get_wallet_reconciliation_coverage()')::oid AS rpc_oid,
    to_regprocedure('public.current_finance_scope_owner_user_id()')::oid AS scope_oid,
    to_regclass('public.wallet_reconciliations')::oid AS receipt_table_oid
),
observed AS (
  SELECT o.*,
         proc.prosecdef, proc.provolatile, proc.prolang,
         proc.proretset, proc.prorettype, proc.proconfig,
         cls.relrowsecurity,
         (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'get_wallet_reconciliation_coverage') AS overload_count,
         EXISTS (
           SELECT 1 FROM pg_policies pol
           WHERE pol.schemaname = 'public'
             AND pol.tablename = 'wallet_reconciliations'
             AND pol.cmd IN ('SELECT', 'ALL')
             AND pol.roles && ARRAY['authenticated','public']::name[]
             AND COALESCE(pol.qual, '') ILIKE '%current_finance_scope_owner_user_id%'
         ) AS read_policy_present
  FROM objects o
  LEFT JOIN pg_proc proc ON proc.oid = o.rpc_oid
  LEFT JOIN pg_class cls ON cls.oid = o.receipt_table_oid
),
checks AS (
  SELECT 'RPC_PRESENT'::text AS check_id, rpc_oid IS NOT NULL AS passed FROM observed
  UNION ALL SELECT 'RPC_NO_EXTRA_OVERLOADS', overload_count = 1 FROM observed
  UNION ALL SELECT 'RPC_SECURITY_INVOKER', rpc_oid IS NOT NULL AND NOT prosecdef FROM observed
  UNION ALL SELECT 'RPC_STABLE', rpc_oid IS NOT NULL AND provolatile = 's' FROM observed
  UNION ALL SELECT 'RPC_LANGUAGE_SQL', rpc_oid IS NOT NULL
    AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') FROM observed
  UNION ALL SELECT 'RPC_RETURN_TYPE', rpc_oid IS NOT NULL
    AND proretset AND prorettype = to_regtype('public.wallet_reconciliations')::oid FROM observed
  UNION ALL SELECT 'RPC_SEARCH_PATH', rpc_oid IS NOT NULL
    AND regexp_replace(COALESCE(array_to_string(proconfig, ','), ''), '[[:space:]]+', '', 'g')
      = 'search_path=public,pg_temp' FROM observed
  UNION ALL SELECT 'RPC_ANON_DENIED', rpc_oid IS NOT NULL
    AND NOT has_function_privilege('anon', rpc_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'RPC_AUTH_EXECUTE', rpc_oid IS NOT NULL
    AND has_function_privilege('authenticated', rpc_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'RECEIPT_TABLE_RLS', receipt_table_oid IS NOT NULL
    AND relrowsecurity FROM observed
  UNION ALL SELECT 'RECEIPT_TABLE_AUTH_SELECT', receipt_table_oid IS NOT NULL
    AND has_table_privilege('authenticated', receipt_table_oid, 'SELECT') FROM observed
  UNION ALL SELECT 'RECEIPT_TABLE_ANON_DENIED', receipt_table_oid IS NOT NULL
    AND NOT has_table_privilege('anon', receipt_table_oid, 'SELECT') FROM observed
  UNION ALL SELECT 'RECEIPT_TABLE_SCOPE_POLICY', read_policy_present FROM observed
  UNION ALL SELECT 'SCOPE_HELPER_AUTH_ONLY', scope_oid IS NOT NULL
    AND has_function_privilege('authenticated', scope_oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', scope_oid, 'EXECUTE') FROM observed
),
scored AS (
  SELECT check_id,
         CASE WHEN COALESCE(passed, false) THEN 'PASS' ELSE 'FAIL' END AS status
  FROM checks
)
SELECT check_id, status,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_checks,
       count(*) FILTER (WHERE status = 'PASS') OVER () AS passed_checks,
       CURRENT_TIMESTAMP AS checked_at
FROM scored
ORDER BY CASE status WHEN 'FAIL' THEN 0 ELSE 1 END, check_id;
