-- FOREX-BALANCE-CASHFLOW-BACKFILL-1
-- One-time correction for the legacy FX-Capital withdrawal created before
-- FOREX-BALANCE-CASHFLOW-SSOT-1 started mutating broker Balance atomically.
--
-- Known legacy state:
--   account:    FX-Capital / Exness
--   withdrawal: 933,433 VND on 2026-09-16
--   Balance:    6,078,857 -> 5,145,424 VND
--
-- This migration intentionally does NOT replay wallet or cash-ledger effects.
-- Those rows already exist; only forex_accounts.current_equity missed the old
-- withdrawal. The guards below make this correction fail closed and safe to
-- rerun while the corrected Balance is still the current Balance.
BEGIN;

DO $backfill$
DECLARE
  v_target_account_name constant text := 'FX-Capital';
  v_target_broker constant text := 'Exness';
  v_target_amount constant numeric := 933433;
  v_target_date constant date := DATE '2026-09-16';
  v_expected_before constant numeric := 6078857;
  v_expected_after constant numeric := 5145424;

  v_runtime_function regprocedure;
  v_match_count bigint;
  v_account_id uuid;
  v_user_id uuid;
  v_current_balance numeric;
BEGIN
  -- Refuse to correct historical data until the runtime RPC has the new
  -- Balance-mutating semantics. Otherwise the next withdrawal would drift
  -- again immediately after this backfill.
  v_runtime_function := to_regprocedure(
    'public.create_forex_cash_transaction(uuid,uuid,text,text,numeric,text,numeric,date,time without time zone,text)'
  );

  IF v_runtime_function IS NULL
     OR position(
       'set current_equity = v_new_balance'
       IN lower(pg_get_functiondef(v_runtime_function))
     ) = 0 THEN
    RAISE EXCEPTION
      'FOREX-BALANCE-CASHFLOW-SSOT-1 must be applied before BACKFILL-1.';
  END IF;

  SELECT count(*)
  INTO v_match_count
  FROM public.forex_cash_transactions t
  JOIN public.forex_accounts a
    ON a.id = t.forex_account_id
   AND a.user_id = t.user_id
  WHERE a.name = v_target_account_name
    AND lower(trim(a.broker)) = lower(v_target_broker)
    AND t.type = 'withdrawal'
    AND t.amount = 933433
    AND t.transaction_date = DATE '2026-09-16';

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one legacy FX-Capital withdrawal of 933433 VND on 2026-09-16, found %.',
      v_match_count;
  END IF;

  -- Lock both the matched ledger row and account before checking the Balance.
  -- This prevents a concurrent Forex mutation from changing the baseline while
  -- the one-time correction is being decided.
  SELECT a.id, a.user_id, a.current_equity
  INTO v_account_id, v_user_id, v_current_balance
  FROM public.forex_cash_transactions t
  JOIN public.forex_accounts a
    ON a.id = t.forex_account_id
   AND a.user_id = t.user_id
  WHERE a.name = v_target_account_name
    AND lower(trim(a.broker)) = lower(v_target_broker)
    AND t.type = 'withdrawal'
    AND t.amount = v_target_amount
    AND t.transaction_date = v_target_date
  FOR UPDATE OF a, t;

  -- AUDIT-MUTATION-1 requires an authenticated actor for finance-row updates.
  -- A migration runs without an end-user JWT, so supply the target finance
  -- owner only for this transaction-local correction. The setting disappears
  -- automatically at COMMIT/ROLLBACK.
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  IF auth.uid() IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION
      'Unable to establish audit actor context for Forex Balance backfill.';
  END IF;

  IF v_current_balance = v_expected_before THEN
    UPDATE public.forex_accounts
    SET current_equity = v_expected_after,
        updated_at = now()
    WHERE id = v_account_id
      AND user_id = v_user_id
      AND current_equity = v_expected_before;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Forex Balance changed concurrently; BACKFILL-1 made no correction.';
    END IF;

    RAISE NOTICE
      'FOREX-BALANCE-CASHFLOW-BACKFILL-1 corrected Balance: % -> % VND.',
      v_expected_before,
      v_expected_after;
  ELSIF v_current_balance = v_expected_after THEN
    NULL; -- already corrected: intentional no-op
    RAISE NOTICE
      'FOREX-BALANCE-CASHFLOW-BACKFILL-1 already applied; no-op.';
  ELSE
    RAISE EXCEPTION
      'Unexpected legacy Forex Balance %. Expected % before correction or % after correction; no data changed.',
      v_current_balance,
      v_expected_before,
      v_expected_after;
  END IF;
END;
$backfill$;

COMMIT;
