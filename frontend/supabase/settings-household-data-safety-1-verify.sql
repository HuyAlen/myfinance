-- SETTINGS-HOUSEHOLD-DATA-SAFETY-1: READ ONLY verification.
-- Safe in production; no test data, no calls to restore/reset/clear.
WITH expected(signature, expected_definer) AS (
  VALUES
    ('public.export_finance_backup()'::text, false),
    ('public.restore_finance_backup(jsonb)'::text, true),
    ('public.seed_finance_demo_data(jsonb)'::text, false),
    ('public.export_finance_backup_scoped(uuid)'::text, false),
    ('public.restore_finance_backup_scoped(jsonb,uuid)'::text, false),
    ('public.assert_settings_finance_workspace_owner(uuid)'::text, true)
),
actual AS (
  SELECT e.signature, e.expected_definer,
    to_regprocedure(e.signature) AS oid
  FROM expected e
)
SELECT
  a.signature,
  a.oid IS NOT NULL AS exists,
  COALESCE(p.prosecdef = a.expected_definer, false) AS correct_security_mode,
  COALESCE(has_function_privilege('authenticated', a.oid, 'EXECUTE'), false) AS authenticated_can_execute,
  COALESCE(has_function_privilege('anon', a.oid, 'EXECUTE'), false) AS anon_can_execute,
  CASE
    WHEN a.oid IS NULL THEN false
    WHEN a.signature IN ('public.export_finance_backup()', 'public.restore_finance_backup(jsonb)')
      THEN position('SETTINGS-HOUSEHOLD-DATA-SAFETY-1 OWNER GUARD' IN pg_get_functiondef(a.oid)) > 0
        AND position('current_finance_admin_owner_user_id()' IN pg_get_functiondef(a.oid)) > 0
        AND position('MFB06' IN pg_get_functiondef(a.oid)) > 0
    WHEN a.signature = 'public.seed_finance_demo_data(jsonb)'
      THEN position('current_finance_admin_owner_user_id()' IN pg_get_functiondef(a.oid)) > 0
    ELSE position('assert_settings_finance_workspace_owner' IN pg_get_functiondef(a.oid)) > 0
      OR a.signature = 'public.assert_settings_finance_workspace_owner(uuid)'
  END AS owner_scope_guard_present
FROM actual a
LEFT JOIN pg_proc p ON p.oid = a.oid
ORDER BY a.signature;
