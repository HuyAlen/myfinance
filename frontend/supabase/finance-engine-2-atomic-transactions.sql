-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE-ENGINE-2 — Atomic Wallet Mutation & Integrity Hardening
--
-- Adds three narrowly-scoped RPCs that replace the current "INSERT/UPDATE/
-- DELETE transaction, then separately UPDATE wallets, with manual JS-side
-- compensation on partial failure" pattern in financeStorage.ts with a
-- single atomic Postgres function call each.
--
-- IMPORTANT — READ BEFORE APPLYING
-- ─────────────────────────────────────────────────────────────────────────
-- This repo's tracked supabase_schema.sql does NOT list the following
-- "transactions" columns, even though financeStorage.ts's toTransactionRow/
-- fromTransactionRow have consistently read/written them across multiple
-- prior shipped sprints (PERF-TRANSACTIONS-1, WALLETS-2.1, ...):
--   transfer_fee, exchange_rate, transfer_reference,
--   transfer_reference_type, source_type, destination_type
-- This means the live database schema has drifted from the tracked DDL
-- (most likely via an untracked ALTER TABLE applied directly through the
-- Supabase dashboard). This migration was authored WITHOUT direct access to
-- the live database to confirm those column names/types — no DB credentials
-- were available in this environment, and connecting to a production
-- database from an unattended session was not authorized.
--
-- Before running this migration:
--   1. Confirm the exact column list/types of "transactions" in the live DB
--      (e.g. `\d transactions` in the Supabase SQL editor, or regenerate
--      supabase_schema.sql from the live schema) and reconcile any naming
--      differences with the INSERT/UPDATE column lists below.
--   2. Run finance-engine-2-orphan-audit.sql (read-only) first — this
--      migration does NOT add any foreign key, so no orphan data can break
--      it, but the audit is still useful context for the follow-up FK work
--      described at the bottom of this file.
--   3. Apply in a staging/non-production environment first if available.
--
-- Safe to re-run: every statement uses CREATE OR REPLACE / DROP ... IF
-- EXISTS, matching this repo's existing migration convention.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- create_finance_transaction
--
-- Atomically inserts one transaction row and applies its wallet balance
-- effect(s) (1 wallet for income/expense/saving, 2 for a wallet transfer).
-- Effects are computed by the caller (financeStorage.ts's existing
-- getTransactionEffects/inferTransactionKind) and passed in explicitly —
-- this function does NOT re-derive them, so the classification heuristics
-- (which parse transaction notes/reference text for saving deposit/
-- withdraw/close) are not duplicated in SQL and stay a single source of
-- truth in TypeScript.
--
-- SECURITY INVOKER (not DEFINER): the function only ever touches rows the
-- caller is already allowed to touch under RLS ("wallets"/"transactions"
-- policies both gate on auth.uid() = user_id). Running as the caller means
-- RLS remains fully active as an independent second check on top of this
-- function's own auth.uid()/ownership checks — no elevated privilege is
-- granted, so no search_path-hijacking risk from SECURITY DEFINER exists.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_finance_transaction(
  p_id text,
  p_type text,
  p_amount numeric,
  p_category_id text,
  p_wallet_id text,
  p_note text,
  p_date date,
  p_effect_wallet_id_1 text,
  p_effect_delta_1 numeric,
  p_transfer_to_wallet_id text DEFAULT NULL,
  p_is_recurring boolean DEFAULT false,
  p_recurrence text DEFAULT NULL,
  p_next_run_date date DEFAULT NULL,
  p_transfer_fee numeric DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_transfer_reference text DEFAULT NULL,
  p_transfer_reference_type text DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_destination_type text DEFAULT NULL,
  p_effect_wallet_id_2 text DEFAULT NULL,
  p_effect_delta_2 numeric DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row transactions;
  v_wallet_ids text[];
  v_wallet_count int;
  v_balance_1 numeric;
  v_balance_2 numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFE04';
  END IF;

  IF p_type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid transaction type' USING ERRCODE = 'MFE04';
  END IF;

  IF p_effect_wallet_id_1 IS NULL THEN
    RAISE EXCEPTION 'At least one affected wallet is required' USING ERRCODE = 'MFE04';
  END IF;

  v_wallet_ids := ARRAY[p_effect_wallet_id_1];
  IF p_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_effect_wallet_id_2);
  END IF;

  -- Deterministic (id-ascending) lock order: two concurrent opposite-
  -- direction transfers (A->B and B->A) both request their locks lowest-id
  -- first, so neither can ever wait on the other's second lock — no
  -- deadlock possible from this function alone.
  PERFORM 1 FROM wallets
    WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
    ORDER BY id ASC
    FOR UPDATE;

  SELECT count(*) INTO v_wallet_count
    FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
  IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
    RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
  END IF;

  -- Authoritative (server-side, post-lock) balance read — never trust a
  -- client-computed "balance was sufficient" check, since it may be based
  -- on a stale read from before another device's concurrent write.
  SELECT balance INTO v_balance_1 FROM wallets
    WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;
  IF v_balance_1 + p_effect_delta_1 < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
  END IF;

  IF p_effect_wallet_id_2 IS NOT NULL THEN
    SELECT balance INTO v_balance_2 FROM wallets
      WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
    IF v_balance_2 + p_effect_delta_2 < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;
  END IF;

  -- "id" is the primary key: a retried create with the same id (lost
  -- response, client retry) hits this INSERT's unique-violation and aborts
  -- the whole function before any wallet balance is touched — natural,
  -- built-in idempotency with no ON CONFLICT trickery that could otherwise
  -- silently re-apply a wallet effect.
  INSERT INTO transactions (
    id, user_id, type, amount, "categoryId", "walletId", note, date,
    "transferToWalletId", "isRecurring", recurrence, "nextRunDate",
    transfer_fee, exchange_rate, transfer_reference,
    transfer_reference_type, source_type, destination_type
  ) VALUES (
    p_id, v_user_id, p_type::transaction_type, p_amount, p_category_id,
    p_wallet_id, p_note, p_date, p_transfer_to_wallet_id, p_is_recurring,
    p_recurrence::recurrence_freq, p_next_run_date, p_transfer_fee,
    p_exchange_rate, p_transfer_reference, p_transfer_reference_type,
    p_source_type, p_destination_type
  )
  RETURNING * INTO v_row;

  UPDATE wallets SET balance = balance + p_effect_delta_1
    WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;

  IF p_effect_wallet_id_2 IS NOT NULL THEN
    UPDATE wallets SET balance = balance + p_effect_delta_2
      WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
  END IF;

  -- Belt-and-suspenders: the explicit checks above already prevent this,
  -- but the existing wallets_balance_nn CHECK (balance >= 0) constraint is
  -- still the final authority — if it ever fires here, the whole function
  -- (INSERT + both UPDATEs) rolls back atomically.
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_finance_transaction TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- update_finance_transaction
--
-- Atomically reverses the OLD transaction's wallet effect(s), applies the
-- NEW effect(s), and updates the transaction row — one function call, one
-- implicit Postgres transaction. Old/new effects are both computed by the
-- caller (same reason as create_finance_transaction above).
--
-- Optimistic conflict check: the caller also passes the amount/wallet/type
-- it read the transaction as having (p_expected_*). If another writer
-- changed the row between the caller's read and this call, those fields
-- won't match the current locked row and the whole update is rejected —
-- this closes the TOCTOU window where a stale "old effect" computed by the
-- client could otherwise be reversed against a since-changed transaction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_finance_transaction(
  p_id text,
  p_type text,
  p_amount numeric,
  p_category_id text,
  p_wallet_id text,
  p_note text,
  p_date date,
  p_expected_amount numeric,
  p_expected_wallet_id text,
  p_expected_type text,
  p_old_effect_wallet_id_1 text,
  p_old_effect_delta_1 numeric,
  p_new_effect_wallet_id_1 text,
  p_new_effect_delta_1 numeric,
  p_expected_transfer_to_wallet_id text DEFAULT NULL,
  p_transfer_to_wallet_id text DEFAULT NULL,
  p_is_recurring boolean DEFAULT false,
  p_recurrence text DEFAULT NULL,
  p_next_run_date date DEFAULT NULL,
  p_transfer_fee numeric DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_transfer_reference text DEFAULT NULL,
  p_transfer_reference_type text DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_destination_type text DEFAULT NULL,
  p_old_effect_wallet_id_2 text DEFAULT NULL,
  p_old_effect_delta_2 numeric DEFAULT NULL,
  p_new_effect_wallet_id_2 text DEFAULT NULL,
  p_new_effect_delta_2 numeric DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing transactions;
  v_row transactions;
  v_wallet_ids text[] := ARRAY[]::text[];
  v_wallet_count int;
  v_balances jsonb := '{}'::jsonb;
  v_wallet_id text;
  v_balance numeric;
  v_net numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFE04';
  END IF;

  IF p_type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid transaction type' USING ERRCODE = 'MFE04';
  END IF;

  IF p_old_effect_wallet_id_1 IS NULL OR p_new_effect_wallet_id_1 IS NULL THEN
    RAISE EXCEPTION 'At least one affected wallet is required' USING ERRCODE = 'MFE04';
  END IF;

  -- Lock the transaction row first. This serializes a concurrent
  -- update-vs-delete race on the SAME transaction: whichever call locks
  -- first proceeds; the loser either finds the row already gone (delete
  -- won — "not found" below) or is blocked until the first commits, then
  -- reads its post-commit state (which for delete means "not found" too).
  SELECT * INTO v_existing FROM transactions
    WHERE id = p_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;

  IF v_existing.amount IS DISTINCT FROM p_expected_amount
     OR v_existing."walletId" IS DISTINCT FROM p_expected_wallet_id
     OR v_existing."transferToWalletId" IS DISTINCT FROM p_expected_transfer_to_wallet_id
     OR v_existing.type::text IS DISTINCT FROM p_expected_type THEN
    RAISE EXCEPTION 'Transaction was modified by another request; please reload and retry'
      USING ERRCODE = 'MFE07';
  END IF;

  IF p_old_effect_wallet_id_1 IS NOT NULL THEN v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_1); END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_2); END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_1); END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_2); END IF;
  v_wallet_ids := ARRAY(SELECT DISTINCT unnest(v_wallet_ids) ORDER BY 1);

  -- Deterministic (id-ascending) lock order across the UNION of old+new
  -- affected wallets — same deadlock-avoidance reasoning as create above.
  PERFORM 1 FROM wallets
    WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
    ORDER BY id ASC
    FOR UPDATE;

  SELECT count(*) INTO v_wallet_count
    FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
  IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
    RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
  END IF;

  -- Authoritative post-lock balance check: compute the NET delta per
  -- affected wallet (reverse-old + apply-new combined) against its current
  -- server-side balance, so e.g. "same wallet, 1M -> 1.5M" is validated as
  -- a single -500K net change rather than two separate steps that could
  -- transiently (and incorrectly) look insufficient or sufficient.
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    v_balances := jsonb_set(v_balances, ARRAY[v_wallet_id], '0'::jsonb);
  END LOOP;
  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(v_balances, ARRAY[p_old_effect_wallet_id_1],
      to_jsonb((v_balances->>p_old_effect_wallet_id_1)::numeric - p_old_effect_delta_1));
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(v_balances, ARRAY[p_old_effect_wallet_id_2],
      to_jsonb((v_balances->>p_old_effect_wallet_id_2)::numeric - p_old_effect_delta_2));
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(v_balances, ARRAY[p_new_effect_wallet_id_1],
      to_jsonb((v_balances->>p_new_effect_wallet_id_1)::numeric + p_new_effect_delta_1));
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(v_balances, ARRAY[p_new_effect_wallet_id_2],
      to_jsonb((v_balances->>p_new_effect_wallet_id_2)::numeric + p_new_effect_delta_2));
  END IF;

  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    SELECT balance INTO v_balance FROM wallets
      WHERE id = v_wallet_id AND user_id = v_user_id;
    v_net := (v_balances->>v_wallet_id)::numeric;
    IF v_balance + v_net < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;
  END LOOP;

  -- Reverse OLD effects, then apply NEW effects — inside the same locked
  -- transaction, so no intermediate balance state is ever visible/committed.
  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    UPDATE wallets SET balance = balance - p_old_effect_delta_1
      WHERE id = p_old_effect_wallet_id_1 AND user_id = v_user_id;
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    UPDATE wallets SET balance = balance - p_old_effect_delta_2
      WHERE id = p_old_effect_wallet_id_2 AND user_id = v_user_id;
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    UPDATE wallets SET balance = balance + p_new_effect_delta_1
      WHERE id = p_new_effect_wallet_id_1 AND user_id = v_user_id;
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    UPDATE wallets SET balance = balance + p_new_effect_delta_2
      WHERE id = p_new_effect_wallet_id_2 AND user_id = v_user_id;
  END IF;

  UPDATE transactions SET
    type = p_type::transaction_type,
    amount = p_amount,
    "categoryId" = p_category_id,
    "walletId" = p_wallet_id,
    note = p_note,
    date = p_date,
    "transferToWalletId" = p_transfer_to_wallet_id,
    "isRecurring" = p_is_recurring,
    recurrence = p_recurrence::recurrence_freq,
    "nextRunDate" = p_next_run_date,
    transfer_fee = p_transfer_fee,
    exchange_rate = p_exchange_rate,
    transfer_reference = p_transfer_reference,
    transfer_reference_type = p_transfer_reference_type,
    source_type = p_source_type,
    destination_type = p_destination_type
  WHERE id = p_id AND user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_finance_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_finance_transaction TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_finance_transaction
