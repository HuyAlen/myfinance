-- MYFINANCE-RECONCILIATION-RPC-DEPLOY-1 / REVIEWED FOR PRODUCTION USE
-- MUTATING DDL. Execute only after staging test and explicit deployment approval.
-- Deploys exactly one missing SECURITY INVOKER read-only RPC; no finance rows change.
-- Preconditions are anchored to the production preflight of 2026-10-09 09:01 UTC.
-- Aborts on pre-existing overloads or unexpected table/privilege/policy drift.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $reconciliation_rpc_preflight$
DECLARE
  v_table_oid oid;
  v_scope_oid oid;
  v_rpc_count integer;
  v_column_count integer;
  v_rls_enabled boolean;
BEGIN
  SELECT c.oid, c.relrowsecurity
    INTO v_table_oid, v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'wallet_reconciliations'
    AND c.relkind IN ('r', 'p');

  IF v_table_oid IS NULL OR NOT COALESCE(v_rls_enabled, false) THEN
    RAISE EXCEPTION 'MFRPC01: Reconciliation table absent or RLS disabled';
  END IF;

  SELECT count(*)
    INTO v_column_count
  FROM pg_attribute a
  WHERE a.attrelid = v_table_oid
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname = ANY(ARRAY[
      'id','user_id','wallet_id','expected_balance','actual_balance',
      'difference','note','actor_user_id','reconciled_at','created_at'
    ]::name[]);

  IF v_column_count <> 10 THEN
    RAISE EXCEPTION 'MFRPC01: Reconciliation receipt columns drifted';
  END IF;

  IF NOT has_table_privilege('authenticated', v_table_oid, 'SELECT')
     OR has_table_privilege('anon', v_table_oid, 'SELECT') THEN
    RAISE EXCEPTION 'MFRPC01: Unexpected reconciliation table SELECT permissions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'wallet_reconciliations'
      AND pol.cmd IN ('SELECT', 'ALL')
      AND pol.roles && ARRAY['authenticated','public']::name[]
      AND COALESCE(pol.qual, '') ILIKE '%current_finance_scope_owner_user_id%'
  ) THEN
    RAISE EXCEPTION 'MFRPC01: Required household-scoped read policy missing';
  END IF;

  v_scope_oid := to_regprocedure('public.current_finance_scope_owner_user_id()');
  IF v_scope_oid IS NULL
     OR NOT has_function_privilege('authenticated', v_scope_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_scope_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'MFRPC01: Finance-scope helper missing or ACL drifted';
  END IF;

  SELECT count(*) INTO v_rpc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_wallet_reconciliation_coverage';

  IF v_rpc_count <> 0 THEN
    RAISE EXCEPTION 'MFRPC01: RPC already exists or has overloads; verify instead of replacing';
  END IF;
END;
$reconciliation_rpc_preflight$;

-- Read model exactly matches WALLET-RECONCILIATION-COVERAGE-SSOT-1 and
-- supabase/schema.sql. SECURITY INVOKER keeps caller's table RLS in force.
CREATE FUNCTION public.get_wallet_reconciliation_coverage()
RETURNS SETOF public.wallet_reconciliations
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (wr.wallet_id) wr.*
  FROM public.wallet_reconciliations AS wr
  WHERE wr.user_id = public.current_finance_scope_owner_user_id()
  ORDER BY wr.wallet_id, wr.reconciled_at DESC, wr.id DESC;
$$;

-- Explicitly undo the broad Supabase function default grants for this RPC.
REVOKE ALL ON FUNCTION public.get_wallet_reconciliation_coverage()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_reconciliation_coverage() TO authenticated;

COMMENT ON FUNCTION public.get_wallet_reconciliation_coverage() IS
  'Returns the latest reconciliation receipt per wallet for the active finance scope; uncapped coverage read model.';

DO $reconciliation_rpc_postflight$
DECLARE
  v_rpc_oid oid := to_regprocedure('public.get_wallet_reconciliation_coverage()');
  v_rpc pg_proc%ROWTYPE;
  v_count integer;
  v_path text;
BEGIN
  IF v_rpc_oid IS NULL THEN
    RAISE EXCEPTION 'MFRPC01: RPC missing after CREATE';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_wallet_reconciliation_coverage';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MFRPC01: Unexpected RPC overload after CREATE';
  END IF;

  SELECT * INTO v_rpc FROM pg_proc WHERE oid = v_rpc_oid;
  v_path := regexp_replace(COALESCE(array_to_string(v_rpc.proconfig, ','), ''), '[[:space:]]+', '', 'g');

  IF v_rpc.prosecdef
     OR v_rpc.provolatile <> 's'
     OR v_rpc.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql')
     OR NOT v_rpc.proretset
     OR v_rpc.prorettype <> 'public.wallet_reconciliations'::regtype
     OR v_path <> 'search_path=public,pg_temp' THEN
    RAISE EXCEPTION 'MFRPC01: RPC security, return type, or search_path mismatch';
  END IF;

  IF has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'MFRPC01: RPC grants mismatch after CREATE';
  END IF;
END;
$reconciliation_rpc_postflight$;

-- Ask PostgREST to refresh the new function signature after commit.
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Run reconciliation-rpc-deploy-1-verify.sql as a separate, read-only query.
