-- FOREX-BALANCE-ASOF-1B
-- Every broker Balance mutation that this migration owns is recorded as an
-- append-only snapshot inside the same PostgreSQL transaction as the related
-- account, wallet, and Forex cash-ledger mutation.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.forex_balance_snapshots') IS NULL THEN
    RAISE EXCEPTION 'FOREX-BALANCE-ASOF-1 must be applied before FOREX-BALANCE-ASOF-1B.';
  END IF;
END;
$$;

-- Snapshot history must survive deletion of the cash-ledger row that caused
-- it. Remove the old FK shape regardless of whether 1A used the default name,
-- then recreate the relationship as nullable ON DELETE SET NULL.
DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON true
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND rel.relname = 'forex_balance_snapshots'
      AND att.attname = 'source_transaction_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.forex_balance_snapshots DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
END;
$$;

ALTER TABLE public.forex_balance_snapshots
  ADD CONSTRAINT forex_balance_snapshots_source_transaction_id_fkey
  FOREIGN KEY (source_transaction_id)
  REFERENCES public.forex_cash_transactions(id)
  ON DELETE SET NULL;

-- Reassert the client contract: authenticated clients can read snapshot
-- history, but only trusted database functions can append it.
ALTER TABLE public.forex_balance_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.forex_balance_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.forex_balance_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_forex_balance_snapshot(
  p_user_id uuid,
  p_forex_account_id uuid,
  p_balance numeric,
  p_source text,
  p_source_transaction_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot owner is required.';
  END IF;

  IF p_balance IS NULL OR p_balance < 0 THEN
    RAISE EXCEPTION 'Snapshot Balance must be a non-negative number.';
  END IF;

  IF p_source NOT IN ('manual', 'deposit', 'withdrawal', 'backfill') THEN
    RAISE EXCEPTION 'Unsupported Forex Balance snapshot source.';
  END IF;

  IF p_source IN ('manual', 'backfill') AND p_source_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Manual/backfill snapshots cannot reference a cash transaction.';
  END IF;

  IF p_source IN ('deposit', 'withdrawal') AND p_source_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Cash-flow snapshots require a source transaction.';
  END IF;

  PERFORM 1
  FROM public.forex_accounts
  WHERE id = p_forex_account_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forex account does not belong to the finance owner.';
  END IF;

  IF p_source_transaction_id IS NOT NULL THEN
    PERFORM 1
    FROM public.forex_cash_transactions
    WHERE id = p_source_transaction_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source Forex cash transaction does not belong to the finance owner.';
    END IF;
  END IF;

  INSERT INTO public.forex_balance_snapshots (
    id,
    user_id,
    forex_account_id,
    balance,
    source,
    source_transaction_id,
    captured_at
  )
  VALUES (
    gen_random_uuid(),
    p_user_id,
    p_forex_account_id,
    p_balance,
    p_source,
    p_source_transaction_id,
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_forex_balance_snapshot(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;

-- New accounts with an initial Balance must also receive their first manual
-- snapshot; otherwise 1C would incorrectly report missing Balance history.
CREATE OR REPLACE FUNCTION public.create_forex_account_atomic(
  p_id uuid,
  p_name text,
  p_broker text,
  p_account_number text,
  p_currency text,
  p_status text,
  p_opened_at date,
  p_notes text,
  p_current_equity numeric
)
RETURNS public.forex_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_finance_write_owner_user_id();
  v_result public.forex_accounts%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No finance write permission.';
  END IF;

  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Forex account name is required.';
  END IF;

  IF NULLIF(trim(COALESCE(p_broker, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Forex broker is required.';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid Forex account status.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex accounts currently support VND only.';
  END IF;

  IF p_current_equity IS NOT NULL AND p_current_equity < 0 THEN
    RAISE EXCEPTION 'Forex Balance cannot be negative.';
  END IF;

  INSERT INTO public.forex_accounts (
    id,
    user_id,
    name,
    broker,
    account_number,
    currency,
    status,
    opened_at,
    notes,
    current_equity
  )
  VALUES (
    p_id,
    v_user_id,
    trim(p_name),
    trim(p_broker),
    NULLIF(trim(COALESCE(p_account_number, '')), ''),
    'VND',
    p_status,
    p_opened_at,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    p_current_equity
  )
  RETURNING * INTO v_result;

  IF p_current_equity IS NOT NULL THEN
    PERFORM public.capture_forex_balance_snapshot(
      v_user_id,
      p_id,
      p_current_equity,
      'manual',
      NULL
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_forex_account_atomic(
  p_id uuid,
  p_name text,
  p_broker text,
  p_account_number text,
  p_currency text,
  p_status text,
  p_opened_at date,
  p_notes text,
  p_current_equity numeric
)
RETURNS public.forex_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_finance_write_owner_user_id();
  v_old public.forex_accounts%rowtype;
  v_result public.forex_accounts%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No finance write permission.';
  END IF;

  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Forex account name is required.';
  END IF;

  IF NULLIF(trim(COALESCE(p_broker, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Forex broker is required.';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid Forex account status.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex accounts currently support VND only.';
  END IF;

  IF p_current_equity IS NOT NULL AND p_current_equity < 0 THEN
    RAISE EXCEPTION 'Forex Balance cannot be negative.';
  END IF;

  SELECT *
  INTO v_old
  FROM public.forex_accounts
  WHERE id = p_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forex account not found.';
  END IF;

  -- A non-null historical observation cannot be represented as "unknown" in
  -- the append-only snapshot model because Balance snapshots are intentionally
  -- NOT NULL. Fail closed instead of silently leaving a stale latest snapshot.
  IF v_old.current_equity IS NOT NULL AND p_current_equity IS NULL THEN
    RAISE EXCEPTION 'Existing Forex Balance cannot be cleared once history exists.';
  END IF;

  UPDATE public.forex_accounts
  SET name = trim(p_name),
      broker = trim(p_broker),
      account_number = NULLIF(trim(COALESCE(p_account_number, '')), ''),
      currency = 'VND',
      status = p_status,
      opened_at = p_opened_at,
      notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
      current_equity = p_current_equity,
      updated_at = now()
  WHERE id = p_id
    AND user_id = v_user_id
  RETURNING * INTO v_result;

  IF p_current_equity IS NOT NULL
     AND p_current_equity IS DISTINCT FROM v_old.current_equity THEN
    PERFORM public.capture_forex_balance_snapshot(
      v_user_id,
      p_id,
      p_current_equity,
      'manual',
      NULL
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_forex_account_atomic(uuid,text,text,text,text,text,date,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_forex_cash_transaction(
  p_id uuid,
  p_forex_account_id uuid,
  p_wallet_id text,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_fee numeric,
  p_transaction_date date,
  p_transaction_time time without time zone,
  p_notes text
)
RETURNS public.forex_cash_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_finance_write_owner_user_id();
  v_wallet public.wallets%rowtype;
  v_account public.forex_accounts%rowtype;
  v_result public.forex_cash_transactions%rowtype;
  v_amount numeric := COALESCE(p_amount, 0);
  v_fee numeric := COALESCE(p_fee, 0);
  v_wallet_delta numeric;
  v_balance_delta numeric;
  v_account_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No finance write permission.';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid Forex cash transaction type.';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Fee cannot be negative.';
  END IF;

  IF p_type = 'withdrawal' AND v_fee >= v_amount THEN
    RAISE EXCEPTION 'Withdrawal fee must be less than the withdrawal amount.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex Cash only supports VND.';
  END IF;

  SELECT *
  INTO v_account
  FROM public.forex_accounts
  WHERE id = p_forex_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forex account not found.';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked wallet not found.';
  END IF;

  IF v_account.current_equity IS NULL THEN
    SELECT COALESCE(
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END),
      0
    )
    INTO v_account_balance
    FROM public.forex_cash_transactions
    WHERE forex_account_id = p_forex_account_id
      AND user_id = v_user_id;
  ELSE
    v_account_balance := v_account.current_equity;
  END IF;

  v_balance_delta := CASE
    WHEN p_type = 'deposit' THEN v_amount
    ELSE -v_amount
  END;
  v_new_balance := v_account_balance + v_balance_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Forex Balance is insufficient for this withdrawal.';
  END IF;

  IF p_type = 'deposit' THEN
    v_wallet_delta := -(v_amount + v_fee);
  ELSE
    v_wallet_delta := v_amount - v_fee;
  END IF;

  IF v_wallet.balance + v_wallet_delta < 0 THEN
    RAISE EXCEPTION 'Wallet balance is insufficient for this Forex transaction.';
  END IF;

  INSERT INTO public.forex_cash_transactions (
    id,
    user_id,
    forex_account_id,
    wallet_id,
    type,
    amount,
    currency,
    fee,
    transaction_date,
    transaction_time,
    notes
  )
  VALUES (
    p_id,
    v_user_id,
    p_forex_account_id,
    p_wallet_id,
    p_type,
    v_amount,
    'VND',
    v_fee,
    p_transaction_date,
    COALESCE(p_transaction_time, localtime),
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING * INTO v_result;

  UPDATE public.forex_accounts
  SET current_equity = v_new_balance,
      updated_at = now()
  WHERE id = p_forex_account_id
    AND user_id = v_user_id;

  UPDATE public.wallets
  SET balance = balance + v_wallet_delta,
      updated_at = now()
  WHERE id = p_wallet_id
    AND user_id = v_user_id;

  PERFORM public.capture_forex_balance_snapshot(
    v_user_id,
    p_forex_account_id,
    v_new_balance,
    p_type,
    v_result.id
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_forex_cash_transaction(
  p_id uuid,
  p_forex_account_id uuid,
  p_wallet_id text,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_fee numeric,
  p_transaction_date date,
  p_transaction_time time without time zone,
  p_notes text
)
RETURNS public.forex_cash_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_finance_write_owner_user_id();
  v_old public.forex_cash_transactions%rowtype;
  v_old_account public.forex_accounts%rowtype;
  v_new_account public.forex_accounts%rowtype;
  v_old_wallet public.wallets%rowtype;
  v_new_wallet public.wallets%rowtype;
  v_result public.forex_cash_transactions%rowtype;
  v_amount numeric := COALESCE(p_amount, 0);
  v_fee numeric := COALESCE(p_fee, 0);
  v_reverse_old_wallet_delta numeric;
  v_apply_new_wallet_delta numeric;
  v_reverse_old_balance_delta numeric;
  v_apply_new_balance_delta numeric;
  v_old_account_balance numeric;
  v_new_account_balance numeric;
  v_same_account_balance numeric;
  v_same_wallet_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No finance write permission.';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Invalid Forex cash transaction type.';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Fee cannot be negative.';
  END IF;

  IF p_type = 'withdrawal' AND v_fee >= v_amount THEN
    RAISE EXCEPTION 'Withdrawal fee must be less than the withdrawal amount.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex Cash only supports VND.';
  END IF;

  SELECT *
  INTO v_old
  FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forex transaction to update was not found.';
  END IF;

  PERFORM 1
  FROM public.forex_accounts
  WHERE user_id = v_user_id
    AND id IN (v_old.forex_account_id, p_forex_account_id)
  ORDER BY id
  FOR UPDATE;

  SELECT *
  INTO v_old_account
  FROM public.forex_accounts
  WHERE id = v_old.forex_account_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Old Forex account was not found.';
  END IF;

  SELECT *
  INTO v_new_account
  FROM public.forex_accounts
  WHERE id = p_forex_account_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New Forex account was not found.';
  END IF;

  PERFORM 1
  FROM public.wallets
  WHERE user_id = v_user_id
    AND id IN (v_old.wallet_id, p_wallet_id)
  ORDER BY id
  FOR UPDATE;

  SELECT *
  INTO v_old_wallet
  FROM public.wallets
  WHERE id = v_old.wallet_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Old wallet was not found.';
  END IF;

  SELECT *
  INTO v_new_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New wallet was not found.';
  END IF;

  IF v_old_account.current_equity IS NULL THEN
    SELECT COALESCE(
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END),
      0
    )
    INTO v_old_account_balance
    FROM public.forex_cash_transactions
    WHERE forex_account_id = v_old.forex_account_id
      AND user_id = v_user_id;
  ELSE
    v_old_account_balance := v_old_account.current_equity;
  END IF;

  IF p_forex_account_id = v_old.forex_account_id THEN
    v_new_account_balance := v_old_account_balance;
  ELSIF v_new_account.current_equity IS NULL THEN
    SELECT COALESCE(
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END),
      0
    )
    INTO v_new_account_balance
    FROM public.forex_cash_transactions
    WHERE forex_account_id = p_forex_account_id
      AND user_id = v_user_id;
  ELSE
    v_new_account_balance := v_new_account.current_equity;
  END IF;

  v_reverse_old_balance_delta := CASE
    WHEN v_old.type = 'deposit' THEN -v_old.amount
    ELSE v_old.amount
  END;
  v_apply_new_balance_delta := CASE
    WHEN p_type = 'deposit' THEN v_amount
    ELSE -v_amount
  END;

  IF p_forex_account_id = v_old.forex_account_id THEN
    v_same_account_balance :=
      v_old_account_balance +
      v_reverse_old_balance_delta +
      v_apply_new_balance_delta;

    IF v_same_account_balance < 0 THEN
      RAISE EXCEPTION 'Forex Balance is insufficient to update this transaction.';
    END IF;
  ELSE
    IF v_old_account_balance + v_reverse_old_balance_delta < 0 THEN
      RAISE EXCEPTION 'Cannot reverse the old Forex account Balance below zero.';
    END IF;

    IF v_new_account_balance + v_apply_new_balance_delta < 0 THEN
      RAISE EXCEPTION 'New Forex account Balance is insufficient.';
    END IF;
  END IF;

  IF v_old.type = 'deposit' THEN
    v_reverse_old_wallet_delta :=
      COALESCE(v_old.amount, 0) + COALESCE(v_old.fee, 0);
  ELSE
    v_reverse_old_wallet_delta :=
      -(COALESCE(v_old.amount, 0) - COALESCE(v_old.fee, 0));
  END IF;

  IF p_type = 'deposit' THEN
    v_apply_new_wallet_delta := -(v_amount + v_fee);
  ELSE
    v_apply_new_wallet_delta := v_amount - v_fee;
  END IF;

  IF p_wallet_id = v_old.wallet_id THEN
    v_same_wallet_balance :=
      v_old_wallet.balance +
      v_reverse_old_wallet_delta +
      v_apply_new_wallet_delta;

    IF v_same_wallet_balance < 0 THEN
      RAISE EXCEPTION 'Wallet balance is insufficient to update this Forex transaction.';
    END IF;
  ELSE
    IF v_old_wallet.balance + v_reverse_old_wallet_delta < 0 THEN
      RAISE EXCEPTION 'Cannot reverse the old wallet below zero.';
    END IF;

    IF v_new_wallet.balance + v_apply_new_wallet_delta < 0 THEN
      RAISE EXCEPTION 'New wallet balance is insufficient.';
    END IF;
  END IF;

  IF p_forex_account_id = v_old.forex_account_id THEN
    UPDATE public.forex_accounts
    SET current_equity = v_same_account_balance,
        updated_at = now()
    WHERE id = p_forex_account_id
      AND user_id = v_user_id;
  ELSE
    UPDATE public.forex_accounts
    SET current_equity = v_old_account_balance + v_reverse_old_balance_delta,
        updated_at = now()
    WHERE id = v_old.forex_account_id
      AND user_id = v_user_id;

    UPDATE public.forex_accounts
    SET current_equity = v_new_account_balance + v_apply_new_balance_delta,
        updated_at = now()
    WHERE id = p_forex_account_id
      AND user_id = v_user_id;
  END IF;

  IF p_wallet_id = v_old.wallet_id THEN
    UPDATE public.wallets
    SET balance = v_same_wallet_balance,
        updated_at = now()
    WHERE id = p_wallet_id
      AND user_id = v_user_id;
  ELSE
    UPDATE public.wallets
    SET balance = balance + v_reverse_old_wallet_delta,
        updated_at = now()
    WHERE id = v_old.wallet_id
      AND user_id = v_user_id;

    UPDATE public.wallets
    SET balance = balance + v_apply_new_wallet_delta,
        updated_at = now()
    WHERE id = p_wallet_id
      AND user_id = v_user_id;
  END IF;

  UPDATE public.forex_cash_transactions
  SET forex_account_id = p_forex_account_id,
      wallet_id = p_wallet_id,
      type = p_type,
      amount = v_amount,
      currency = 'VND',
      fee = v_fee,
      transaction_date = p_transaction_date,
      transaction_time = COALESCE(p_transaction_time, localtime),
      notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
      updated_at = now()
  WHERE id = p_id
    AND user_id = v_user_id
  RETURNING * INTO v_result;

  IF p_forex_account_id = v_old.forex_account_id THEN
    PERFORM public.capture_forex_balance_snapshot(
      v_user_id,
      p_forex_account_id,
      v_same_account_balance,
      p_type,
      p_id
    );
  ELSE
    PERFORM public.capture_forex_balance_snapshot(
      v_user_id,
      v_old.forex_account_id,
      v_old_account_balance + v_reverse_old_balance_delta,
      v_old.type,
      p_id
    );

    PERFORM public.capture_forex_balance_snapshot(
      v_user_id,
      p_forex_account_id,
      v_new_account_balance + v_apply_new_balance_delta,
      p_type,
      p_id
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_forex_cash_transaction(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.current_finance_write_owner_user_id();
  v_transaction public.forex_cash_transactions%rowtype;
  v_account public.forex_accounts%rowtype;
  v_wallet public.wallets%rowtype;
  v_account_balance numeric;
  v_reverse_balance_delta numeric;
  v_reverse_wallet_delta numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No finance write permission.';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forex transaction to delete was not found.';
  END IF;

  SELECT *
  INTO v_account
  FROM public.forex_accounts
  WHERE id = v_transaction.forex_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked Forex account was not found.';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE id = v_transaction.wallet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked wallet was not found.';
  END IF;

  IF v_account.current_equity IS NULL THEN
    SELECT COALESCE(
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END),
      0
    )
    INTO v_account_balance
    FROM public.forex_cash_transactions
    WHERE forex_account_id = v_transaction.forex_account_id
      AND user_id = v_user_id;
  ELSE
    v_account_balance := v_account.current_equity;
  END IF;

  v_reverse_balance_delta := CASE
    WHEN v_transaction.type = 'deposit' THEN -v_transaction.amount
    ELSE v_transaction.amount
  END;
  v_new_balance := v_account_balance + v_reverse_balance_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Cannot reverse Forex Balance below zero.';
  END IF;

  IF v_transaction.type = 'deposit' THEN
    v_reverse_wallet_delta :=
      COALESCE(v_transaction.amount, 0) + COALESCE(v_transaction.fee, 0);
  ELSE
    v_reverse_wallet_delta :=
      -(COALESCE(v_transaction.amount, 0) - COALESCE(v_transaction.fee, 0));
  END IF;

  IF v_wallet.balance + v_reverse_wallet_delta < 0 THEN
    RAISE EXCEPTION 'Wallet balance is insufficient to reverse this Forex transaction.';
  END IF;

  UPDATE public.forex_accounts
  SET current_equity = v_new_balance,
      updated_at = now()
  WHERE id = v_transaction.forex_account_id
    AND user_id = v_user_id;

  UPDATE public.wallets
  SET balance = balance + v_reverse_wallet_delta,
      updated_at = now()
  WHERE id = v_transaction.wallet_id
    AND user_id = v_user_id;

  -- Capture before deleting the source row. ON DELETE SET NULL preserves the
  -- immutable snapshot while clearing the now-dead ledger reference.
  PERFORM public.capture_forex_balance_snapshot(
    v_user_id,
    v_transaction.forex_account_id,
    v_new_balance,
    v_transaction.type,
    v_transaction.id
  );

  DELETE FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_forex_cash_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_forex_cash_transaction(uuid) TO authenticated;

COMMIT;
