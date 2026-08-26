-- ============================================================================
-- FINANCE-TRANSACTION-EDIT-1 — Net-Delta Transaction Update Correctness
--
-- Forward migration for existing Supabase projects.
--
-- Root cause fixed here:
-- update_finance_transaction already validated the combined per-wallet NET
-- delta, but then physically reversed OLD effects and applied NEW effects in
-- separate UPDATE statements. wallets_balance_nn CHECK (balance >= 0) can
-- reject the transient intermediate balance even when the final net delta is
-- zero or otherwise affordable.
--
-- This replacement applies at most one wallet UPDATE per affected wallet,
-- using the already-computed final net delta. Zero-net metadata-only edits do
-- not touch wallet balances at all.
-- ============================================================================

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

  -- Serialize concurrent writers on the same transaction before validating
  -- the caller's expected old state.
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

  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_1);
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_2);
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_1);
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_2);
  END IF;
  v_wallet_ids := ARRAY(SELECT DISTINCT unnest(v_wallet_ids) ORDER BY 1);

  -- Deterministic lock order across the union of old/new affected wallets.
  PERFORM 1 FROM wallets
    WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
    ORDER BY id ASC
    FOR UPDATE;

  SELECT count(*) INTO v_wallet_count
    FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
  IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
    RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
  END IF;

  -- Build the final per-wallet NET delta:
  --   reverse old effect = -old_delta
  --   apply new effect   = +new_delta
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    v_balances := jsonb_set(v_balances, ARRAY[v_wallet_id], '0'::jsonb);
  END LOOP;

  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_old_effect_wallet_id_1],
      to_jsonb((v_balances->>p_old_effect_wallet_id_1)::numeric - p_old_effect_delta_1)
    );
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_old_effect_wallet_id_2],
      to_jsonb((v_balances->>p_old_effect_wallet_id_2)::numeric - p_old_effect_delta_2)
    );
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_new_effect_wallet_id_1],
      to_jsonb((v_balances->>p_new_effect_wallet_id_1)::numeric + p_new_effect_delta_1)
    );
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_new_effect_wallet_id_2],
      to_jsonb((v_balances->>p_new_effect_wallet_id_2)::numeric + p_new_effect_delta_2)
    );
  END IF;

  -- Validate every final balance before mutating any wallet.
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    SELECT balance INTO v_balance FROM wallets
      WHERE id = v_wallet_id AND user_id = v_user_id;
    v_net := (v_balances->>v_wallet_id)::numeric;
    IF v_balance + v_net < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;
  END LOOP;

  -- FINANCE-TRANSACTION-EDIT-1: apply exactly one final NET mutation per
  -- affected wallet. A zero-net metadata-only edit skips wallet mutation,
  -- so wallets_balance_nn can never see a false transient negative state.
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    v_net := (v_balances->>v_wallet_id)::numeric;
    IF v_net <> 0 THEN
      UPDATE wallets
      SET balance = balance + v_net
      WHERE id = v_wallet_id AND user_id = v_user_id;
    END IF;
  END LOOP;

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

REVOKE ALL ON FUNCTION public.update_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_finance_transaction TO authenticated;
