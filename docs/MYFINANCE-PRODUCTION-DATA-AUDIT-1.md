# MYFINANCE-PRODUCTION-DATA-AUDIT-1

## Objective and authority

Read-only production inspection of MyFinance's deployed Supabase Postgres schema,
permissions, finance ownership, and cross-domain ledger references. Derived from
`supabase/schema.sql`, `supabase/schema-verification.sql`, documented household
workspaces, wallet reconciliation, and finance domain contracts at commit
`6f27cd833335fcca5f9bdcf92cb7f2549c7f58e3`.

No deployment, SQL migration, row repair, balance adjustment, RPC invocation,
backup restore, login impersonation, or UI mutation is part of this task.

**Important:** These queries do not establish that production is healthy until
they have actually been run against the intended Supabase production project
and the returned results have been reviewed. The production connection is not
included in the repository or in this audit bundle.

## Execution order (Supabase SQL Editor)

1. Confirm the project is the intended **production** Supabase project.
2. Open SQL Editor (privileged SQL Editor access only; no browser API keys).
3. Run `frontend/supabase/production-data-audit-1-preflight.sql` in its own query.
4. Export the **single results grid** as CSV. Name it
   `MYFINANCE-PDA-1-preflight-results.csv`.
5. Check `failed_checks`, especially `TABLE_PRESENT`, `REQUIRED_COLUMN`,
   `RLS_ENABLED`, `ANON_TABLE_ACCESS`, and `REQUIRED_RPC`.
6. **Only if all tables/columns required by the second query exist**, run
   `frontend/supabase/production-data-audit-1-integrity.sql` in its own query.
7. Export the results grid as `MYFINANCE-PDA-1-integrity-results.csv`.
8. Share these **aggregate-only results** for triage. Verify both files contain
   only columns `check_id, domain, priority, status, issue_count, expectation,
   failed_checks, warning_checks, checked_at`.

The queries are `WITH ... SELECT` statements with no DDL/DML, role switching,
`DO` blocks, RPC calls, or changes to configuration. They do not access or
export secrets, auth emails, user IDs, transaction amounts, raw balances,
account numbers, or individual financial records. Aggregation runs in the
production SQL Editor, so the account running it must still have authorization
to inspect the environment. The editor may bypass app-level RLS; *do not*
replace this bundle with a raw-record export.

Do not paste outputs of `supabase/schema-verification.sql` wholesale: it
includes function source and other verbose metadata. Use it privately only if a
specific production drift requires deeper verification.

## Reading the results

- `PASS`: that exact check saw zero issues.
- `FAIL` (`P0`): security/ownership/schema/ledger invariant requires review.
  A fail does **not** authorize an automatic correction.
- `WARN` (`P1`): potential legacy data or softer integrity drift. Inspect
  the business meaning before changing anything.
- `INFO`: backlog/coverage signal, not an invariant failure (may be nonzero).
- `failed_checks` / `warning_checks`: repeated summary counts of checks in the
  same output grid, so screenshots show the overall result clearly. The
  preflight counts **failed groups**, not raw individual column/object checks.
- `issue_count`: number of matches to the check; preflight sums affected
  schema objects into compact groups to avoid SQL Editor row limits. These are
  **not** money amounts or financial losses. For preflight failures, `expectation`
  lists affected schema/table/RPC names (truncated at 500 characters).

Tables/column absence can cause the integrity query to fail to compile. That is
why the catalog-only preflight must run first. The two files are not suitable
for running together as a single SQL Editor script.

## Important business-domain exceptions

- Normal income/expense summaries exclude internal transfers, savings and
  investment/Forex principal movement. This audit checks references and
  ownership, not report calculation amounts.
- Savings and Forex wallet references may be `NULL` in historical records.
  A `NULL` Forex cash wallet is flagged as `P1`; a nullable Savings wallet
  reference is accepted as an absence of linkage.
- Household users may legally belong to **multiple** workspaces. Only an
  active workspace preference pointing to no membership is a `P0` issue.
- Historical audit actors can leave workspaces; the audit does not treat old
  membership as a currently required relationship.
- Historical net-worth snapshots are immutable time-specific facts. The audit
  checks internal arithmetic, never equality to current wallet or asset value.
- Stored wallet balances are authoritative materialized state. Summing all
  historical transactions without an opening-balance checkpoint is **not** a
  valid reconciliation. Missing/stale reconciliation receipts are `INFO` only.
- A missing foreign-key validation flag may be a documented `NOT VALID` legacy
  constraint. It is surfaced as `P1` and should be reviewed against orphan
  counts, not fixed by blindly forcing validation.
- A `SECURITY DEFINER` RPC is **not** automatically a failure. The preflight
  flags missing `search_path` only; actual body ownership checks need manual
  follow-up if other signals are anomalous.

## Interpretation boundaries

This audit cannot prove:

- A successful application-role read/write under real `auth.uid()` and an
  actual family member/viewer session; live RLS integration tests are separate.
- A complete replay of Wallet balance from an independent trusted opening
  snapshot and every financial mutation.
- Semantic correctness of every record description/category, current investment
  price, Forex broker equity, or financial advice.
- No performance issue or incident in Vercel, or no concurrent live mutations.

Production is expected to keep changing; these two queries do not open a shared
snapshot across separate SQL Editor runs. Record both `checked_at` values.

## Safe remediation sequence after an anomaly

1. Keep database unchanged and retain the two exported aggregate CSVs.
2. Classify the failing `check_id` as security, owner-scope, orphan, legacy
   exception, or false positive. Prefer evidence from canonical migrations.
3. If deeper row-level details are necessary, use a separately approved,
   tightly scoped **private** query in a trusted environment. Never share full
   financial records, personally identifying information, or credentials.
4. Design a reversible reviewed forward migration or application fix in a
   different task/branch, with explicit tests, backup, and release controls.
5. Rerun both read-only audits after any approved fix.

## Local static contract verification

After adding the files to a feature branch:

```powershell
Set-Location "D:\Projects\personal-finance\frontend"
npx vitest run src/lib/productionDataAudit1.contract.test.ts
```

A passing **static** test confirms allowed SQL shape and intended coverage,
not production correctness. The release quality gate should still pass before
merging documentation/audit tools into `main`.
