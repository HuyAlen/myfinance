-- MYFINANCE-PROD-ACL-DRIFT-1 / PHASE 2 / PROPOSED REMEDIATION
-- NOT a read-only query. DO NOT RUN on production until reviewed and approved.
-- Scope: 20 named public application tables and four existing mutation RPCs.
-- No rows, amounts, RLS policies, functions bodies, or service_role grants are changed.
-- Based on production ACL diagnostics 2026-10-09 08:33 UTC.
-- Default privileges and missing get_wallet_reconciliation_coverage() are OUT OF SCOPE.
-- Atomic and fail-closed: errors before COMMIT roll back all privilege changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $acl_phase2$
DECLARE
  v_target record;
  v_table_oid oid;
  v_rls boolean;
  v_privilege text;
  v_rpc_signature text;
  v_rpc_oid oid;
  v_rpc_name text;
  v_count bigint;
  v_anon_role oid;
  v_auth_role oid;
BEGIN
  SELECT oid INTO v_anon_role FROM pg_roles WHERE rolname = 'anon';
  SELECT oid INTO v_auth_role FROM pg_roles WHERE rolname = 'authenticated';
  IF v_anon_role IS NULL OR v_auth_role IS NULL THEN
    RAISE EXCEPTION 'PDA-ACL-1: Required Postgres role missing';
  END IF;

  -- Exact allowlist verified against the canonical MyFinance public schema.
  -- Every expected DML operation must be present BEFORE and AFTER remediation.
  FOR v_target IN
    SELECT * FROM (VALUES
      ('wallets', 'SELECT,INSERT,UPDATE,DELETE'),
      ('categories', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('debts', 'SELECT,INSERT,UPDATE,DELETE'),
      ('goals', 'SELECT,INSERT,UPDATE,DELETE'),
      ('budgets', 'SELECT,INSERT,UPDATE,DELETE'),
      ('investments', 'SELECT,INSERT,UPDATE,DELETE'),
      ('savings', 'SELECT,INSERT,UPDATE,DELETE'),
      ('saving_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('forex_accounts', 'SELECT,INSERT,UPDATE,DELETE'),
      ('forex_cash_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transaction_rules', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transaction_review_acknowledgements', 'SELECT,INSERT,DELETE'),
      ('wallet_reconciliations', 'SELECT'),
      ('ai_user_settings', 'SELECT,INSERT,UPDATE'),
      ('ai_conversations', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_messages', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_pending_actions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_action_audit_logs', 'SELECT,INSERT,DELETE'),
      ('ai_usage_logs', 'SELECT,INSERT')
    ) AS expected(table_name, allowed_authenticated_dml)
  LOOP
    SELECT c.oid, c.relrowsecurity INTO v_table_oid, v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_target.table_name
      AND c.relkind IN ('r','p');

    IF v_table_oid IS NULL OR NOT COALESCE(v_rls, false) THEN
      RAISE EXCEPTION 'PDA-ACL-1: Missing table or RLS disabled: %', v_target.table_name;
    END IF;

    FOREACH v_privilege IN ARRAY string_to_array(v_target.allowed_authenticated_dml, ',')
    LOOP
      IF NOT has_table_privilege('authenticated', v_table_oid, v_privilege) THEN
        RAISE EXCEPTION 'PDA-ACL-1: Required authenticated privilege missing before patch: %.%',
          v_target.table_name, v_privilege;
      END IF;
    END LOOP;

    -- Column-specific anon/PUBLIC grants are outside the preceding diagnostics.
    -- Fail rather than silently leave anonymous column access open.
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) g
      WHERE a.attrelid = v_table_oid AND a.attnum > 0 AND NOT a.attisdropped
        AND g.grantee IN (0::oid, v_anon_role)
    ) THEN
      RAISE EXCEPTION 'PDA-ACL-1: Unexpected PUBLIC/anon column ACL: %', v_target.table_name;
    END IF;

    -- Only the 20 named tables; no schema-wide privilege changes.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', v_target.table_name);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM authenticated',
       v_target.table_name);
    -- MAINTAIN is supported by PostgreSQL 17+; older versions do not parse it.
    IF current_setting('server_version_num')::int >= 170000 THEN
      EXECUTE format('REVOKE MAINTAIN ON TABLE public.%I FROM authenticated',
         v_target.table_name);
    END IF;
  END LOOP;

  -- Four observed application DML overgrants. No other DML is revoked.
  REVOKE UPDATE ON TABLE public.ai_action_audit_logs FROM authenticated;
  REVOKE UPDATE, DELETE ON TABLE public.ai_usage_logs FROM authenticated;
  REVOKE DELETE ON TABLE public.ai_user_settings FROM authenticated;
  REVOKE UPDATE ON TABLE public.transaction_review_acknowledgements FROM authenticated;

  -- Exact RPC signatures: refuse any overload drift instead of touching extras.
  FOREACH v_rpc_signature IN ARRAY ARRAY[
      'public.create_saving_account(uuid,text,text,numeric,text,uuid,date,numeric,date,text)',
      'public.create_saving_movement(uuid,text,text,numeric,text,date,uuid,text)',
      'public.delete_forex_account_atomic(uuid)',
      'public.delete_saving_account(uuid)'
  ]::text[]
  LOOP
    v_rpc_oid := to_regprocedure(v_rpc_signature);
    v_rpc_name := split_part(split_part(v_rpc_signature, '.', 2), '(', 1);
    SELECT count(*) INTO v_count FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_rpc_name;
    IF v_rpc_oid IS NULL OR v_count <> 1 THEN
      RAISE EXCEPTION 'PDA-ACL-1: Missing or unexpected overload for % (count=%)',
        v_rpc_signature, v_count;
    END IF;
    IF NOT has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PDA-ACL-1: authenticated EXECUTE missing for %', v_rpc_signature;
    END IF;
    -- Revoke exact existing public function only; preserve authenticated EXECUTE.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', v_rpc_signature);
  END LOOP;

  -- Security invariants verified INSIDE the same atomic transaction.
  FOR v_target IN
    SELECT * FROM (VALUES
      ('wallets', 'SELECT,INSERT,UPDATE,DELETE'),
      ('categories', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('debts', 'SELECT,INSERT,UPDATE,DELETE'),
      ('goals', 'SELECT,INSERT,UPDATE,DELETE'),
      ('budgets', 'SELECT,INSERT,UPDATE,DELETE'),
      ('investments', 'SELECT,INSERT,UPDATE,DELETE'),
      ('savings', 'SELECT,INSERT,UPDATE,DELETE'),
      ('saving_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('forex_accounts', 'SELECT,INSERT,UPDATE,DELETE'),
      ('forex_cash_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transaction_rules', 'SELECT,INSERT,UPDATE,DELETE'),
      ('transaction_review_acknowledgements', 'SELECT,INSERT,DELETE'),
      ('wallet_reconciliations', 'SELECT'),
      ('ai_user_settings', 'SELECT,INSERT,UPDATE'),
      ('ai_conversations', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_messages', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_pending_actions', 'SELECT,INSERT,UPDATE,DELETE'),
      ('ai_action_audit_logs', 'SELECT,INSERT,DELETE'),
      ('ai_usage_logs', 'SELECT,INSERT')
    ) AS expected(table_name, allowed_authenticated_dml)
  LOOP
    SELECT c.oid, c.relrowsecurity INTO v_table_oid, v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_target.table_name
      AND c.relkind IN ('r','p');
    IF v_table_oid IS NULL OR NOT COALESCE(v_rls, false) THEN
      RAISE EXCEPTION 'PDA-ACL-1: Table missing or RLS disabled after patch: %', v_target.table_name;
    END IF;
    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'
    ]::text[]
    LOOP
      IF has_table_privilege('anon', v_table_oid, v_privilege) THEN
        RAISE EXCEPTION 'PDA-ACL-1: anon still has %.%', v_target.table_name, v_privilege;
      END IF;
      IF has_table_privilege('authenticated', v_table_oid, v_privilege) AND
          NOT (v_privilege = ANY(string_to_array(v_target.allowed_authenticated_dml, ','))) THEN
        RAISE EXCEPTION 'PDA-ACL-1: unexpected authenticated grant %.%', v_target.table_name, v_privilege;
      END IF;
    END LOOP;
    IF current_setting('server_version_num')::int >= 170000 THEN
      IF has_table_privilege('anon', v_table_oid, 'MAINTAIN') OR
         has_table_privilege('authenticated', v_table_oid, 'MAINTAIN') THEN
        RAISE EXCEPTION 'PDA-ACL-1: Unexpected MAINTAIN permission on %', v_target.table_name;
      END IF;
    END IF;
    FOREACH v_privilege IN ARRAY string_to_array(v_target.allowed_authenticated_dml, ',')
    LOOP
      IF NOT has_table_privilege('authenticated', v_table_oid, v_privilege) THEN
        RAISE EXCEPTION 'PDA-ACL-1: Required authenticated privilege missing after patch: %.%',
          v_target.table_name, v_privilege;
      END IF;
    END LOOP;
    -- Catch surviving unsafe column-level auth grant even after table REVOKE.
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) g
      WHERE a.attrelid = v_table_oid AND a.attnum > 0 AND NOT a.attisdropped
        AND g.grantee IN (0::oid, v_anon_role)
    ) THEN
      RAISE EXCEPTION 'PDA-ACL-1: Anonymous column-level grant remains on %', v_target.table_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) g
      WHERE a.attrelid = v_table_oid AND a.attnum > 0 AND NOT a.attisdropped
        AND g.grantee = v_auth_role
        AND NOT (g.privilege_type = ANY(string_to_array(v_target.allowed_authenticated_dml, ',')))
    ) THEN
      RAISE EXCEPTION 'PDA-ACL-1: Unauthorized authenticated column grant on %', v_target.table_name;
    END IF;
  END LOOP;

  FOREACH v_rpc_signature IN ARRAY ARRAY[
      'public.create_saving_account(uuid,text,text,numeric,text,uuid,date,numeric,date,text)',
      'public.create_saving_movement(uuid,text,text,numeric,text,date,uuid,text)',
      'public.delete_forex_account_atomic(uuid)',
      'public.delete_saving_account(uuid)'
  ]::text[]
  LOOP
    v_rpc_oid := to_regprocedure(v_rpc_signature);
    IF v_rpc_oid IS NULL OR has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PDA-ACL-1: RPC ACL postcondition failed: %', v_rpc_signature;
    END IF;
  END LOOP;
END;
$acl_phase2$;

COMMIT;
-- Run prod-acl-drift-1-phase2-verify.sql afterwards in a SEPARATE editor query.
