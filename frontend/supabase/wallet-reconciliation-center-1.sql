-- WALLET-RECONCILIATION-CENTER-1
-- Durable, atomic wallet reconciliation receipts.
-- Reconciliation updates wallet.balance without creating synthetic cash-flow transactions.

CREATE TABLE IF NOT EXISTS public.wallet_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id text NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  expected_balance numeric NOT NULL,
  actual_balance numeric NOT NULL,
  difference numeric GENERATED ALWAYS AS (actual_balance - expected_balance) STORED,
  note text,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_reconciliations_actual_nonnegative CHECK (actual_balance >= 0),
  CONSTRAINT wallet_reconciliations_note_length CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS wallet_reconciliations_user_reconciled_idx
  ON public.wallet_reconciliations (user_id, reconciled_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS wallet_reconciliations_wallet_reconciled_idx
  ON public.wallet_reconciliations (wallet_id, reconciled_at DESC, id DESC);

ALTER TABLE public.wallet_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_reconciliations_select ON public.wallet_reconciliations;
CREATE POLICY wallet_reconciliations_select
ON public.wallet_reconciliations
FOR SELECT
TO authenticated
USING (user_id = public.current_finance_scope_owner_user_id());

REVOKE ALL ON TABLE public.wallet_reconciliations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.wallet_reconciliations FROM authenticated;
GRANT SELECT ON TABLE public.wallet_reconciliations TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_wallet_balance_atomic(
  p_wallet_id text,
  p_expected_balance numeric,
  p_actual_balance numeric,
  p_note text DEFAULT NULL
)
RETURNS SETOF public.wallet_reconciliations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_wallet public.wallets%rowtype;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFR01';
  END IF;

  v_owner_user_id := public.current_finance_write_owner_user_id();
  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Write permission required' USING ERRCODE = 'MFR06';
  END IF;

  IF p_wallet_id IS NULL OR trim(p_wallet_id) = '' OR
     p_expected_balance IS NULL OR p_actual_balance IS NULL OR
     p_actual_balance < 0 THEN
    RAISE EXCEPTION 'Invalid reconciliation input' USING ERRCODE = 'MFR04';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Reconciliation note too long' USING ERRCODE = 'MFR07';
  END IF;

  SELECT *
    INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND user_id = v_owner_user_id
    AND type <> 'investment'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFR03';
  END IF;

  IF v_wallet.balance IS DISTINCT FROM p_expected_balance THEN
    RAISE EXCEPTION 'Wallet balance changed' USING ERRCODE = 'MFR02';
  END IF;

  IF p_actual_balance = p_expected_balance THEN
    RAISE EXCEPTION 'No reconciliation needed' USING ERRCODE = 'MFR05';
  END IF;

  UPDATE public.wallets
  SET balance = p_actual_balance
  WHERE id = v_wallet.id
    AND user_id = v_owner_user_id;

  RETURN QUERY
  INSERT INTO public.wallet_reconciliations (
    user_id,
    wallet_id,
    expected_balance,
    actual_balance,
    note,
    actor_user_id
  )
  VALUES (
    v_owner_user_id,
    v_wallet.id,
    p_expected_balance,
    p_actual_balance,
    v_note,
    v_actor_user_id
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)
  TO authenticated;

COMMENT ON TABLE public.wallet_reconciliations IS
  'Durable receipts for manual wallet balance reconciliation. These records are operational/audit provenance and do not represent cash-flow transactions.';
