-- ============================================================================
-- WALLETS-INTEGRITY-2 - Atomic Wallet Delete & Reference Guard
-- Forward migration for an existing MyFinance Supabase project.
--
-- Goals:
--   * close the client check-then-delete race permanently;
--   * preserve all financial history (RESTRICT, never CASCADE);
--   * enforce same-user wallet ownership for NEW transaction writes;
--   * tolerate legacy transaction orphans while surfacing them for cleanup.
--
-- IMPORTANT:
--   Apply this migration BEFORE deploying the matching frontend change.
--   The frontend intentionally has no unsafe direct-DELETE fallback.
-- ============================================================================

BEGIN;

-- The wallets PK already makes id globally unique. This composite key is an
-- additional ownership key used by the transaction FKs below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.wallets'::regclass
      AND conname = 'wallets_user_id_id_key'
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_user_id_id_key UNIQUE (user_id, id);
  END IF;
END
$$;

-- Source-wallet and destination-wallet lookup/FK support. The source index
-- already exists in current DB-SSOT-1; the destination index is new.
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_to_wallet
  ON public.transactions (user_id, "transferToWalletId")
  WHERE "transferToWalletId" IS NOT NULL;

-- NOT VALID is intentional for the forward migration. PostgreSQL still
-- enforces each FK for NEW/UPDATED rows and for parent-wallet DELETEs, but it
-- does not reject deployment because of a pre-existing historical orphan.
-- If the audit below is clean, each constraint is validated immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_wallet_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_wallet_id_fkey
      FOREIGN KEY (user_id, "walletId")
      REFERENCES public.wallets(user_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_transfer_to_wallet_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_transfer_to_wallet_id_fkey
      FOREIGN KEY (user_id, "transferToWalletId")
      REFERENCES public.wallets(user_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
DECLARE
  v_source_orphans bigint;
  v_destination_orphans bigint;
BEGIN
  SELECT count(*) INTO v_source_orphans
  FROM public.transactions t
  LEFT JOIN public.wallets w
    ON w.user_id = t.user_id AND w.id = t."walletId"
  WHERE w.id IS NULL;

  SELECT count(*) INTO v_destination_orphans
  FROM public.transactions t
  LEFT JOIN public.wallets w
    ON w.user_id = t.user_id AND w.id = t."transferToWalletId"
  WHERE t."transferToWalletId" IS NOT NULL
    AND w.id IS NULL;

  IF v_source_orphans = 0 THEN
    ALTER TABLE public.transactions
      VALIDATE CONSTRAINT transactions_wallet_id_fkey;
  ELSE
    RAISE NOTICE
      'WALLETS-INTEGRITY-2: transactions_wallet_id_fkey left NOT VALID because % legacy source-wallet orphan(s) exist. New writes/deletes are still protected.',
      v_source_orphans;
  END IF;

  IF v_destination_orphans = 0 THEN
    ALTER TABLE public.transactions
      VALIDATE CONSTRAINT transactions_transfer_to_wallet_id_fkey;
  ELSE
    RAISE NOTICE
      'WALLETS-INTEGRITY-2: transactions_transfer_to_wallet_id_fkey left NOT VALID because % legacy destination-wallet orphan(s) exist. New writes/deletes are still protected.',
      v_destination_orphans;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.delete_wallet_atomic(p_wallet_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFW01';
  END IF;

  IF p_wallet_id IS NULL OR trim(p_wallet_id) = '' THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFW03';
  END IF;

  -- The row lock is the serialization boundary shared with Finance/Savings/
  -- Forex mutation RPCs. Either their reference commits first (and this
  -- delete sees it), or this delete commits first (and their locked wallet
  -- lookup subsequently fails).
  PERFORM 1
  FROM public.wallets
  WHERE id = p_wallet_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFW03';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = v_user_id
      AND ("walletId" = p_wallet_id OR "transferToWalletId" = p_wallet_id)
  ) OR EXISTS (
    SELECT 1 FROM public.forex_cash_transactions
    WHERE user_id = v_user_id AND wallet_id = p_wallet_id
  ) OR EXISTS (
    SELECT 1 FROM public.savings
    WHERE user_id = v_user_id AND wallet_id = p_wallet_id
  ) OR EXISTS (
    SELECT 1 FROM public.saving_transactions
    WHERE user_id = v_user_id AND wallet_id = p_wallet_id
  ) THEN
    RAISE EXCEPTION 'Wallet has financial references' USING ERRCODE = 'MFW02';
  END IF;

  BEGIN
    DELETE FROM public.wallets
    WHERE id = p_wallet_id AND user_id = v_user_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Final backstop for any reference protected by an FK, including a
      -- concurrent/legacy row outside the explicit same-user checks above.
      RAISE EXCEPTION 'Wallet has financial references' USING ERRCODE = 'MFW02';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_wallet_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_wallet_atomic(text) TO authenticated;

COMMIT;
