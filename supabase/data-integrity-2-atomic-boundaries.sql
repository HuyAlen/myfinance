-- DATA-INTEGRITY-2 — Atomic Mutation & Database Boundary Audit
-- Apply this migration to the live Supabase database before deploying the
-- matching frontend/storage changes. It is backward-compatible with current
-- RPC signatures while moving trust for wallet effects/category deletion to
-- PostgreSQL and canonicalizing Forex account deletion.

CREATE OR REPLACE FUNCTION public.assert_finance_transaction_effects(
  p_type text,
  p_amount numeric,
  p_wallet_id text,
  p_transfer_to_wallet_id text,
  p_transfer_reference_type text,
  p_source_type text,
  p_destination_type text,
  p_effect_wallet_id_1 text,
  p_effect_delta_1 numeric,
  p_effect_wallet_id_2 text,
  p_effect_delta_2 numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_wallet_1 text;
  v_expected_delta_1 numeric;
  v_expected_wallet_2 text;
  v_expected_delta_2 numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Invalid transaction effect input' USING ERRCODE = 'MFE04';
  END IF;

  IF p_type = 'income' THEN
    v_expected_wallet_1 := p_wallet_id;
    v_expected_delta_1 := p_amount;
  ELSIF p_type = 'expense' THEN
    v_expected_wallet_1 := p_wallet_id;
    v_expected_delta_1 := -p_amount;
  ELSIF p_type = 'transfer' AND lower(coalesce(p_transfer_reference_type, '')) = 'saving' THEN
    v_expected_wallet_1 := p_wallet_id;
    IF lower(coalesce(p_source_type, '')) = 'wallet'
       AND lower(coalesce(p_destination_type, '')) = 'saving' THEN
      v_expected_delta_1 := -p_amount;
    ELSIF lower(coalesce(p_source_type, '')) = 'saving'
       AND lower(coalesce(p_destination_type, '')) = 'wallet' THEN
      v_expected_delta_1 := p_amount;
    ELSE
      RAISE EXCEPTION 'Invalid saving transfer direction' USING ERRCODE = 'MFE04';
    END IF;
  ELSIF p_type = 'transfer' THEN
    IF p_transfer_to_wallet_id IS NULL OR p_transfer_to_wallet_id = p_wallet_id THEN
      RAISE EXCEPTION 'Invalid wallet transfer destination' USING ERRCODE = 'MFE04';
    END IF;
    v_expected_wallet_1 := p_wallet_id;
    v_expected_delta_1 := -p_amount;
    v_expected_wallet_2 := p_transfer_to_wallet_id;
    v_expected_delta_2 := p_amount;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type' USING ERRCODE = 'MFE04';
  END IF;

  IF p_effect_wallet_id_1 IS DISTINCT FROM v_expected_wallet_1
     OR p_effect_delta_1 IS DISTINCT FROM v_expected_delta_1
     OR p_effect_wallet_id_2 IS DISTINCT FROM v_expected_wallet_2
     OR p_effect_delta_2 IS DISTINCT FROM v_expected_delta_2 THEN
    RAISE EXCEPTION 'Client wallet effects do not match transaction semantics'
      USING ERRCODE = 'MFE04';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_finance_transaction_effects FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_finance_transaction_effects TO authenticated;

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

  -- DATA-INTEGRITY-2: never trust a caller-provided balance delta.
  PERFORM public.assert_finance_transaction_effects(
    p_type, p_amount, p_wallet_id, p_transfer_to_wallet_id,
    p_transfer_reference_type, p_source_type, p_destination_type,
    p_effect_wallet_id_1, p_effect_delta_1,
    p_effect_wallet_id_2, p_effect_delta_2
  );

  IF p_type IN ('income', 'expense') AND NOT EXISTS (
    SELECT 1 FROM categories
    WHERE id = p_category_id AND user_id = v_user_id AND type::text = p_type
  ) THEN
    RAISE EXCEPTION 'Category not found or type mismatch' USING ERRCODE = 'MFE04';
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

REVOKE ALL ON FUNCTION public.create_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_finance_transaction TO authenticated;

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

  PERFORM public.assert_finance_transaction_effects(
    v_existing.type::text, v_existing.amount, v_existing."walletId",
    v_existing."transferToWalletId", v_existing.transfer_reference_type,
    v_existing.source_type, v_existing.destination_type,
    p_old_effect_wallet_id_1, p_old_effect_delta_1,
    p_old_effect_wallet_id_2, p_old_effect_delta_2
  );
  PERFORM public.assert_finance_transaction_effects(
    p_type, p_amount, p_wallet_id, p_transfer_to_wallet_id,
    p_transfer_reference_type, p_source_type, p_destination_type,
    p_new_effect_wallet_id_1, p_new_effect_delta_1,
    p_new_effect_wallet_id_2, p_new_effect_delta_2
  );

  IF p_type IN ('income', 'expense') AND NOT EXISTS (
    SELECT 1 FROM categories
    WHERE id = p_category_id AND user_id = v_user_id AND type::text = p_type
  ) THEN
    RAISE EXCEPTION 'Category not found or type mismatch' USING ERRCODE = 'MFE04';
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

  PERFORM public.assert_finance_transaction_effects(
    v_existing.type::text, v_existing.amount, v_existing."walletId",
    v_existing."transferToWalletId", v_existing.transfer_reference_type,
    v_existing.source_type, v_existing.destination_type,
    p_effect_wallet_id_1, p_effect_delta_1,
    p_effect_wallet_id_2, p_effect_delta_2
  );

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

REVOKE ALL ON FUNCTION public.delete_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_finance_transaction TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_category_atomic(p_category_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFC01';
  END IF;

  PERFORM 1 FROM categories
    WHERE id = p_category_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found' USING ERRCODE = 'MFC03';
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE user_id = v_user_id AND "categoryId" = p_category_id
  ) OR EXISTS (
    SELECT 1 FROM budgets
    WHERE user_id = v_user_id AND "categoryId" = p_category_id
  ) THEN
    RAISE EXCEPTION 'Category is still referenced' USING ERRCODE = 'MFC02';
  END IF;

  DELETE FROM categories WHERE id = p_category_id AND user_id = v_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_category_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_category_atomic(text) TO authenticated;

create or replace function public.delete_forex_account_atomic(
  p_account_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
begin
  -- Lock and authorize the account first. RLS remains an independent backstop,
  -- while the explicit user predicate prevents cross-user deletion even if
  -- policies drift later.
  perform 1
  from public.forex_accounts
  where id = p_account_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception using
      errcode = 'MFX01',
      message = 'Không tìm thấy tài khoản Forex.';
  end if;

  -- Lock the exact linked ledger set before mutating it. Each nested function
  -- reverses its own wallet effect using the same production logic already used
  -- by single-transaction deletion. A failure here aborts the OUTER RPC too.
  for v_transaction in
    select id
    from public.forex_cash_transactions
    where forex_account_id = p_account_id
      and user_id = auth.uid()
    order by created_at, id
    for update
  loop
    perform public.delete_forex_cash_transaction(p_id => v_transaction.id);
  end loop;

  delete from public.forex_accounts
  where id = p_account_id
    and user_id = auth.uid();

  if not found then
    raise exception using
      errcode = 'MFX01',
      message = 'Không tìm thấy tài khoản Forex.';
  end if;
end;
$$;

revoke all on function public.delete_forex_account_atomic(uuid) from public;
grant execute on function public.delete_forex_account_atomic(uuid) to authenticated;
