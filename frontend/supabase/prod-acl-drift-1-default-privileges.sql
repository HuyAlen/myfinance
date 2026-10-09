-- MYFINANCE-PROD-ACL-DRIFT-1 / 03 DEFAULT ACL
-- READ ONLY. Inspect future-object grant defaults in the production project.
-- A row is a configured default grant, NOT permission on an existing table.
-- PostgreSQL's implicit PUBLIC EXECUTE default for functions also matters when
-- no explicit global override is present; absence of rows is NOT a clean bill.
WITH default_grants AS (
  SELECT pg_get_userbyid(d.defaclrole) AS object_creator,
         COALESCE(n.nspname, '<GLOBAL>')::text AS schema_scope,
         CASE d.defaclobjtype
           WHEN 'r' THEN 'TABLE'
           WHEN 'f' THEN 'FUNCTION'
           WHEN 'S' THEN 'SEQUENCE'
           WHEN 'T' THEN 'TYPE'
           WHEN 'n' THEN 'SCHEMA'
           ELSE d.defaclobjtype::text
         END AS object_kind,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC'
              ELSE pg_get_userbyid(a.grantee) END AS grantee,
         a.privilege_type::text AS privilege_name
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
)
SELECT object_creator, schema_scope, object_kind, grantee,
       string_agg(privilege_name, ', ' ORDER BY privilege_name) AS privileges,
       CASE WHEN grantee IN ('PUBLIC','anon') THEN 'REVIEW_DEFAULT_EXPOSURE'
            WHEN grantee = 'authenticated' AND bool_or(
              privilege_name IN ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'))
              THEN 'REVIEW_AUTH_HIGH_PRIVILEGES'
            ELSE 'INFO' END AS classification,
       CURRENT_TIMESTAMP AS checked_at
FROM default_grants
WHERE grantee IN ('PUBLIC','anon','authenticated','service_role')
GROUP BY object_creator, schema_scope, object_kind, grantee
ORDER BY CASE WHEN grantee IN ('PUBLIC','anon') THEN 0 ELSE 1 END,
         object_creator, schema_scope, object_kind, grantee;
