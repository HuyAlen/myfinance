-- WALLET-RECONCILIATION-STATUS-UX-1 (P1)
-- MUTATING DDL. Verify CI, expected production, and staging before execution.
-- Adds revision tokens, records equal-balance confirmation WITHOUT wallet UPDATE,
-- protects new receipt/metadata under existing household-aware RPC permissions.
-- Existing receipts have NULL revision -> "needs_review" until reconfirmed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_rpc oid := to_regprocedure('public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)');
  v_body text;
BEGIN
  IF to_regclass('public.wallets') IS NULL
     OR to_regclass('public.wallet_reconciliations') IS NULL THEN
    RAISE EXCEPTION 'WRSTATUS01: Required wallet or reconciliation table missing';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = 'public.wallets'::regclass AND relrowsecurity
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = 'public.wallet_reconciliations'::regclass AND relrowsecurity
    ) THEN
    RAISE EXCEPTION 'WRSTATUS01: RLS must be enabled on both tables';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name = 'wallets' AND column_name = 'balance_revision') OR
      (table_name = 'wallet_reconciliations' AND column_name = 'balance_revision')
    )
  ) OR to_regprocedure('public.wallet_balance_revision_guard()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.wallets'::regclass
        AND tgname = 'trg_wallet_balance_revision'
        AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'WRSTATUS01: Migration already applied or partially drifted; stop';
  END IF;

  IF v_rpc IS NULL OR (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reconcile_wallet_balance_atomic'
  ) <> 1 THEN
    RAISE EXCEPTION 'WRSTATUS01: Reconcile RPC missing or overloaded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid = v_rpc AND p.prosecdef
      AND p.proretset
      AND p.prorettype = 'public.wallet_reconciliations'::regtype
      AND regexp_replace(COALESCE(array_to_string(p.proconfig, ','), ''),
          '[[:space:]]+', '', 'g') = 'search_path=public,pg_temp'
  ) OR has_function_privilege('anon', v_rpc, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'WRSTATUS01: Reconcile RPC security contract changed';
  END IF;

  SELECT pg_get_functiondef(v_rpc) INTO v_body;
  IF v_body NOT ILIKE '%No reconciliation needed%'
     OR v_body NOT ILIKE '%FOR UPDATE%'
     OR v_body NOT ILIKE '%current_finance_write_owner_user_id%' THEN
    RAISE EXCEPTION 'WRSTATUS01: Reconcile RPC body is not reviewed baseline';
  END IF;

  IF has_table_privilege('anon', 'public.wallets'::regclass, 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.wallet_reconciliations'::regclass, 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('authenticated', 'public.wallet_reconciliations'::regclass, 'SELECT')
     OR has_table_privilege('authenticated', 'public.wallet_reconciliations'::regclass, 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'WRSTATUS01: Unexpected wallet/receipt ACL';
  END IF;
END;
$preflight$;

ALTER TABLE public.wallets
  ADD COLUMN balance_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.wallet_reconciliations
  ADD COLUMN balance_revision bigint;

-- Never let a direct client INSERT/UPDATE forge the version counter.
CREATE FUNCTION public.wallet_balance_revision_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.balance_revision := 0;
  ELSIF NEW.balance IS DISTINCT FROM OLD.balance THEN
    NEW.balance_revision := OLD.balance_revision + 1;
  ELSE
    NEW.balance_revision := OLD.balance_revision;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_balance_revision_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_wallet_balance_revision
BEFORE INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.wallet_balance_revision_guard();

-- Preserve signature, lock-based compare-and-set, owner scoping, and RLS policy.
-- Equal balance creates ONLY a receipt; a real correction updates wallet +
-- stamps the new version under the very same locked transaction.
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
  v_balance_revision bigint;
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

  SELECT * INTO v_wallet
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

  v_balance_revision := v_wallet.balance_revision;
  IF p_actual_balance IS DISTINCT FROM p_expected_balance THEN
    UPDATE public.wallets
    SET balance = p_actual_balance
    WHERE id = v_wallet.id
      AND user_id = v_owner_user_id
    RETURNING balance_revision INTO v_balance_revision;
  END IF;

  RETURN QUERY
  INSERT INTO public.wallet_reconciliations (
    user_id, wallet_id, expected_balance, actual_balance,
    note, actor_user_id, balance_revision
  )
  VALUES (
    v_owner_user_id, v_wallet.id, p_expected_balance, p_actual_balance,
    v_note, v_actor_user_id, v_balance_revision
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)
  TO authenticated;

DO $postflight$
DECLARE
  v_func oid := to_regprocedure('public.reconcile_wallet_balance_atomic(text,numeric,numeric,text)');
  v_trigger oid;
BEGIN
  SELECT t.oid INTO v_trigger FROM pg_trigger t
  WHERE t.tgrelid = 'public.wallets'::regclass
    AND t.tgname = 'trg_wallet_balance_revision'
    AND NOT t.tgisinternal AND t.tgenabled = 'O';

  IF v_trigger IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'public.wallets'::regclass
        AND attname = 'balance_revision' AND attnotnull AND NOT attisdropped
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'public.wallet_reconciliations'::regclass
        AND attname = 'balance_revision' AND NOT attisdropped
    )
    OR has_function_privilege('anon', v_func, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_func, 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = v_func AND p.prosecdef
    ) THEN
    RAISE EXCEPTION 'WRSTATUS01: Postflight schema/security invariant failed';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
-- Apply ONCE on reviewed staging first. Do not re-run after commit.
