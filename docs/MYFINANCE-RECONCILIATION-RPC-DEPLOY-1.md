# MYFINANCE-RECONCILIATION-RPC-DEPLOY-1 (P0)

## Production evidence (2026-10-09)

The final MYFINANCE-PRODUCTION-DATA-AUDIT-1 preflight reported **27 PASS, 2 FAIL**. Both FAIL checks refer to the **same absent function**, not two separate functions:

- `REQUIRED_RPC:get_wallet_reconciliation_coverage`
- `RPC_SIGNATURE:public.get_wallet_reconciliation_coverage()`

ACL remediation is complete at catalog level: its 20-table + 4-RPC verification reported 24/24 PASS. This ticket must NOT undo those grants or touch finance rows.

## Canonical contract

Already tracked and validated in GitHub `main` at baseline `e9da803148574e33003925eda66e6c78183d95fd`:

- `frontend/supabase/wallet-reconciliation-coverage-ssot-1.sql` (feature migration)
- `supabase/schema.sql` (clean-install DB SSOT)
- `frontend/src/services/finance/financeStorage.ts` (client RPC invocation)
- `frontend/src/services/finance/walletReconciliationCoverageSsot.sql.contract.test.ts`

The new deployment SQL intentionally duplicates the existing canonical function **body** only inside a guarded, one-time forward migration. A contract test compares their body strings to prevent semantic drift.

The RPC: `public.get_wallet_reconciliation_coverage()` with no arguments, `RETURNS SETOF public.wallet_reconciliations`, `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `search_path = public, pg_temp`. It reads only the latest receipt per wallet from the active finance scope, with no history cap. It **does not** reconcile wallets, edit balances, insert receipts, or return unrelated owners' records.

## Files and safety

- `frontend/supabase/reconciliation-rpc-deploy-1-apply.sql`: **MUTATING DDL**. Exactly one `CREATE FUNCTION`, `REVOKE`, `GRANT`, and `COMMENT` on that function. One transaction, timeouts, prerequisite checks, postchecks, PostgREST schema cache NOTIFY. Refuses to replace an existing function or overload.
- `frontend/supabase/reconciliation-rpc-deploy-1-verify.sql`: **READ ONLY**. Single result grid; 14 catalog checks, summary columns. Does not invoke the RPC or read finance records.
- `frontend/src/lib/reconciliationRpcDeploy1.contract.test.ts`: local static regression of scope, canonical SQL semantics, and security controls.

Explicitly out of scope: `wallet_reconciliations` DML/DDL, `reconcile_wallet_balance_atomic`, default ACLs, wallets or transactions, family workspace policies, AI, restoring old anon ACLs, snapshot balances.

## Rollout and acceptance

1. Verify Git main HEAD equals `e9da803148574e33003925eda66e6c78183d95fd` before applying patch. Use `apply-and-test.ps1` on clean main to create feature branch and copy only the 4 files. Run TypeScript, ESLint, targeted tests, full Vitest and production build. Nothing is deployed by this script.
2. Review and commit/push feature branch, validate GitHub Quality Gate. Test the exact SQL first on staging or a disposable DB with the expected household and reconciliation schema and ACLs. Confirm the authenticated-user wallet reconciliation coverage screen loads. Avoid mutations of real wallet data.
3. Before production execution, confirm intended Supabase project, reviewer/change approval, and re-run `production-data-audit-1-preflight.sql` (only the same two missing-function failures). If the function already exists, **do not run apply SQL**; run verify SQL and reconcile independently. Save catalog-only preflight/ACL evidence privately.
4. Once explicitly approved, in the intended Supabase SQL Editor run the **entire** `reconciliation-rpc-deploy-1-apply.sql` as one query, including BEGIN/COMMIT. A failed guard or SQL error before COMMIT rolls back all effects (close an aborted transaction with ROLLBACK if required by the SQL client). Never paste PowerShell into SQL Editor.
5. In a NEW SQL Editor query run `reconciliation-rpc-deploy-1-verify.sql`. Expected **14 PASS / 0 FAIL**. Run original `production-data-audit-1-preflight.sql`; expected **29 PASS / 0 FAIL** if no unrelated drift. Both checks must be observed, not assumed.
6. Smoke-test real user read (reconciliation center / coverage), anonymous denial, household owner/member/viewer scopes. If PostgREST has not detected the new RPC, refresh schema cache or check schema exposure and logs; the migration includes `NOTIFY pgrst, 'reload schema'` in the transaction. No synthetic production finance changes needed.

## Re-run/rollback

The script is intentionally **not idempotent**: if the function already exists or any overload appears, it aborts rather than replacing/deleting that function. On SQL failure before commit, the whole transaction rolls back. After commit, if a real integration regression exists, inspect permissions and RPC behavior before any compensating DDL. Do not silently grant EXECUTE to anon or drop the function while clients depend on it.

## Remaining separate work

- `MYFINANCE-PROD-DEFAULT-ACL-HARDENING-1`: restrict newly created application objects without disrupting platform schemas.
- `MYFINANCE-GOAL-CATEGORY-REF-1`: investigate seven unresolved goal/category references without deleting financial records.

This ticket is not certified production PASS until both independent SQL verifications and application read-only smoke test complete.
