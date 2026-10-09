-- MYFINANCE-PROD-ACL-DRIFT-1 / PHASE 2 / POST-APPLY VERIFICATION
-- READ ONLY. Safe to run before or after the proposed migration.
-- Outputs application table/function names and ACL status only; no finance rows.
WITH expected_tables(table_name, allowed_authenticated_dml) AS (
  VALUES
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
),
actual_tables AS (
  SELECT c.oid, c.relname::text AS table_name, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
table_status AS (
  SELECT e.table_name AS object_name, 'table'::text AS object_kind,
    a.oid IS NOT NULL AS present, COALESCE(a.relrowsecurity, false) AS rls_enabled,
    COALESCE((SELECT string_agg(ops.operation, ', ' ORDER BY ops.operation) FROM unnest(ARRAY[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'
    ]::text[]) AS ops(operation) WHERE a.oid IS NOT NULL AND has_table_privilege('anon', a.oid, ops.operation)), '') AS anon_excess,
    COALESCE((SELECT string_agg(ops.operation, ', ' ORDER BY ops.operation) FROM unnest(ARRAY[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'
    ]::text[]) AS ops(operation) WHERE a.oid IS NOT NULL
       AND has_table_privilege('authenticated', a.oid, ops.operation)
       AND NOT (ops.operation = ANY(string_to_array(e.allowed_authenticated_dml, ',')))), '') AS auth_excess,
    COALESCE((SELECT string_agg(ops.operation, ', ' ORDER BY ops.operation)
       FROM unnest(string_to_array(e.allowed_authenticated_dml, ',')) AS ops(operation)
       WHERE a.oid IS NULL OR NOT has_table_privilege('authenticated', a.oid, ops.operation)), '') AS auth_missing,
    CASE WHEN a.oid IS NOT NULL AND current_setting('server_version_num')::int >= 170000
      THEN has_table_privilege('anon', a.oid, 'MAINTAIN') OR
           has_table_privilege('authenticated', a.oid, 'MAINTAIN')
      ELSE false END AS maintain_excess,
    EXISTS (
      SELECT 1 FROM pg_attribute att
      CROSS JOIN LATERAL aclexplode(att.attacl) grant_item
      WHERE att.attrelid = a.oid AND att.attnum > 0 AND NOT att.attisdropped
        AND grant_item.grantee IN (0::oid, (SELECT oid FROM pg_roles WHERE rolname = 'anon'))
    ) AS unexpected_anon_column_grant,
    EXISTS (
      SELECT 1 FROM pg_attribute att
      CROSS JOIN LATERAL aclexplode(att.attacl) grant_item
      WHERE att.attrelid = a.oid AND att.attnum > 0 AND NOT att.attisdropped
        AND grant_item.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND NOT (grant_item.privilege_type = ANY(string_to_array(e.allowed_authenticated_dml, ',')))
    ) AS unexpected_auth_column_grant
  FROM expected_tables e LEFT JOIN actual_tables a USING (table_name)
),
expected_rpcs(function_signature) AS (
  VALUES
    ('public.create_saving_account(uuid,text,text,numeric,text,uuid,date,numeric,date,text)'),
    ('public.create_saving_movement(uuid,text,text,numeric,text,date,uuid,text)'),
    ('public.delete_forex_account_atomic(uuid)'),
    ('public.delete_saving_account(uuid)')
),
rpc_status AS (
  SELECT e.function_signature AS object_name, 'rpc'::text AS object_kind,
    to_regprocedure(e.function_signature) AS function_oid
  FROM expected_rpcs e
),
checks AS (
 SELECT object_name, object_kind,
     CASE WHEN NOT present OR NOT rls_enabled
                OR anon_excess <> '' OR auth_excess <> '' OR auth_missing <> ''
                OR maintain_excess OR unexpected_anon_column_grant OR unexpected_auth_column_grant
          THEN 'FAIL' ELSE 'PASS' END AS status,
     CONCAT_WS('; ',
       CASE WHEN NOT present THEN 'MISSING TABLE' END,
       CASE WHEN NOT rls_enabled THEN 'RLS DISABLED' END,
       NULLIF('anon=' || anon_excess, 'anon='),
       NULLIF('auth_extra=' || auth_excess, 'auth_extra='),
       NULLIF('auth_missing=' || auth_missing, 'auth_missing='),
       CASE WHEN maintain_excess THEN 'MAINTAIN granted' END,
       CASE WHEN unexpected_anon_column_grant THEN 'anon/PUBLIC column grant' END,
       CASE WHEN unexpected_auth_column_grant THEN 'unauthorized authenticated column grant' END
     ) AS detail
 FROM table_status
 UNION ALL
 SELECT object_name, object_kind,
        CASE WHEN function_oid IS NOT NULL
              AND NOT has_function_privilege('anon', function_oid, 'EXECUTE')
              AND has_function_privilege('authenticated', function_oid, 'EXECUTE')
          THEN 'PASS' ELSE 'FAIL' END AS status,
        CASE WHEN function_oid IS NULL THEN 'MISSING RPC'
          WHEN has_function_privilege('anon', function_oid, 'EXECUTE') THEN 'anon EXECUTE'
          WHEN NOT has_function_privilege('authenticated', function_oid, 'EXECUTE') THEN 'authenticated missing EXECUTE'
          ELSE '' END AS detail
 FROM rpc_status
)
SELECT object_name, object_kind, status, detail,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_checks,
       count(*) FILTER (WHERE status = 'PASS') OVER () AS passed_checks,
       CURRENT_TIMESTAMP AS checked_at
FROM checks
ORDER BY CASE status WHEN 'FAIL' THEN 0 ELSE 1 END, object_kind, object_name;
