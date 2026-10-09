-- WALLET-RECONCILIATION-STATUS-UX-1 / READ ONLY / CATALOG ONLY
-- Run after reviewed migration. Does not invoke RPCs or access finance rows.
WITH ids AS (
  SELECT
    to_regclass('public.wallets')::oid AS wallet_oid,
    to_regclass('public.wallet_reconciliations')::oid AS receipt_oid,
    to_regprocedure('public.wallet_balance_revision_guard()')::oid AS guard_oid,
    to_regprocedure('public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)')::oid AS rpc_oid,
    to_regprocedure('public.get_wallet_reconciliation_coverage()')::oid AS coverage_oid
),
observed AS (
  SELECT i.*,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'reconcile_wallet_balance_atomic') AS rpc_count,
    (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = i.wallet_oid
     AND t.tgname = 'trg_wallet_balance_revision'
     AND t.tgenabled = 'O' AND (t.tgtype & 1) = 1
     AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4
     AND (t.tgtype & 16) = 16 AND NOT t.tgisinternal
     AND t.tgfoid = i.guard_oid) AS active_trigger_count,
    (SELECT a.attnotnull FROM pg_attribute a WHERE a.attrelid = i.wallet_oid
     AND a.attname = 'balance_revision' AND NOT a.attisdropped) AS wallet_revision_notnull,
    (SELECT a.attnotnull FROM pg_attribute a WHERE a.attrelid = i.receipt_oid
     AND a.attname = 'balance_revision' AND NOT a.attisdropped) AS receipt_revision_notnull,
    (SELECT pg_get_functiondef(i.rpc_oid)) AS rpc_source
  FROM ids i
),
checks AS (
  SELECT 'WALLET_REVISION_EXISTS'::text AS check_id,
    wallet_revision_notnull IS TRUE AS passed FROM observed
  UNION ALL SELECT 'RECEIPT_REVISION_EXISTS',
    receipt_revision_notnull IS FALSE FROM observed
  UNION ALL SELECT 'WALLET_REVISION_DEFAULT_ZERO', EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = o.wallet_oid AND a.attname = 'balance_revision'
      AND pg_get_expr(d.adbin, d.adrelid) IN ('0', '0::bigint')
  ) FROM observed o
  UNION ALL SELECT 'WALLET_REVISION_TRIGGER', active_trigger_count = 1 FROM observed
  UNION ALL SELECT 'REVISION_GUARD_INVOKER', EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = o.guard_oid AND NOT prosecdef
      AND regexp_replace(COALESCE(array_to_string(proconfig, ','), ''), '[[:space:]]+', '', 'g') = 'search_path=public,pg_temp'
  ) FROM observed o
  UNION ALL SELECT 'REVISION_GUARD_ANON_DENIED', guard_oid IS NOT NULL
    AND NOT has_function_privilege('anon', guard_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'REVISION_GUARD_CLIENT_DENIED', guard_oid IS NOT NULL
    AND NOT has_function_privilege('authenticated', guard_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'RECONCILE_RPC_SINGLE', rpc_count = 1 FROM observed
  UNION ALL SELECT 'RECONCILE_RPC_SECURITY', EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = o.rpc_oid AND prosecdef
      AND regexp_replace(COALESCE(array_to_string(proconfig, ','), ''), '[[:space:]]+', '', 'g') = 'search_path=public,pg_temp'
  ) FROM observed o
  UNION ALL SELECT 'RECONCILE_RPC_EQUAL_CONFIRMATION',
    rpc_source ILIKE '%IF p_actual_balance IS DISTINCT FROM p_expected_balance THEN%'
    AND rpc_source NOT ILIKE '%No reconciliation needed%' FROM observed
  UNION ALL SELECT 'RECONCILE_RPC_RECORDS_REVISION',
    rpc_source ILIKE '%RETURNING balance_revision INTO v_balance_revision%'
    AND rpc_source ILIKE '%v_note, v_actor_user_id, v_balance_revision%' FROM observed
  UNION ALL SELECT 'RECONCILE_RPC_ANON_DENIED', rpc_oid IS NOT NULL
    AND NOT has_function_privilege('anon', rpc_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'RECONCILE_RPC_AUTH_EXECUTE', rpc_oid IS NOT NULL
    AND has_function_privilege('authenticated', rpc_oid, 'EXECUTE') FROM observed
  UNION ALL SELECT 'RECEIPT_RLS_ENABLED', EXISTS (
    SELECT 1 FROM pg_class WHERE oid = o.receipt_oid AND relrowsecurity
  ) FROM observed o
  UNION ALL SELECT 'RECEIPT_AUTH_READ_ONLY', receipt_oid IS NOT NULL
    AND has_table_privilege('authenticated', receipt_oid, 'SELECT')
    AND NOT has_table_privilege('authenticated', receipt_oid, 'INSERT,UPDATE,DELETE')
    FROM observed
  UNION ALL SELECT 'RECEIPT_ANON_DENIED', receipt_oid IS NOT NULL
    AND NOT has_table_privilege('anon', receipt_oid, 'SELECT,INSERT,UPDATE,DELETE')
    FROM observed
  UNION ALL SELECT 'COVERAGE_READ_INVOCER', EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = o.coverage_oid AND NOT prosecdef
  ) FROM observed o
  UNION ALL SELECT 'COVERAGE_ANON_DENIED', coverage_oid IS NOT NULL
    AND NOT has_function_privilege('anon', coverage_oid, 'EXECUTE') FROM observed
),
scored AS (
  SELECT check_id, CASE WHEN COALESCE(passed, false) THEN 'PASS' ELSE 'FAIL' END AS status
  FROM checks
)
SELECT check_id, status,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_checks,
       count(*) FILTER (WHERE status = 'PASS') OVER () AS passed_checks,
       CURRENT_TIMESTAMP AS checked_at
FROM scored
ORDER BY CASE status WHEN 'FAIL' THEN 0 ELSE 1 END, check_id;
