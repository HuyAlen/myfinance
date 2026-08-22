# Supabase Setup & Schema SSOT

## 1. Canonical database source of truth

The MyFinance clean-install database baseline is:

```text
supabase/schema.sql
```

This is the **only** file that is intended to describe the complete current
Supabase schema. It includes the persisted Finance, Savings, Forex, and AI
objects used by the application, together with RLS, policies, indexes, triggers,
Realtime membership, and application RPCs.

SQL files under `frontend/supabase/` are historical/incremental migrations,
deployment audits, or feature-specific verification scripts. They are useful
for upgrading an existing project and for understanding schema provenance, but
they are **not** a second clean-install schema.

## 2. Fresh project bootstrap

For a new/disposable Supabase project:

1. Create the Supabase project and configure Authentication.
2. Review `supabase/schema.sql` for the target environment.
3. Apply `supabase/schema.sql` once to the fresh database using the Supabase SQL
   editor/CLI workflow approved for that environment.
4. Run `supabase/schema-verification.sql` and review the results.
5. Configure the application environment variables listed below.

`schema.sql` uses safe constructs such as `CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, deterministic policy recreation, and guarded
Realtime membership where practical. That **does not** make it a production
migration engine: `CREATE TABLE IF NOT EXISTS` cannot reconcile an already
existing table whose columns, types, constraints, or policies have drifted.

## 3. Existing database upgrades

Do **not** blindly reapply the baseline to an existing production database.
Existing projects should be upgraded with reviewed forward migrations from
`frontend/supabase/` (or a newly authored migration for the discovered delta).

Before changing an existing database, run:

```text
supabase/schema-verification.sql
```

The verification script is read-only and reports the current tables/columns,
constraints, indexes, policies, RPC definitions/security, triggers, Realtime
membership, and enum labels needed to compare the deployed database with the
canonical baseline.

If the verification output differs from `supabase/schema.sql`, treat that as
schema drift. Reconcile the difference explicitly; do not edit the canonical
baseline to match an unexplained production mutation.

## 4. Security invariants

The canonical baseline intentionally has no legacy `public read-write` policy.
User-owned data is protected by RLS and scoped to `auth.uid()`.

The verified RPC boundary is not uniform:

- Finance Engine, Savings, and backup RPCs use `SECURITY INVOKER` with
  `SET search_path = public, pg_temp`, so caller RLS remains active.
- The currently deployed Forex cash RPCs use `SECURITY DEFINER` with
  `SET search_path = public` and explicit `auth.uid()`/ownership checks in
  their bodies. DB-SSOT-1 records that deployed behavior; changing it is a
  separate security-hardening decision, not a schema-reconstruction shortcut.
- EXECUTE is revoked from both `PUBLIC` and `anon` and granted to
  `authenticated` for the application mutation boundary. DB-SSOT-1 live
  verification found explicit `anon` EXECUTE drift on the Savings, Forex, and
  backup RPCs; that deployed ACL is intentionally **not** copied into the
  canonical baseline.
- Supabase default table ACLs can grant broad privileges (including
  `TRUNCATE`/`TRIGGER`) to `anon` and `authenticated`. The canonical baseline
  explicitly revokes those defaults, grants no table privileges to `anon`, and
  re-grants only the authenticated operations used by MyFinance. RLS remains
  mandatory in addition to these ACLs.

A successful table creation without the expected RLS/policies/grants is **not**
a valid MyFinance setup.

## 5. Required environment variables

Set these in the local environment and in the deployment platform (for example,
Vercel Project Settings → Environment Variables):

| Variable | Source | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key | Production + Preview + Development |

After changing deployment environment variables, redeploy the application.
Never commit service-role keys or database passwords to the repository.

## 6. Authentication configuration

In Supabase Authentication URL configuration, set the production Site URL and
add the application's approved redirect URLs (for example the deployed Vercel
origin and its supported auth callback paths).

## 7. Verification checklist

After a fresh bootstrap or reviewed migration:

- [ ] `supabase/schema-verification.sql` reports all required application tables.
- [ ] RLS is enabled for user-owned Finance and AI tables; live-verified parent-ownership checks are preserved for Savings/Forex child writes, AI settings remain non-deletable by policy, and redundant case-variant AI policies are normalized to one equivalent policy per command.
- [ ] No permissive `USING (true)` / `WITH CHECK (true)` finance policy exists.
- [ ] The 11 atomic Finance/Savings/Forex/backup RPCs exist.
- [ ] Finance/Savings/backup RPCs are `SECURITY INVOKER`; Forex cash RPCs match their live-verified `SECURITY DEFINER` mode; mutation/backup RPCs are executable by `authenticated`, not `PUBLIC` or `anon`.
- [ ] Application tables grant no privileges to `anon`; `authenticated` has only the DML required by the corresponding RLS policy/application flow (no `TRUNCATE`, `TRIGGER`, `REFERENCES`, or `MAINTAIN`).
- [ ] Savings UUID IDs/defaults and wallet/movement FKs match the live-verified contract; `savings.wallet_id` and `savings.updated_at` are confirmed present in the deployed table.
- [ ] Finance CHECK/FK constraints match the live contract, including category recurrence/default-wallet rules, Savings wallet FKs, Forex ISO-currency checks, and Forex wallet `ON DELETE RESTRICT`.
- [ ] Transaction transfer metadata columns are present.
- [ ] Finance enum labels match the live-verified contract, including `transaction_type = income | expense | transfer | saving | investment`.
- [ ] Finance secondary indexes match the live-verified names, key order, sort order, and partial predicates in `supabase/schema.sql`.
- [ ] Realtime membership is present for persisted finance domains that use Supabase Realtime.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured.
- [ ] Application smoke tests can create/read/update/delete user-owned data without RLS errors.

## 8. Common failures

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `new row violates row-level security policy` | Caller/user ownership or policy drift | Compare `pg_policies` via `schema-verification.sql`; verify authenticated session and `user_id` |
| `column ... does not exist` | Deployed schema is behind the canonical baseline | Inspect verification output and apply a reviewed forward migration |
| `function ... does not exist` / RPC 404 | Required Finance RPC not deployed or signature drifted | Compare the RPC section of `schema-verification.sql` with `supabase/schema.sql` |
| `permission denied for table/function` | Grants or RLS differ from baseline | Reconcile grants/policies; do not add a permissive public policy |
| Missing Realtime updates | Table is not in `supabase_realtime` publication or subscription is misconfigured | Check the Realtime section of `schema-verification.sql` and client subscription |
| Missing Supabase URL/key | Deployment environment is incomplete | Configure the public Supabase URL/key and redeploy |
