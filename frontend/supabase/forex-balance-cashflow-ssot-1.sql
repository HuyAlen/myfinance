-- FOREX-BALANCE-CASHFLOW-SSOT-1
-- Keep broker Balance and wallet cash in the same PostgreSQL transaction as
-- every Forex deposit/withdraw mutation.
--
-- Cutover rule: existing non-null current_equity is the authoritative Balance
-- snapshot at migration time. Historical ledger rows are NOT replayed into it,
-- because the database cannot know which cash movements were already reflected
-- in a manually entered broker Balance. From this migration forward every cash
-- mutation changes Balance exactly once. Accounts whose Balance is still null
-- lazily derive their starting Balance from deposit/withdraw amounts only.
BEGIN;

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
    RAISE EXCEPTION 'Không có quyền ghi dữ liệu tài chính.';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Loại giao dịch Forex không hợp lệ.';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải lớn hơn 0.';
  END IF;

  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Phí không được nhỏ hơn 0.';
  END IF;

  IF p_type = 'withdrawal' AND v_fee >= v_amount THEN
    RAISE EXCEPTION 'Phí rút phải nhỏ hơn số tiền rút.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex Cash chỉ hỗ trợ VND.';
  END IF;

  SELECT *
  INTO v_account
  FROM public.forex_accounts
  WHERE id = p_forex_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản Forex.';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ví liên kết.';
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
    RAISE EXCEPTION 'Balance Forex không đủ để thực hiện giao dịch rút.';
  END IF;

  IF p_type = 'deposit' THEN
    v_wallet_delta := -(v_amount + v_fee);
  ELSE
    v_wallet_delta := v_amount - v_fee;
  END IF;

  IF v_wallet.balance + v_wallet_delta < 0 THEN
    RAISE EXCEPTION 'Số dư ví không đủ để thực hiện giao dịch Forex.';
  END IF;

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
    RAISE EXCEPTION 'Không có quyền ghi dữ liệu tài chính.';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Loại giao dịch Forex không hợp lệ.';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải lớn hơn 0.';
  END IF;

  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Phí không được nhỏ hơn 0.';
  END IF;

  IF p_type = 'withdrawal' AND v_fee >= v_amount THEN
    RAISE EXCEPTION 'Phí rút phải nhỏ hơn số tiền rút.';
  END IF;

  IF upper(COALESCE(p_currency, 'VND')) <> 'VND' THEN
    RAISE EXCEPTION 'Forex Cash chỉ hỗ trợ VND.';
  END IF;

  SELECT *
  INTO v_old
  FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy giao dịch Forex cần cập nhật.';
  END IF;

  -- Lock both affected accounts in deterministic UUID order so concurrent
  -- cross-account edits cannot deadlock by taking the same rows oppositely.
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
    RAISE EXCEPTION 'Không tìm thấy tài khoản Forex cũ.';
  END IF;

  SELECT *
  INTO v_new_account
  FROM public.forex_accounts
  WHERE id = p_forex_account_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản Forex mới.';
  END IF;

  -- Lock both wallets in deterministic text-id order for the same reason.
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
    RAISE EXCEPTION 'Không tìm thấy ví cũ của giao dịch.';
  END IF;

  SELECT *
  INTO v_new_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ví mới của giao dịch.';
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
      RAISE EXCEPTION 'Balance Forex không đủ để cập nhật giao dịch.';
    END IF;
  ELSE
    IF v_old_account_balance + v_reverse_old_balance_delta < 0 THEN
      RAISE EXCEPTION 'Không thể hoàn nguyên Balance của tài khoản Forex cũ.';
    END IF;

    IF v_new_account_balance + v_apply_new_balance_delta < 0 THEN
      RAISE EXCEPTION 'Balance Forex mới không đủ để cập nhật giao dịch.';
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
      RAISE EXCEPTION 'Số dư ví không đủ để cập nhật giao dịch Forex.';
    END IF;
  ELSE
    IF v_old_wallet.balance + v_reverse_old_wallet_delta < 0 THEN
      RAISE EXCEPTION 'Không thể hoàn nguyên số dư ví cũ.';
    END IF;

    IF v_new_wallet.balance + v_apply_new_wallet_delta < 0 THEN
      RAISE EXCEPTION 'Số dư ví mới không đủ để cập nhật giao dịch Forex.';
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
    RAISE EXCEPTION 'Không có quyền ghi dữ liệu tài chính.';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy giao dịch Forex cần xóa.';
  END IF;

  SELECT *
  INTO v_account
  FROM public.forex_accounts
  WHERE id = v_transaction.forex_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản Forex liên kết.';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE id = v_transaction.wallet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ví liên kết.';
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
    RAISE EXCEPTION 'Không thể hoàn nguyên Balance Forex về số âm.';
  END IF;

  IF v_transaction.type = 'deposit' THEN
    v_reverse_wallet_delta :=
      COALESCE(v_transaction.amount, 0) + COALESCE(v_transaction.fee, 0);
  ELSE
    v_reverse_wallet_delta :=
      -(COALESCE(v_transaction.amount, 0) - COALESCE(v_transaction.fee, 0));
  END IF;

  IF v_wallet.balance + v_reverse_wallet_delta < 0 THEN
    RAISE EXCEPTION 'Số dư ví không đủ để hoàn nguyên giao dịch Forex.';
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

  DELETE FROM public.forex_cash_transactions
  WHERE id = p_id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_forex_cash_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_forex_cash_transaction(uuid) TO authenticated;

COMMIT;
