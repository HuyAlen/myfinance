-- SETTINGS-HOUSEHOLD-DATA-SAFETY-1 (P0)
-- Apply in Supabase SQL Editor only AFTER reviewing the exact live RPCs.
-- No finance rows are changed by this migration. One transaction; fail closed.
-- Legacy V4 export/restore algorithm and atomic receipt remain unchanged.
-- No anonymous access and no bypass by calling the old RPC signature.
BEGIN;

DO $guard$
DECLARE
  v_name text;
  v_oid oid;
  v_definition text;
  v_definer boolean;
  v_anchor constant text := 'v_user_id uuid := auth.uid();';
  v_original_guard constant text := 'IF v_user_id IS NULL THEN';
BEGIN
  IF to_regprocedure('public.current_finance_admin_owner_user_id()') IS NULL
    OR to_regclass('public.finance_workspace_preferences') IS NULL
    OR to_regclass('public.households') IS NULL
    OR to_regclass('public.household_members') IS NULL THEN
    RAISE EXCEPTION 'P0 preflight: household workspace functions/tables are missing';
  END IF;

  IF to_regprocedure('public.seed_finance_demo_data(jsonb)') IS NULL
    OR position(
      'v_user_id uuid := public.current_finance_admin_owner_user_id();' IN
      pg_get_functiondef('public.seed_finance_demo_data(jsonb)'::regprocedure)
    ) = 0 THEN
    RAISE EXCEPTION 'P0 preflight: live demo seed is not owner-scoped';
  END IF;

  FOREACH v_name IN ARRAY ARRAY['export_finance_backup()', 'restore_finance_backup(jsonb)']
  LOOP
    v_oid := to_regprocedure('public.' || v_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'P0 preflight: missing live RPC %', v_name;
    END IF;
    SELECT prosecdef INTO v_definer FROM pg_proc WHERE oid = v_oid;
    IF v_definer IS DISTINCT FROM (v_name = 'restore_finance_backup(jsonb)') THEN
      RAISE EXCEPTION 'P0 preflight: RPC security mode drift: %', v_name;
    END IF;

    v_definition := pg_get_functiondef(v_oid);
    -- Exact one-time source boundary: never rewrite an unknown or already patched RPC.
    IF (length(v_definition) - length(replace(v_definition, v_anchor, ''))) <> length(v_anchor)
      OR (length(v_definition) - length(replace(v_definition, v_original_guard, ''))) <> length(v_original_guard)
      OR strpos(v_definition, CASE WHEN v_name = 'export_finance_backup()' THEN 'WHERE r.user_id = v_user_id' ELSE 'WHERE user_id = v_user_id' END) = 0
      OR position('forex_balance_snapshots' IN v_definition) = 0
      OR position('SETTINGS-HOUSEHOLD-DATA-SAFETY-1 OWNER GUARD' IN v_definition) > 0 THEN
      RAISE EXCEPTION 'P0 preflight: live RPC source differs; stop and review %', v_name;
    END IF;
    IF v_name = 'restore_finance_backup(jsonb)' AND (
      position('LOCK TABLE' IN v_definition) = 0
      OR position('DELETE FROM public.wallets WHERE user_id = v_user_id' IN v_definition) = 0
      OR position('MFB05' IN v_definition) = 0
    ) THEN
      RAISE EXCEPTION 'P0 preflight: atomic V4 restore invariants missing';
    END IF;

    v_definition := replace(
      v_definition,
      v_anchor,
      'v_user_id uuid := public.current_finance_admin_owner_user_id(); -- SETTINGS-HOUSEHOLD-DATA-SAFETY-1 OWNER GUARD'
    );
    -- Preserve the original body/locks/receipt byte for byte after this guard.
    -- auth.uid() differentiates an expired session from a non-owner.
    v_definition := replace(
      v_definition,
      v_original_guard,
      'IF auth.uid() IS NULL THEN
      RAISE EXCEPTION ''Not authenticated'' USING ERRCODE = ''MFB01'';
    END IF;
    IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION ''Only the active workspace owner may use finance backup/restore'' USING ERRCODE = ''MFB06'';
    END IF;
    IF v_user_id IS NULL THEN'
    );
    EXECUTE v_definition;
  END LOOP;
END;
$guard$;

-- Verify client-intended workspace is still active. FOR SHARE holds the
-- preference row against concurrent workspace switches for this RPC transaction.
CREATE OR REPLACE FUNCTION public.assert_settings_finance_workspace_owner(
  p_expected_household_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $scope$
DECLARE
  v_actor uuid := auth.uid();
  v_active_household uuid;
  v_owner uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;
  IF p_expected_household_id IS NULL THEN
    RAISE EXCEPTION 'Expected workspace is required' USING ERRCODE = 'MFB06';
  END IF;

  SELECT active_household_id
    INTO v_active_household
  FROM public.finance_workspace_preferences
  WHERE user_id = v_actor
  FOR SHARE;
  IF NOT FOUND OR v_active_household IS DISTINCT FROM p_expected_household_id THEN
    RAISE EXCEPTION 'Workspace changed; operation cancelled' USING ERRCODE = 'MFB06';
  END IF;

  SELECT h.owner_user_id
    INTO v_owner
  FROM public.households h
  JOIN public.household_members hm ON hm.household_id = h.id
  WHERE hm.user_id = v_actor
    AND hm.household_id = p_expected_household_id
    AND hm.role = 'owner'
    AND h.owner_user_id = v_actor
  FOR SHARE OF h, hm;

  IF v_owner IS DISTINCT FROM v_actor
    OR public.current_finance_admin_owner_user_id() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Only the active workspace owner may use finance backup/restore' USING ERRCODE = 'MFB06';
  END IF;
  RETURN v_actor;
END;
$scope$;

-- The helper only returns the caller's own UUID after proving workspace ownership.
REVOKE ALL ON FUNCTION public.assert_settings_finance_workspace_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_settings_finance_workspace_owner(uuid) TO authenticated;

-- Explicit workspace token, checked on the server, for Settings operations.
CREATE OR REPLACE FUNCTION public.export_finance_backup_scoped(
  p_expected_household_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $export$
BEGIN
  PERFORM public.assert_settings_finance_workspace_owner(p_expected_household_id);
  RETURN public.export_finance_backup();
END;
$export$;
REVOKE ALL ON FUNCTION public.export_finance_backup_scoped(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup_scoped(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_finance_backup_scoped(
  p_backup jsonb,
  p_expected_household_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $restore$
BEGIN
  PERFORM public.assert_settings_finance_workspace_owner(p_expected_household_id);
  -- Keep legacy V4 validation, lock order, verification and atomic rollback.
  RETURN public.restore_finance_backup(p_backup);
END;
$restore$;
REVOKE ALL ON FUNCTION public.restore_finance_backup_scoped(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup_scoped(jsonb, uuid) TO authenticated;

-- Explicitly retain authenticated-only access to old signatures.
-- Old callers are safe now: the owner guard runs inside their original RPC.
REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb) TO authenticated;

COMMIT;