--
-- Atomically reverses the transaction's wallet effect(s) and deletes the
-- row. Same optimistic conflict check as update, for the same reason: the
-- caller's "effects to reverse" were computed from a read that may be
-- stale by the time this call lands.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_finance_transaction(
  p_id text,
  p_expected_amount numeric,
  p_expected_wallet_id text,
  p_expected_type text,
  p_expected_transfer_to_wallet_id text DEFAULT NULL,
  p_effect_wallet_id_1 text DEFAULT NULL,
  p_effect_delta_1 numeric DEFAULT NULL,
  p_effect_wallet_id_2 text DEFAULT NULL,
  p_effect_delta_2 numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing transactions;
  v_wallet_ids text[];
  v_wallet_count int;
  v_balance_1 numeric;
  v_balance_2 numeric;
  v_deleted_id text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;

  -- Lock the transaction row first — see update_finance_transaction's
  -- comment for the update-vs-delete race this serializes.
  SELECT * INTO v_existing FROM transactions
    WHERE id = p_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;

  IF v_existing.amount IS DISTINCT FROM p_expected_amount
     OR v_existing."walletId" IS DISTINCT FROM p_expected_wallet_id
     OR v_existing."transferToWalletId" IS DISTINCT FROM p_expected_transfer_to_wallet_id
     OR v_existing.type::text IS DISTINCT FROM p_expected_type THEN
    RAISE EXCEPTION 'Transaction was modified by another request; please reload and retry'
      USING ERRCODE = 'MFE07';
  END IF;

  IF p_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := ARRAY[p_effect_wallet_id_1];
    IF p_effect_wallet_id_2 IS NOT NULL THEN
      v_wallet_ids := array_append(v_wallet_ids, p_effect_wallet_id_2);
    END IF;

    PERFORM 1 FROM wallets
      WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
      ORDER BY id ASC
      FOR UPDATE;

    SELECT count(*) INTO v_wallet_count
      FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
    IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
      RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
    END IF;

    -- Reversing a delete can legitimately push a wallet negative (e.g. the
    -- income being deleted was already spent elsewhere) — this preserves
    -- the exact business rule the previous JS-side implementation already
    -- enforced (reject the delete rather than allow a negative balance).
    SELECT balance INTO v_balance_1 FROM wallets
      WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;
    IF v_balance_1 - p_effect_delta_1 < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;

    IF p_effect_wallet_id_2 IS NOT NULL THEN
      SELECT balance INTO v_balance_2 FROM wallets
        WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
      IF v_balance_2 - p_effect_delta_2 < 0 THEN
        RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
      END IF;
    END IF;

    UPDATE wallets SET balance = balance - p_effect_delta_1
      WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;

    IF p_effect_wallet_id_2 IS NOT NULL THEN
      UPDATE wallets SET balance = balance - p_effect_delta_2
        WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
    END IF;
  END IF;

  DELETE FROM transactions WHERE id = p_id AND user_id = v_user_id
    RETURNING id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_finance_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_finance_transaction TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Custom error codes raised above (for financeStorage.ts's error mapper):
--   MFE01  not authenticated
--   MFE02  wallet not found / not owned by caller
--   MFE03  transaction not found / not owned by caller
--   MFE04  invalid parameter (amount <= 0, bad type, missing wallet)
--   MFE05  insufficient wallet balance
--   MFE07  optimistic-concurrency conflict (row changed since caller's read)
-- (existing wallets_balance_nn CHECK constraint violation, SQLSTATE 23514,
--  remains a second backstop and is mapped to the same insufficient-funds
--  message as MFE05.)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- DEFERRED — Wallet reference foreign keys (NOT applied in this migration)
--
-- WALLETS-2.1/PERF-WALLETS-1 found that transactions.walletId/
-- transferToWalletId and forex_cash_transactions.wallet_id have no FK to
-- wallets.id — integrity is application-layer only (hasWalletReferences()
-- pre-check before delete). This migration does NOT add those FKs because:
--
--   1. Legacy-orphan risk is unverified. This environment has no live DB
--      access, so it's not known whether any existing row already has a
--      walletId/transferToWalletId that doesn't match a current wallets.id
--      (possible causes: manually edited data, a wallet deleted before
--      hasWalletReferences() existed, demo-data resets, import/export
--      round-trips). Adding FKs against unverified data risks the
--      migration itself failing in production with no easy rollback path.
--   2. forex_cash_transactions' schema is not tracked in this repo at all
--      (created directly via Supabase dashboard, same as the transactions
--      columns noted above) — its exact wallet_id column type/nullability
--      cannot be confirmed from source.
--
-- Recommended next step (a follow-up, explicitly scoped migration):
--   1. Run the read-only audit in finance-engine-2-orphan-audit.sql against
--      the live database.
--   2. If zero orphans: add FKs with ON DELETE RESTRICT (never CASCADE —
--      deleting a wallet must never silently delete financial history):
--        ALTER TABLE transactions
--          ADD CONSTRAINT transactions_wallet_fk
--            FOREIGN KEY ("walletId") REFERENCES wallets(id) ON DELETE RESTRICT,
--          ADD CONSTRAINT transactions_transfer_to_wallet_fk
--            FOREIGN KEY ("transferToWalletId") REFERENCES wallets(id) ON DELETE RESTRICT;
--        ALTER TABLE forex_cash_transactions
--          ADD CONSTRAINT forex_cash_transactions_wallet_fk
--            FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT;
--   3. If orphans exist: they must be resolved (re-pointed or the
--      referencing row archived) by a human decision, not auto-deleted —
--      do not silently drop financial records to make a migration pass.
-- ═══════════════════════════════════════════════════════════════════════════
