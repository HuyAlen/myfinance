-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE-ENGINE-3 — Savings Atomic Money Movement
--
-- Replaces SavingsPage.tsx's current "compute the next wallet balance in the
-- browser, write it, then separately write savings.balance and a
-- saving_transactions ledger row, with manual multi-step JS-side undo on
-- partial failure" pattern with three atomic Postgres function calls:
--
--   create_saving_account   — new saving + its initial deposit
--   create_saving_movement  — deposit / withdraw / settlement on an
--                              EXISTING saving
--   delete_saving_account   — delete a saving + its ledger, only when its
--                              authoritative balance is exactly zero
--
-- create_saving_movement composes the existing FINANCE-ENGINE-2
-- create_finance_transaction function for the wallet mutation + main
-- "transactions" ledger row (a Postgres function called from inside
-- another function's body shares the caller's transaction — so this is
-- genuinely one atomic operation, not two separate atomic calls chained by
-- the client).
--
-- create_saving_account does NOT go through create_finance_transaction —
-- it debits the wallet directly inside its own atomic block, because the
-- existing product never creates a main "transactions" row for the
-- initial Savings funding operation (see that function's own header for
-- why). This means wallet.balance has TWO database-level mutation
-- functions in total (create_finance_transaction, and
-- create_saving_account's own direct UPDATE) — both remain individually
-- atomic, but "create_finance_transaction is the only place that mutates
-- wallet.balance" would be an inaccurate claim and is not made here.
--
-- SCHEMA STATUS — MANUALLY VERIFIED AGAINST THE LIVE DATABASE
-- ─────────────────────────────────────────────────────────────────────────
-- Unlike the first version of this migration, the following facts about
-- "savings" and "saving_transactions" have been manually confirmed against
-- the live Supabase project (they are not tracked in this repo's
-- supabase_schema.sql, same situation as the forex_* tables and the
-- "transactions" table's transfer_* columns — confirming them required
-- inspecting the live database directly, not just this repo):
--
--   savings.id              uuid (primary key)
--   savings.user_id         uuid
--   savings.name            text
--   savings.type            text — CHECK constraint allows exactly
--                            'savings_account' | 'term_deposit' |
--                            'certificate' | 'emergency_fund' (NOT 'other')
--   savings.balance         numeric not null default 0,
--                            CHECK (balance >= 0)  [savings_balance_check]
--   savings.wallet_id       text (references a wallets.id, no enforced FK)
--   savings.interest_rate   numeric, nullable
--   savings.maturity_date   date, nullable
--   savings.notes           text, nullable
--   savings.created_at      timestamptz
--   savings.updated_at      timestamptz
--
--   saving_transactions.id               uuid (primary key)
--   saving_transactions.saving_id        uuid, FK -> savings.id
--                                         ON DELETE CASCADE
--   saving_transactions.user_id          uuid
--   saving_transactions.type             text — allows 'deposit' |
--                                         'withdraw' | 'interest' |
--                                         'settlement'
--   saving_transactions.amount           numeric, CHECK (amount > 0)
--   saving_transactions.transaction_date date
--   saving_transactions.note             text, nullable
--   saving_transactions.wallet_id        text, nullable
--   saving_transactions.created_at       timestamptz
--
--   RLS is enabled on savings, saving_transactions, wallets, and
--   transactions; every relevant policy restricts rows with
--   `auth.uid() = user_id`. SECURITY INVOKER (used throughout this file,
--   same as FINANCE-ENGINE-2) is therefore correct — it runs with the
--   caller's own privileges, so RLS remains a fully independent second
--   check underneath this file's own auth.uid()/ownership logic. Do not
--   change these functions to SECURITY DEFINER.
--
--   create_finance_transaction's deployed signature (9 required + 12
--   DEFAULT-valued arguments) matches supabase/finance-engine-2-atomic-
--   transactions.sql's tracked definition; grants confirmed for
--   authenticated/postgres/service_role.
--
-- NOTE: schema verification is not the same as migration execution. This
-- file has been reconciled with the verified contract above but has NOT
-- been applied to the database as part of this patch — that remains a
-- separate, explicit step for a human to run.
--
-- Before running this migration:
--   1. Re-run supabase/finance-engine-3-schema-verification.sql once more
--      immediately before applying, in case the schema changed again
--      between verification and now.
--   2. Apply in a staging/non-production environment first if available.
--
-- Safe to re-run: every statement uses CREATE OR REPLACE / DROP ... IF
-- EXISTS, matching this repo's existing migration convention.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- create_saving_account
--
-- Atomically creates a new saving account funded by an initial deposit from
-- a wallet: debits the wallet (directly — see the file header for why this
-- does not go through create_finance_transaction), inserts the saving row,
-- and inserts the initial-deposit saving_transactions ledger row. Does NOT
-- insert a row into the main "transactions" table — this matches the
-- existing product behavior exactly (only later top-up deposits/
-- withdrawals via create_saving_movement create a visible "transactions"
-- row; the initial balance at creation time never has, and this migration
-- does not change that existing asymmetry).
--
-- SECURITY INVOKER, same reasoning as FINANCE-ENGINE-2: RLS stays fully
-- active as an independent check on top of this function's own auth.uid()/
-- ownership checks.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_saving_account(
  p_saving_id uuid,
  p_name text,
  p_type text,
  p_balance numeric,
  p_wallet_id text,
  p_saving_transaction_id uuid,
  p_transaction_date date,
  p_interest_rate numeric DEFAULT NULL,
  p_maturity_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (saving savings, wallet wallets, saving_transaction saving_transactions)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_wallet wallets;
  v_saving savings;
  v_saving_transaction saving_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Saving name is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Matches the live savings_type CHECK constraint exactly — it does NOT
  -- allow 'other' (confirmed against the real database; the client's
  -- SavingsPage.tsx form also only ever offers these four values, so this
  -- was never reachable through the UI regardless).
  IF p_type NOT IN ('savings_account', 'term_deposit', 'certificate', 'emergency_fund') THEN
    RAISE EXCEPTION 'Invalid saving type' USING ERRCODE = 'MFS04';
  END IF;

  IF p_balance IS NULL OR p_balance <= 0 THEN
    RAISE EXCEPTION 'Initial deposit must be greater than zero' USING ERRCODE = 'MFS04';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'A source wallet is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Lock the wallet before reading its balance — see
  -- create_finance_transaction for the same authoritative-post-lock-read
  -- rationale (never trust a client-computed "balance was sufficient").
  SELECT * INTO v_wallet FROM wallets
    WHERE id = p_wallet_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFS03';
  END IF;

  IF v_wallet.balance - p_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFS05';
  END IF;

  UPDATE wallets SET balance = balance - p_balance, updated_at = now()
    WHERE id = p_wallet_id AND user_id = v_user_id
    RETURNING * INTO v_wallet;

  -- "id" is the primary key: a retried create with the same client-supplied
  -- id (lost response, client retry) hits this INSERT's unique-violation
  -- and aborts the whole function before any further write — this is
  -- duplicate REPLAY PROTECTION, not full idempotency (a true retry would
  -- return/recover the original successful result; here it surfaces a
  -- duplicate-key error instead). Same guarantee create_finance_transaction
  -- already relies on.
  INSERT INTO savings (
    id, user_id, name, type, balance, wallet_id, interest_rate,
    maturity_date, notes
  ) VALUES (
    p_saving_id, v_user_id, trim(p_name), p_type, p_balance, p_wallet_id,
    p_interest_rate, p_maturity_date, p_notes
  )
  RETURNING * INTO v_saving;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_saving_transaction_id, v_user_id, v_saving.id, 'deposit', p_balance,
    p_wallet_id, p_transaction_date, 'Số dư ban đầu khi tạo khoản tiết kiệm'
  )
  RETURNING * INTO v_saving_transaction;

  RETURN QUERY SELECT v_saving, v_wallet, v_saving_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_saving_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_saving_account TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- create_saving_movement
