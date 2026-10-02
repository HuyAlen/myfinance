-- SAVINGS-INTERNAL-TRANSFER-1 — Atomic savings-to-savings transfer
--
-- Moves value between two savings accounts without touching wallets and
-- without creating a main transactions row. Total savings / net worth stay
-- unchanged. Both balances and both saving_transactions ledger rows commit
-- or roll back together.
--
-- Internal-transfer identity is persisted inside the existing note column:
--   __saving_transfer__:<uuid>:out|<display note>
--   __saving_transfer__:<uuid>:in|<display note>

CREATE OR REPLACE FUNCTION public.transfer_saving_balance(
  p_source_saving_id uuid,
  p_destination_saving_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_source_transaction_id uuid,
  p_destination_transaction_id uuid,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  source_saving savings,
  destination_saving savings,
  source_transaction saving_transactions,
  destination_transaction saving_transactions,
  transfer_reference uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source savings;
  v_destination savings;
  v_source_transaction saving_transactions;
  v_destination_transaction saving_transactions;
  v_transfer_reference uuid := gen_random_uuid();
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_source_display_note text;
  v_destination_display_note text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  IF p_source_saving_id IS NULL OR p_destination_saving_id IS NULL
     OR p_source_saving_id = p_destination_saving_id THEN
    RAISE EXCEPTION 'Source and destination savings must differ'
      USING ERRCODE = 'MFS07';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Invalid savings transfer data' USING ERRCODE = 'MFS04';
  END IF;

  -- Deterministic lock order prevents A->B / B->A deadlocks.
  PERFORM 1
  FROM savings
  WHERE user_id = v_user_id
    AND id IN (p_source_saving_id, p_destination_saving_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_source
  FROM savings
  WHERE id = p_source_saving_id AND user_id = v_user_id;

  SELECT * INTO v_destination
  FROM savings
  WHERE id = p_destination_saving_id AND user_id = v_user_id;

  IF v_source.id IS NULL OR v_destination.id IS NULL THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  IF p_amount > v_source.balance THEN
    RAISE EXCEPTION 'Insufficient savings balance' USING ERRCODE = 'MFS02';
  END IF;

  UPDATE savings
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_source_saving_id AND user_id = v_user_id
  RETURNING * INTO v_source;

  UPDATE savings
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE id = p_destination_saving_id AND user_id = v_user_id
  RETURNING * INTO v_destination;

  v_source_display_note :=
    'Chuyển sang ' || v_destination.name ||
    CASE WHEN v_note IS NULL THEN '' ELSE ' · ' || v_note END;

  v_destination_display_note :=
    'Nhận từ ' || v_source.name ||
    CASE WHEN v_note IS NULL THEN '' ELSE ' · ' || v_note END;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_source_transaction_id, v_user_id, p_source_saving_id, 'withdraw',
    p_amount, NULL, p_transaction_date,
    '__saving_transfer__:' || v_transfer_reference::text || ':out|' ||
      v_source_display_note
  )
  RETURNING * INTO v_source_transaction;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_destination_transaction_id, v_user_id, p_destination_saving_id, 'deposit',
    p_amount, NULL, p_transaction_date,
    '__saving_transfer__:' || v_transfer_reference::text || ':in|' ||
      v_destination_display_note
  )
  RETURNING * INTO v_destination_transaction;

  RETURN QUERY
  SELECT
    v_source,
    v_destination,
    v_source_transaction,
    v_destination_transaction,
    v_transfer_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_saving_balance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_saving_balance TO authenticated;
