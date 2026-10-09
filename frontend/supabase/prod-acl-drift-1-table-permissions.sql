-- MYFINANCE-PROD-ACL-DRIFT-1 / 01 TABLE PRIVILEGES
-- READ ONLY. Run in the intended production Supabase SQL Editor.
-- Reports SQL-object names and privileges ONLY. Never outputs finance rows.
-- Every has_table_privilege call checks ONE operation: a comma-separated
-- privilege string would return TRUE if ANY privilege is present.
-- "effective" includes grants inherited from the PUBLIC pseudo-role.
WITH
expected(table_name, domain, expected_auth_dml) AS (
  VALUES
    ('wallets','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('categories','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('transactions','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('debts','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('goals','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('budgets','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('investments','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('savings','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('saving_transactions','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('forex_accounts','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('forex_cash_transactions','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('net_worth_snapshots','finance',ARRAY['SELECT']::text[]),
    ('forex_balance_snapshots','finance',ARRAY['SELECT']::text[]),
    ('wallet_reconciliations','finance',ARRAY['SELECT']::text[]),
    ('transaction_rules','finance',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('transaction_review_acknowledgements','finance',ARRAY['SELECT','INSERT','DELETE']::text[]),
    ('households','household',ARRAY['SELECT']::text[]),
    ('household_members','household',ARRAY['SELECT']::text[]),
    ('household_invites','household',ARRAY['SELECT']::text[]),
    ('finance_workspace_preferences','household',ARRAY[]::text[]),
    ('finance_audit_log','audit',ARRAY['SELECT']::text[]),
    ('ai_user_settings','ai',ARRAY['SELECT','INSERT','UPDATE']::text[]),
    ('ai_conversations','ai',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('ai_messages','ai',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('ai_pending_actions','ai',ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('ai_action_audit_logs','ai',ARRAY['SELECT','INSERT','DELETE']::text[]),
    ('ai_usage_logs','ai',ARRAY['SELECT','INSERT']::text[])
),
actual AS (
  SELECT c.oid, c.relname::text AS table_name, c.relrowsecurity AS rls_enabled,
         c.relacl, c.relowner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
roles AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname = 'anon') AS anon_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') AS auth_oid
),
operations(operation) AS (
  VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text),
         ('DELETE'::text), ('TRUNCATE'::text),
         ('TRIGGER'::text), ('REFERENCES'::text)
),
privileges AS (
  SELECT e.table_name, e.domain, e.expected_auth_dml,
         a.oid, a.rls_enabled, o.operation,
         CASE WHEN a.oid IS NULL THEN false
              ELSE has_table_privilege('anon', a.oid, o.operation) END AS anon_effective,
         CASE WHEN a.oid IS NULL THEN false
              ELSE has_table_privilege('authenticated', a.oid, o.operation) END AS auth_effective,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(a.relacl, acldefault('r', a.relowner))) grant_item
           WHERE grant_item.grantee = 0
             AND grant_item.privilege_type = o.operation
         ) AS granted_to_public,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(a.relacl, acldefault('r', a.relowner))) grant_item
           CROSS JOIN roles r
           WHERE grant_item.grantee = r.anon_oid
             AND grant_item.privilege_type = o.operation
         ) AS granted_directly_to_anon,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(a.relacl, acldefault('r', a.relowner))) grant_item
           CROSS JOIN roles r
           WHERE grant_item.grantee = r.auth_oid
             AND grant_item.privilege_type = o.operation
         ) AS granted_directly_to_authenticated
  FROM expected e
  LEFT JOIN actual a ON a.table_name = e.table_name
  CROSS JOIN operations o
),
rollup AS (
  SELECT table_name, domain,
         bool_and(oid IS NOT NULL) AS present,
         bool_and(COALESCE(rls_enabled, false)) AS rls_enabled,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE anon_effective), '') AS anon_effective_privileges,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE anon_effective AND granted_to_public), '') AS anon_via_public_acl,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE anon_effective AND granted_directly_to_anon), '') AS anon_direct_acl,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE auth_effective AND operation IN ('TRUNCATE','TRIGGER','REFERENCES')), '') AS authenticated_dangerous,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE auth_effective AND granted_to_public
             AND operation IN ('TRUNCATE','TRIGGER','REFERENCES')), '') AS dangerous_via_public_acl,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE auth_effective AND granted_directly_to_authenticated
             AND operation IN ('TRUNCATE','TRIGGER','REFERENCES')), '') AS dangerous_direct_authenticated_acl,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE operation IN ('SELECT','INSERT','UPDATE','DELETE')
             AND auth_effective AND NOT (operation = ANY(expected_auth_dml))), '') AS unexpected_authenticated_dml,
         COALESCE(string_agg(operation, ', ' ORDER BY operation)
           FILTER (WHERE operation = ANY(expected_auth_dml) AND NOT auth_effective), '') AS missing_authenticated_dml
  FROM privileges
  GROUP BY table_name, domain
),
scored AS (
  SELECT *,
    CASE WHEN NOT present OR NOT rls_enabled
       OR anon_effective_privileges <> '' OR authenticated_dangerous <> ''
       OR unexpected_authenticated_dml <> '' THEN 'FAIL'
         WHEN missing_authenticated_dml <> '' THEN 'WARN'
         ELSE 'PASS' END AS status
  FROM rollup
)
SELECT table_name, domain, status, present, rls_enabled,
       anon_effective_privileges, anon_via_public_acl, anon_direct_acl,
       authenticated_dangerous, dangerous_via_public_acl,
       dangerous_direct_authenticated_acl,
       unexpected_authenticated_dml, missing_authenticated_dml,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_tables,
       count(*) FILTER (WHERE status = 'WARN') OVER () AS warning_tables,
       CURRENT_TIMESTAMP AS checked_at
FROM scored
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
         domain, table_name;