--
-- Atomically records a deposit, withdrawal, or settlement (full close) on an
-- EXISTING saving: mutates the wallet and inserts the main "transactions"
-- ledger row via create_finance_transaction (nested call, same transaction),
-- mutates savings.balance, and inserts the saving_transactions ledger row.
--
-- Settlement always closes the account for its authoritative, server-locked
-- current balance (v_saving.balance) rather than any client-supplied
-- amount — this closes a latent bug in the previous JS implementation,
-- where a manually edited settlement amount could zero the saving balance
-- while crediting the wallet with a smaller amount, silently destroying the
-- difference. p_amount is ignored when p_type = 'settlement'.
--
-- Wallet ↔ Savings is modeled as a ONE-WALLET transfer: only the wallet
-- side lives in create_finance_transaction's domain (wallets/transactions);
-- the savings side is mutated separately, right below, in this same
-- transaction. This is confirmed valid against create_finance_transaction's
-- actual body (not assumed): it requires only p_effect_wallet_id_1 to be
-- non-null ("At least one affected wallet is required"), and every check
-- involving p_effect_wallet_id_2/p_effect_delta_2 is itself gated behind
-- `IF p_effect_wallet_id_2 IS NOT NULL` — there is no code path that
-- requires a second wallet, a p_transfer_to_wallet_id, or type-specific
-- wallet-count validation for p_type = 'transfer'. Omitting
-- p_effect_wallet_id_2/p_transfer_to_wallet_id below (left at their
-- DEFAULT NULL) is therefore a semantically valid call, not a workaround.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_saving_movement(
  p_saving_id uuid,
  p_wallet_id text,
  p_type text,
  p_amount numeric,
  p_note text,
  p_transaction_date date,
  p_saving_transaction_id uuid,
  p_finance_transaction_id text
)
RETURNS TABLE (saving savings, wallet wallets, saving_transaction saving_transactions)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_saving savings;
  v_wallet wallets;
  v_saving_transaction saving_transactions;
  v_finance_transaction transactions;
  v_amount numeric;
  v_transfer_kind text;
  v_source_type text;
  v_destination_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  IF p_type NOT IN ('deposit', 'withdraw', 'settlement') THEN
    RAISE EXCEPTION 'Invalid saving movement type' USING ERRCODE = 'MFS04';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'A wallet is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Lock the saving row before the wallet (create_finance_transaction locks
  -- the wallet below) — a single, consistent savings-then-wallet lock order
  -- across every caller of this function means two concurrent movements can
  -- never deadlock against each other here.
  SELECT * INTO v_saving FROM savings
    WHERE id = p_saving_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  IF p_type = 'settlement' THEN
    v_amount := v_saving.balance;
  ELSE
    v_amount := p_amount;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFS04';
  END IF;

  IF p_type IN ('withdraw', 'settlement') AND v_amount > v_saving.balance THEN
    RAISE EXCEPTION 'Insufficient savings balance' USING ERRCODE = 'MFS02';
  END IF;

  IF p_type = 'deposit' THEN
    v_transfer_kind := 'saving_deposit';
    v_source_type := 'wallet';
    v_destination_type := 'saving';
  ELSIF p_type = 'withdraw' THEN
    v_transfer_kind := 'saving_withdraw';
    v_source_type := 'saving';
    v_destination_type := 'wallet';
  ELSE
    v_transfer_kind := 'saving_close';
    v_source_type := 'saving';
    v_destination_type := 'wallet';
  END IF;

  -- Wallet mutation + main "transactions" ledger row are delegated to the
  -- existing FINANCE-ENGINE-2 function. It performs its own wallet lock,
  -- ownership check, and authoritative balance check (raises MFE02/MFE04/
  -- MFE05 as appropriate) — none of that is duplicated here. Because this
  -- is a normal (not autonomous) function call, it executes inside the
  -- SAME transaction as this function, so its insert/update and everything
  -- below either all commit together or all roll back together.
  --
  -- p_category_id => '' matches transactions."categoryId"'s own column
  -- default (TEXT NOT NULL DEFAULT ''), not a workaround — this is the
  -- same value every existing non-categorized transfer already uses.
  -- p_transfer_reference_type/p_source_type/p_destination_type ('saving',
  -- 'wallet') are free-form text columns with no CHECK constraint in
  -- create_finance_transaction's body; the pre-migration client code
  -- already sent these exact values successfully through this same RPC.
  v_finance_transaction := public.create_finance_transaction(
    p_id                      => p_finance_transaction_id,
    p_type                    => 'transfer',
    p_amount                  => v_amount,
    p_category_id             => '',
    p_wallet_id               => p_wallet_id,
    p_note                    => p_note,
    p_date                    => p_transaction_date,
    p_effect_wallet_id_1      => p_wallet_id,
    p_effect_delta_1          => CASE WHEN p_type = 'deposit' THEN -v_amount ELSE v_amount END,
    p_transfer_reference      => v_transfer_kind || ':' || p_saving_id::text || ':' || clock_timestamp()::text,
    p_transfer_reference_type => 'saving',
    p_source_type             => v_source_type,
    p_destination_type        => v_destination_type
  );

  SELECT * INTO v_wallet FROM wallets
    WHERE id = p_wallet_id AND user_id = v_user_id;

  UPDATE savings SET
    balance = CASE
      WHEN p_type = 'settlement' THEN 0
      WHEN p_type = 'deposit' THEN balance + v_amount
      ELSE balance - v_amount
    END,
    maturity_date = CASE
      WHEN p_type = 'settlement' THEN p_transaction_date
      ELSE maturity_date
    END,
    updated_at = now()
  WHERE id = p_saving_id AND user_id = v_user_id
  RETURNING * INTO v_saving;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_saving_transaction_id, v_user_id, p_saving_id, p_type, v_amount,
    p_wallet_id, p_transaction_date, p_note
  )
  RETURNING * INTO v_saving_transaction;

  RETURN QUERY SELECT v_saving, v_wallet, v_saving_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_saving_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_saving_movement TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_saving_account
