# MYFINANCE-PROD-ACL-DRIFT-1 — Phase 2 (reviewed proposal)

## Production evidence (2026-10-09 08:33 UTC)

The supplied Supabase catalog results show:

- **17 user-data tables** have direct `anon` privileges. No table privilege via `PUBLIC` was reported for these 17.
- **20 application tables** have excess `authenticated` privileges: `TRUNCATE`, `TRIGGER`, `REFERENCES`.
- Four application tables with excess DML (five individual grants): `ai_action_audit_logs.UPDATE`, `ai_usage_logs.UPDATE/DELETE`, `ai_user_settings.DELETE`, `transaction_review_acknowledgements.UPDATE`.
- **No missing authenticated DML** on any of the 20 application tables in the diagnostic grid.
- **Four mutation RPCs** have direct `anon EXECUTE` (not via `PUBLIC`) and explicit `authenticated EXECUTE`. Each exact reported overload has `SECURITY INVOKER` and a pinned `search_path`.
- `get_wallet_reconciliation_coverage()` is **missing**, a separate deployment task. This migration must **NOT** create or change that RPC.
- Supabase default privileges for `postgres` and `supabase_admin` include broad `anon` privileges in `public`; other defaults also exist in platform schemas (`storage`, `graphql`, `graphql_public`). Defaults are a remaining exposure after Phase 2 and must be handled separately, without touching platform schemas by accident.

These are ACL exposure findings, **not evidence of an actual data breach**. RLS was enabled for all the audited application tables, but it does not guard all table privileges (e.g. TRUNCATE).

## Files

- `frontend/supabase/prod-acl-drift-1-phase2-apply.sql`: **MUTATING** proposed transaction, not safe to run until change approval.
- `frontend/supabase/prod-acl-drift-1-phase2-verify.sql`: **READ ONLY** independent verification producing exactly one catalog-only result grid (20 tables + 4 RPCs).
- `frontend/src/lib/prodAclDrift1Phase2.contract.test.ts`: static scope and safety regression tests.

The earlier Phase 1 diagnostics remain in the same feature branch and should be committed along with Phase 2 files only after review.

## Migration invariants

1. Only 20 named `public` application tables are targeted; no `ALL TABLES IN SCHEMA`, RLS-policy edit, user-data modification, or grant to privileged roles.
2. Revoke **all table privileges from `anon`** only on those 20 tables (17 observed as excessive; 3 already clean).
3. Revoke `TRUNCATE`, `TRIGGER`, `REFERENCES` from `authenticated` on exactly those 20 tables, plus `MAINTAIN` on PostgreSQL 17+.
4. Revoke only the 4 known excess authenticated DML situations; retain every expected authenticated DML permission, individually checked before and after.
5. Revoke `anon` and `PUBLIC` EXECUTE from exactly 4 named function signatures, with an overload-count assertion. Retain explicit `authenticated EXECUTE`.
6. Fail when any target table is missing, RLS is disabled, a required operation is absent, a function overload differs, unknown `PUBLIC`/`anon` column-level grants exist, or postconditions do not hold.
7. All mutations occur inside **one transaction** with local timeouts. Errors abort the transaction (in a SQL Editor, issue `ROLLBACK;` if the session is left in an aborted transaction). No partial ACL change should persist.

## Review and deployment procedure

**Local preparation:** Apply this ZIP while on branch `feat/myfinance-prod-acl-drift-1`, with the exact five Phase 1 files untracked and no other changes. The script adds the 4 new repository files, verifies static contracts, runs TypeScript, lint, full Vitest, and Next production build. It does NOT run SQL or commit/push.

**Before production mutation:**

1. Have a reviewer inspect the full apply SQL and verify the live Supabase project identity, current main SHA, and previous 3 diagnostics. Ensure all mutation routes (wallets, categories, transactions, savings, Forex and AI) are represented in acceptance testing.
2. Commit the reviewed feature, open a PR and pass GitHub Quality Gate. Prefer testing the SQL on a disposable/staging clone of the deployed schema first, using a least-privilege `anon` session and normal user sessions.
3. Preserve a private ACL snapshot (table/column/function privileges and default privileges) sufficient to restore *only required* permissions if smoke testing uncovers a real application dependency. Do not export any finance records or secrets. Plan maintenance/rollback ownership.
4. Run Phase 1 table and RPC diagnostics again immediately before the approved production change. Abort if objects, overloads, RLS status or expected grants have changed.
5. **Only after explicit approval**, run the entire Phase 2 apply SQL in the intended Supabase production SQL Editor as one script. Never copy just individual REVOKEs. Never run it automatically from CI.
6. Run the separate read-only Phase 2 verification query. Expected result: **24/24 PASS** (20 tables + 4 RPCs) if production still matches the captured baseline. Re-run Phase 1 table/RPC diagnostics and the original production-data-audit preflight.
7. Perform real authenticated-user regression: login, read/write wallet, category and transaction; savings, Forex, investment principal; family workspace member/viewer permissions; AI conversation/settings/actions and audit logs. Verify unauthorized requests fail. Keep backend-only operations through service_role intact.

## Rollback and failure response

- An exception before SQL `COMMIT` aborts all privilege changes; close the aborted transaction with `ROLLBACK;` as appropriate for SQL Editor behavior.
- After `COMMIT`, **do not automatically restore the insecure pre-change `anon`/`PUBLIC` grants**. If an app flow fails, inspect exactly which authenticated privilege is missing; create a separate minimal reviewed compensating `GRANT`, re-run the security checker, and fix the code path as necessary.
- Any reintroduction of `anon` `EXECUTE`, `anon` table CRUD or `authenticated` `TRUNCATE` is a security exception requiring review, not a default rollback.

## Remaining risk — default privileges

The report shows broad *future-object default* grants by `postgres`/`supabase_admin` for both application and platform schemas. **This migration does not change any defaults.** A PostgreSQL per-schema `REVOKE` cannot cancel privileges granted globally. Broad changes to `postgres`/`supabase_admin` defaults could break Supabase-managed schemas, storage, GraphQL and future migrations. Review precise `pg_default_acl` scope, role and global baseline separately and ensure all future user-schema migrations explicitly harden their newly created tables/functions.

Separate work:
- `MYFINANCE-PROD-DEFAULT-ACL-HARDENING-1`: scope-safe future-object ACL controls.
- `MYFINANCE-RECONCILIATION-RPC-DEPLOY-1`: deploy missing coverage RPC.

This task does not certify production PASS until the approved change and live verification complete.
