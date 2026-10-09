# MYFINANCE-PROD-ACL-DRIFT-1 — production least-privilege ACL review

## Scope and authority

**Diagnostics-first / NO production DB mutation in this delivery.** Based on
`HuyAlen/myfinance` canonical `supabase/schema.sql` and the two read-only
production-audit result grids captured on 2026-10-09 at ~08:13 UTC.

Observed preflight groups:

| Signal | Count | Scope |
| --- | ---: | --- |
| `ANON_TABLE_ACCESS` | 17 tables | 11 Finance + 6 AI |
| `AUTH_DANGEROUS_ACL` | 20 tables | 14 Finance + 6 AI |
| `ANON_RPC_EXECUTE` | 4 function names | Savings and Forex atomic-delete RPCs |
| `REQUIRED_RPC` + `RPC_SIGNATURE` | 1 missing function | `get_wallet_reconciliation_coverage()`; **separate task** |

**The checks count objects with at least one effective privilege, not each
privilege.** PostgreSQL `has_table_privilege(role, table, 'A,B')` is an **OR**
check. The 7 failed preflight groups do not mean 7 independent defects or
prove that a user accessed information. All sampled tables had RLS enabled,
but RLS does **not** constrain whole-table `TRUNCATE` or `REFERENCES`.

No wallet balances, transactions, account identifiers, auth emails, household
IDs, or other personal finance data are selected by this task.

## Step 1 — production SQL Editor (read-only)

Check you are in the intended Supabase **production** project. Open each file
separately, run it in its own SQL Editor query, and export only the result grid:

1. `frontend/supabase/prod-acl-drift-1-table-permissions.sql` →
   `MYFINANCE-ACL-1-tables.csv` (one row per expected table).
2. `frontend/supabase/prod-acl-drift-1-rpc-permissions.sql` →
   `MYFINANCE-ACL-1-rpcs.csv` (one row per *actual signature*, including
   overloads; missing function has one placeholder row).
3. `frontend/supabase/prod-acl-drift-1-default-privileges.sql` →
   `MYFINANCE-ACL-1-defaults.csv` (future-object default grant entries).

The third grid **can be empty** without proving new functions are restricted.
PostgreSQL has implicit PUBLIC EXECUTE defaults for newly created functions
unless appropriate global defaults are configured. A `pg_default_acl` row
applies to a given object creator and scope, not retroactively to all tables.

Only export these grids; do not run `supabase/schema.sql` against an existing
production environment, dump `pg_get_functiondef`, or export any finance rows.

## Step 2 — interpret the exact grant origin

For each `FAIL` in table permissions:

- `anon_effective_privileges` enumerates individually granted operations.
- `anon_via_public_acl` identifies inherited privileges from the PostgreSQL
  `PUBLIC` pseudo-role. **REVOKE FROM anon alone is not enough** for these.
- `anon_direct_acl` identifies privileges granted directly to `anon`.
- `authenticated_dangerous` separately lists `TRUNCATE`, `TRIGGER`,
  `REFERENCES` (the original audit did not include version-specific `MAINTAIN`).
- `dangerous_via_public_acl` and `dangerous_direct_authenticated_acl`
  explain how those authenticated privileges arise.
- `unexpected_authenticated_dml` / `missing_authenticated_dml` are compared
  to the canonical app grant matrix, **not** a runtime permission test.
- RLS status is reported, but policy correctness and actual JWT-based
  household member/viewer behavior still require integration smoke tests.

For RPCs, `function_signature` distinguishes different overloads. A
`public_acl_execute=true` means an effective anonymous EXECUTE grant might
survive `REVOKE ... FROM anon`; both the `PUBLIC` and direct grants must be
considered for the **exact signature**. `SECURITY INVOKER` is not a substitute
for ACLs; `SECURITY DEFINER` requires even stricter body authorization review.

Do not conflate the missing `get_wallet_reconciliation_coverage()` with grant
drift. Its canonical definition exists in
`frontend/supabase/wallet-reconciliation-coverage-ssot-1.sql`; deploy it only
under `MYFINANCE-RECONCILIATION-RPC-DEPLOY-1` after separate approval.

## Step 3 — proposed remediation, NOT YET AUTHORIZED

After the three CSVs are reviewed, draft a minimal *forward migration* that:

1. Records exact table and RPC signatures plus effective privilege origin.
2. Validates tables, RLS, required policies, overload list, and expected
   authenticated functionality before each revocation.
3. Revokes excess grants from the **correct grantors** (`PUBLIC`, `anon`,
   `authenticated`) without changing table owners or `service_role`.
4. Restores only the canonical authenticated DML/EXECUTE grants that the app
   actually needs, preserving AI read/write exceptions, snapshot read-only
   tables, audit-log append-only rules, and household workspace RPC-only state.
5. Keeps every existing RLS policy intact; does not create permissive policies.
6. Validates all post-migration ACLs and app behaviors with **real** anonymous,
   owner, household member, and viewer JWT contexts. Also smoke test Auth,
   transactions, wallets, Forex, Savings, AI, and reporting reads.
7. Re-runs original `production-data-audit-1-preflight.sql` and checks no
   new `permission denied` / `42501` / PostgREST RPC errors.

Do **not** run blanket `REVOKE ALL ON ALL TABLES`, change default privileges
for `service_role`, modify auth/storage schemas, or use a migration generated
without inspecting the actual production ACL sources. Future-object default
privilege changes require separately scoped review of the creator roles.

## Exit criteria

- No unintended `anon` effective operations on private app tables.
- No unintended dangerous authenticated table permissions; review
  version-dependent `MAINTAIN` separately if supported by production PG.
- Required authenticated application DML and RPC EXECUTE remain usable.
- Sensitive RPC overloads have no effective `anon` EXECUTE, including through
  `PUBLIC`; overload inventory is complete.
- Authenticated real-session tests succeed without RLS or 42501 regressions.
- The missing reconciliation RPC and Goal-category issues remain separately
  tracked until their own remediation passes.

**Current milestone:** only Step 1 diagnostics are implemented here. This is
not a migration, production fix, audit clearance, or permission to revoke.
