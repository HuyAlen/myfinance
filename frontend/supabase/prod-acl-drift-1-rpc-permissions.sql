-- MYFINANCE-PROD-ACL-DRIFT-1 / 02 RPC PRIVILEGES
-- READ ONLY. Run separately in the production Supabase SQL Editor.
-- Each overload is distinct. Never call the inspected RPCs, show their source,
-- or assume REVOKE FROM anon neutralizes an inherited PUBLIC grant.
-- get_wallet_reconciliation_coverage() is a separate deployment gap and is
-- included here as a NON-MUTATING CONTROL, not an ACL remediation target.
WITH
expected(function_name, classification) AS (
  VALUES
    ('create_saving_account','mutation'),
    ('create_saving_movement','mutation'),
    ('delete_saving_account','mutation'),
    ('delete_forex_account_atomic','mutation'),
    ('create_finance_transaction','control'),
    ('reconcile_wallet_balance_atomic','control'),
    ('get_wallet_reconciliation_coverage','separate-rpc-deploy')
),
actual AS (
  SELECT p.oid, p.proname::text AS function_name,
         p.prosecdef, p.proconfig, p.proacl, p.proowner
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
roles AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname = 'anon') AS anon_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') AS auth_oid
),
scored AS (
  SELECT e.function_name, e.classification,
         COALESCE(a.oid::regprocedure::text, '<MISSING>') AS function_signature,
         a.oid IS NOT NULL AS present,
         CASE WHEN a.oid IS NULL THEN false
              ELSE has_function_privilege('anon', a.oid, 'EXECUTE') END AS anon_effective_execute,
         CASE WHEN a.oid IS NULL THEN false
              ELSE has_function_privilege('authenticated', a.oid, 'EXECUTE') END AS authenticated_effective_execute,
         EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(a.proacl, acldefault('f', a.proowner))) grant_item
           WHERE grant_item.grantee = 0 AND grant_item.privilege_type = 'EXECUTE'
         ) AS public_acl_execute,
         EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(a.proacl, acldefault('f', a.proowner))) grant_item
           CROSS JOIN roles r
           WHERE grant_item.grantee = r.anon_oid
             AND grant_item.privilege_type = 'EXECUTE'
         ) AS anon_direct_acl_execute,
         EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(a.proacl, acldefault('f', a.proowner))) grant_item
           CROSS JOIN roles r
           WHERE grant_item.grantee = r.auth_oid
             AND grant_item.privilege_type = 'EXECUTE'
         ) AS authenticated_direct_acl_execute,
         a.prosecdef AS security_definer,
         CASE WHEN a.oid IS NULL THEN false
              ELSE COALESCE(array_to_string(a.proconfig, ','), '') LIKE '%search_path=%' END AS pinned_search_path
  FROM expected e
  LEFT JOIN actual a USING (function_name)
),
results AS (
  SELECT *,
    CASE WHEN NOT present THEN 'MISSING_SEPARATE_TASK'
         WHEN anon_effective_execute THEN 'FAIL'
         WHEN NOT authenticated_effective_execute THEN 'WARN'
         WHEN security_definer AND NOT pinned_search_path THEN 'WARN'
         ELSE 'PASS' END AS status
  FROM scored
)
SELECT function_name, classification, function_signature,
       status, present, anon_effective_execute, public_acl_execute,
       anon_direct_acl_execute, authenticated_effective_execute,
       authenticated_direct_acl_execute, security_definer, pinned_search_path,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS unsafe_overloads,
       count(*) FILTER (WHERE status = 'MISSING_SEPARATE_TASK') OVER () AS missing_overloads,
       CURRENT_TIMESTAMP AS checked_at
FROM results
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1
                     WHEN 'MISSING_SEPARATE_TASK' THEN 2 ELSE 3 END,
         function_name, function_signature;