--
-- Atomically deletes a saving account and its saving_transactions history —
-- but ONLY when its authoritative, server-locked balance is exactly zero.
-- This is the actual security/correctness boundary: a saving account with
-- money still in it can never be deleted by any client, no matter what the
-- client believes its own balance check found. SavingsPage.tsx's own
-- `balance > 0` guard is UX convenience only (immediate feedback, no round
-- trip) — this function is the authoritative one.
--
-- Uses `<> 0` rather than `> 0`: even though the live database DOES have
-- `savings_balance_check CHECK (balance >= 0)` (confirmed), rejecting any
-- nonzero balance — not just positive — remains the correct invariant
-- regardless of that constraint, and doesn't depend on it.
--
-- The live saving_transactions.saving_id -> savings.id FK is
-- ON DELETE CASCADE, meaning deleting the "savings" row alone would already
-- delete its saving_transactions history automatically. The explicit
-- `DELETE FROM saving_transactions` below is kept anyway, purely so the
-- ledger deletion is not an invisible side effect of the FK — both
-- statements are inside this one transaction regardless, so this is a
-- readability choice, not a correctness requirement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_saving_account(
  p_saving_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_saving savings;
  v_deleted_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  SELECT * INTO v_saving FROM savings
    WHERE id = p_saving_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  IF v_saving.balance <> 0 THEN
    RAISE EXCEPTION 'Saving balance must be zero before it can be deleted'
      USING ERRCODE = 'MFS06';
  END IF;

  DELETE FROM saving_transactions
    WHERE saving_id = p_saving_id AND user_id = v_user_id;

  DELETE FROM savings WHERE id = p_saving_id AND user_id = v_user_id
    RETURNING id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  RETURN v_deleted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_saving_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_saving_account TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Custom error codes raised above (for financeStorage.ts's error mapper):
--   MFS01  not authenticated
--   MFS02  insufficient savings balance
--   MFS03  saving/wallet not found or not owned by caller
--   MFS04  invalid parameter (missing name/type/amount, bad movement type)
--   MFS05  insufficient wallet balance (create_saving_account's own check;
--          create_saving_movement instead surfaces the nested
--          create_finance_transaction call's MFE05 for the same condition)
--   MFS06  saving balance is not zero (delete_saving_account)
-- (existing wallets_balance_nn / savings_balance_check CHECK constraint
--  violations, SQLSTATE 23514, remain a second backstop for MFE05/MFS05
--  and any bypass attempt against MFS06, same pattern as FINANCE-ENGINE-2.)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- OUT OF SCOPE — noted, not implemented in this migration
--
-- delete_saving_account only allows deleting a saving whose balance is
-- already exactly zero — it does not decide where a nonzero balance should
-- go (which wallet? interest accrued was never sourced from a wallet in the
-- first place), it simply refuses to delete until the user withdraws or
-- settles the account down to zero first via the existing, already-atomic
-- create_saving_movement("withdraw" | "settlement") operation. Building a
-- single combined "settle-and-delete" operation was considered and rejected
-- as scope creep for this migration — the two-step flow (settle, then
-- delete) is one extra user action but requires no new product decision.
-- ═══════════════════════════════════════════════════════════════════════════
