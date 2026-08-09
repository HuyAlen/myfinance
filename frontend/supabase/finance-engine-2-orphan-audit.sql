-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE-ENGINE-2 — Wallet reference orphan audit (READ-ONLY)
--
-- Run this against the live database BEFORE ever adding the deferred
-- foreign keys described at the bottom of finance-engine-2-atomic-
-- transactions.sql. Every query here is a SELECT — nothing is modified.
--
-- Expected result if the data is clean: every query returns 0 rows.
-- Any row returned is a financial record whose wallet reference does not
-- match an existing wallet — it must be resolved by a human decision
-- (re-point it, or knowingly archive it) before an FK can be added, never
-- auto-deleted.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Transactions whose source wallet no longer exists.
SELECT t.id, t.user_id, t.type, t.amount, t."walletId", t.date
FROM transactions t
LEFT JOIN wallets w ON w.id = t."walletId" AND w.user_id = t.user_id
WHERE w.id IS NULL;

-- 2. Transfer transactions whose destination wallet no longer exists.
SELECT t.id, t.user_id, t.type, t.amount, t."transferToWalletId", t.date
FROM transactions t
LEFT JOIN wallets w ON w.id = t."transferToWalletId" AND w.user_id = t.user_id
WHERE t."transferToWalletId" IS NOT NULL
  AND w.id IS NULL;

-- 3. Forex cash transactions whose wallet no longer exists.
-- NOTE: forex_cash_transactions' schema is not tracked in this repo, so
-- this query assumes the column names financeStorage.ts already reads
-- (wallet_id, user_id) — verify these match the live table before running.
SELECT f.id, f.user_id, f.wallet_id, f.type, f.amount
FROM forex_cash_transactions f
LEFT JOIN wallets w ON w.id = f.wallet_id AND w.user_id = f.user_id
WHERE w.id IS NULL;

-- 4. Sanity check: any transaction whose walletId/transferToWalletId
-- belongs to a DIFFERENT user's wallet than the transaction's own user_id
-- (would indicate a cross-account data integrity issue, separate from
-- "orphan" but equally important to catch before adding FKs).
SELECT t.id, t.user_id AS transaction_user, w.user_id AS wallet_user, t."walletId"
FROM transactions t
JOIN wallets w ON w.id = t."walletId"
WHERE w.user_id <> t.user_id;
