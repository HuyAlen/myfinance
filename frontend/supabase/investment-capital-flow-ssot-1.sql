BEGIN;

-- INVESTMENT-CAPITAL-FLOW-SSOT-1
--
-- Portfolio capital flow reuses the existing main transactions ledger instead
-- of adding a second transaction table. The atomic RPC owns all three effects:
-- Wallet balance, Investment invested/current value, and one immutable
-- investment-owned transfer row.
--
-- A capital deposit/withdraw moves investedAmount and currentValue by the same
-- amount, preserving the pre-existing unrealized P/L. Market-value changes
-- remain explicit snapshot edits on Investment.currentValue.
ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_invested_positive;
ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_invested_nonnegative;
ALTER TABLE public.investments
  ADD CONSTRAINT investments_invested_nonnegative
  CHECK ("investedAmount" >= 0);

CREATE OR REPLACE FUNCTION public.create_investment_capital_movement(
  p_transaction_id text,
  p_investment_id text,
  p_wallet_id text,
  p_type text,
  p_amount numeric,
  p_transaction_date date,
  p_note text DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_investment public.investments;
  v_wallet public.wallets;
  v_transaction public.transactions;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFI01';
  END IF;

  IF p_transaction_id IS NULL OR trim(p_transaction_id) = ''
     OR p_investment_id IS NULL OR trim(p_investment_id) = ''
     OR p_wallet_id IS NULL OR trim(p_wallet_id) = ''
     OR p_type NOT IN ('deposit', 'withdraw')
     OR p_amount IS NULL OR p_amount <= 0
     OR p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Invalid investment capital movement'
      USING ERRCODE = 'MFI04';
  END IF;

  -- Investment first, then Wallet: every movement uses the same lock order.
  SELECT * INTO v_investment
  FROM public.investments
  WHERE id = p_investment_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found' USING ERRCODE = 'MFI02';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFI03';
  END IF;

  IF p_type = 'deposit' AND v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFI05';
  END IF;

  IF p_type = 'withdraw'
     AND (
       v_investment."investedAmount" < p_amount
       OR v_investment."currentValue" < p_amount
     ) THEN
    RAISE EXCEPTION 'Insufficient investment capital/value'
      USING ERRCODE = 'MFI06';
  END IF;

  UPDATE public.wallets
  SET balance = balance + CASE
    WHEN p_type = 'deposit' THEN -p_amount
    ELSE p_amount
  END
  WHERE id = p_wallet_id AND user_id = v_user_id
  RETURNING * INTO v_wallet;

  UPDATE public.investments
  SET
    "investedAmount" = "investedAmount" + CASE
      WHEN p_type = 'deposit' THEN p_amount
      ELSE -p_amount
    END,
    "currentValue" = "currentValue" + CASE
      WHEN p_type = 'deposit' THEN p_amount
      ELSE -p_amount
    END,
    updated_at = now()
  WHERE id = p_investment_id AND user_id = v_user_id
  RETURNING * INTO v_investment;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    v_note := CASE
      WHEN p_type = 'deposit' THEN 'Nạp vốn '
      ELSE 'Rút vốn '
    END || v_investment.name;
  END IF;

  INSERT INTO public.transactions (
    id,
    user_id,
    type,
    amount,
    "categoryId",
    "walletId",
    note,
    date,
    "transferToWalletId",
    "isRecurring",
    recurrence,
    "nextRunDate",
    transfer_reference,
    transfer_reference_type,
    source_type,
    destination_type
  ) VALUES (
    p_transaction_id,
    v_user_id,
    'transfer'::transaction_type,
    p_amount,
    '',
    p_wallet_id,
    v_note,
    p_transaction_date,
    NULL,
    false,
    NULL,
    NULL,
    p_investment_id,
    'investment',
    CASE WHEN p_type = 'deposit' THEN 'wallet' ELSE 'investment' END,
    CASE WHEN p_type = 'deposit' THEN 'investment' ELSE 'wallet' END
  )
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_investment_capital_movement(
  text, text, text, text, numeric, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_investment_capital_movement(
  text, text, text, text, numeric, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_investment_snapshot_atomic(
  p_investment_id text,
  p_name text,
  p_type text,
  p_symbol text,
  p_invested_amount numeric,
  p_current_value numeric,
  p_purchase_date date,
  p_notes text
)
RETURNS public.investments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.investments;
  v_row public.investments;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFI01';
  END IF;

  IF p_investment_id IS NULL OR trim(p_investment_id) = ''
     OR p_name IS NULL OR trim(p_name) = ''
     OR p_type NOT IN ('stock', 'crypto', 'fund', 'gold', 'other')
     OR p_invested_amount IS NULL OR p_invested_amount < 0
     OR p_current_value IS NULL OR p_current_value < 0 THEN
    RAISE EXCEPTION 'Invalid investment snapshot'
      USING ERRCODE = 'MFI04';
  END IF;

  SELECT * INTO v_existing
  FROM public.investments
  WHERE id = p_investment_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found' USING ERRCODE = 'MFI02';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND transfer_reference_type = 'investment'
      AND transfer_reference = p_investment_id
  ) AND p_invested_amount IS DISTINCT FROM v_existing."investedAmount" THEN
    RAISE EXCEPTION 'Investment principal is managed by capital movement history'
      USING ERRCODE = 'MFI08';
  END IF;

  UPDATE public.investments
  SET
    name = trim(p_name),
    type = p_type::investment_type,
    symbol = NULLIF(trim(COALESCE(p_symbol, '')), ''),
    "investedAmount" = p_invested_amount,
    "currentValue" = p_current_value,
    "purchaseDate" = p_purchase_date,
    notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
    updated_at = now()
  WHERE id = p_investment_id AND user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_investment_snapshot_atomic(
  text, text, text, text, numeric, numeric, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_investment_snapshot_atomic(
  text, text, text, text, numeric, numeric, date, text
) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_investment_atomic(
  p_investment_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFI01';
  END IF;

  PERFORM 1
  FROM public.investments
  WHERE id = p_investment_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found' USING ERRCODE = 'MFI02';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND transfer_reference_type = 'investment'
      AND transfer_reference = p_investment_id
  ) THEN
    RAISE EXCEPTION 'Investment has capital movement history'
      USING ERRCODE = 'MFI07';
  END IF;

  DELETE FROM public.investments
  WHERE id = p_investment_id AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_investment_atomic(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_investment_atomic(text)
  TO authenticated;

COMMIT;
