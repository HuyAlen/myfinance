# WALLET-RECONCILIATION-STATUS-UX-1 — P1

## Product decision

A wallet's reconciliation is an explicit confirmation against its real-world balance, **not just a correction transaction**. Therefore if the actual balance equals MyFinance's accepted balance, the user may confirm. The server writes a zero-difference immutable reconciliation receipt (actor, timestamp, expected/actual balance, balance revision), **without updating `wallets.balance` or creating a synthetic finance transaction**.

Three statuses are intentionally separate:

- **Chưa đối soát** — no receipt exists for this wallet.
- **Cần kiểm tra lại** — a legacy receipt exists but lacks a revision, or the balance mutation revision is newer than the latest receipt. This is *not* proof that the balance is wrong.
- **Đã đối soát** — a valid receipt matches the current wallet balance revision. This is a record of a human confirmation; it cannot attest to subsequent external-bank activity invisible to MyFinance.

## Why timestamps are insufficient

`wallets.updated_at` changes when editing the wallet's name/type and may have timestamp resolution/transaction-clock races. A balance revision on `public.wallets` is incremented **only when `wallet.balance` actually changes**, via a server-side `BEFORE INSERT OR UPDATE` trigger that never accepts a client-supplied revision. A receipt records the version held while the wallet row is locked. The status model compares these two server-side versions, not arbitrary client times or capped receipt history.

**Existing rows:** new wallet `balance_revision` starts at 0. Old receipts retain `balance_revision NULL` and must be explicitly re-confirmed before appearing green; do not fake retroactive confirmation or mislabel them as "never". Any later balance change increments revision even if it returns to a prior numeric balance.

## Database scope and security

- `frontend/supabase/wallet-reconciliation-status-ux-1-apply.sql` — MUTATING, guarded one-transaction migration. Adds `wallets.balance_revision bigint NOT NULL DEFAULT 0` and `wallet_reconciliations.balance_revision bigint NULL`. Creates the `wallet_balance_revision_guard()` trigger. Replaces **only the existing** `reconcile_wallet_balance_atomic(text,numeric,numeric,text)` function body. The RPC keeps the same signature, `SECURITY DEFINER`, fixed `search_path`, `auth.uid()`, finance-scope write authorization, `FOR UPDATE`, expected-balance conflict check, and existing grants. No transaction, wallet-balance or audit-ledger rows are manually backfilled/modified by migration SQL.
- Equal balances: wallet UPDATE is skipped, receipt INSERT still happens, `difference=0` from generated column. Different balances: atomic wallet UPDATE increments revision, and the receipt stores exactly the new revision.
- `anon` cannot execute RPC or read receipts; authenticated users cannot write receipts directly. Household owner/member/viewer write permissions remain governed by `current_finance_write_owner_user_id()`.
- `frontend/supabase/wallet-reconciliation-status-ux-1-verify.sql` — READ-ONLY catalog-only grid; **18/18 PASS** expected after migration. SQL never selects user financial data.
- Existing canonical SQL (`frontend/supabase/wallet-reconciliation-center-1.sql` and `supabase/schema.sql`) is updated to match clean install behavior.

## UI

- `/wallets` -> "Trung tâm đối soát" now displays explicit statuses per wallet with filters: All / Chưa đối soát / Cần kiểm tra lại / Đã đối soát.
- The corresponding status chip appears on every wallet card only when the reconciliation coverage request has succeeded. Failed/unknown coverage never silently becomes "never reconciled".
- The action opens the existing comparison modal. Equal balances enable "Xác nhận số dư khớp"; different balances show "Xác nhận điều chỉnh". Both call the same atomic RPC, and success wording is distinct. No real balance change is made on an equal confirmation.
- Recent history remains separate and capped for presentation; authoritative coverage comes from the uncapped one-per-wallet RPC. Zero-difference receipts show "Số dư khớp" in history.

## Review and rollout (do not auto-apply to production)

1. Apply patch ZIP against **clean main at commit `e696fe7b0408ddd38e005b9b743085332be653e1`**, locally. Tests: TypeScript, ESLint, focused and full Vitest, production build with placeholder env only if required. Commit and push isolated feature, review CI and scope before merging.
2. Review live Supabase project, take a private metadata-only preflight/privilege snapshot, confirm existing RPC and RLS guards. Test schema migration and authenticated behavior on *staging clone first*; test equal/different balances, another user's wallet, reader/viewer denial, concurrent conflict, rename-only not invalidating status, and actual transaction changing balance revision. Do not use real production finance records as test fixtures.
3. **Only after explicit approval**, deploy SQL to the correct production project in one complete SQL Editor query. Do not run partially. If preflight fails, stop; do not remove guard checks or rerun blindly. SQL is intentionally non-idempotent.
4. Run the independent read-only verifier: **18 PASS / 0 FAIL**. Then run production-data-audit preflight: should remain **29 PASS / 0 FAIL**, assuming no unrelated drift. Validate normal-user page and Household member/viewer behaviors. The verification SQL is metadata-only and cannot prove functional/authorization smoke tests by itself.
5. Production deployment order: deploy reviewed DB migration before or atomically with code activation. If app code hits an old RPC, equal confirmations will be rejected by the existing `MFR05` contract until the database is migrated.

## Safe fallback

A pre-commit SQL exception rolls back entire transaction. After commit do not automatically undo schema and strip receipt columns while clients use them. For an app regression, inspect the error and recover with a separately reviewed change; never grant `anon` broad access or bypass RLS. Do not re-run `wallet-reconciliation-status-ux-1-apply.sql` once applied.

## Known scope boundary

This patch tracks **balance changes committed in MyFinance**, not unknown transactions on external bank systems. A "Đã đối soát" status reports the last human-confirmed MyFinance balance version. External reality still requires user confirmation periodically. The reminder does not claim that a bank balance is incorrect.
