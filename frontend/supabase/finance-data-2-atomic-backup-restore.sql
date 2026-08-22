-- ═════════════════════════════════════════════════════════════════════════════
-- FINANCE-DATA-2 — Atomic Backup/Restore & Complete Domain Coverage
--
-- Provides one versioned export snapshot and one all-or-nothing restore RPC
-- across every persisted core finance domain currently used by MyFinance:
--
--   wallets, categories, transactions, debts, goals, budgets, investments,
--   savings, saving_transactions, forex_accounts, forex_cash_transactions
--
-- Safety invariants:
--   • export is one database statement, not eleven independent browser reads;
--   • restore validates the V2 envelope and every mandatory collection before
--     its first DELETE;
--   • restore executes inside the RPC call's implicit PostgreSQL transaction,
--     so any insert/constraint/RLS failure rolls the entire replacement back;
--   • backed-up wallet/Forex/savings balances are restored as snapshots by
--     direct table INSERTs — financial movement RPCs are deliberately NOT
--     replayed, so balances cannot be applied a second time;
--   • backup-supplied user_id values are ignored/overwritten with auth.uid();
--   • SECURITY INVOKER keeps the caller's RLS policies active.
--
-- Historical note: this migration intentionally did not solve DB-SSOT-1 when
-- first authored. DB-SSOT-1 now represents all mandatory backup domains in
-- /supabase/schema.sql. The preflight below remains defensive for existing
-- projects that may still be behind the canonical baseline.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_required_table text;
BEGIN
  FOREACH v_required_table IN ARRAY ARRAY[
    'wallets',
    'categories',
    'transactions',
    'debts',
    'goals',
    'budgets',
    'investments',
    'savings',
    'saving_transactions',
    'forex_accounts',
    'forex_cash_transactions'
  ]
  LOOP
    IF to_regclass('public.' || v_required_table) IS NULL THEN
      RAISE EXCEPTION
        'FINANCE-DATA-2 requires missing table public.%', v_required_table;
    END IF;
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- export_finance_backup
--
-- Raw database rows are exported (minus user_id) instead of UI/domain mapped
-- objects. This preserves every persisted column needed for exact snapshot
-- restore, including fields added by later finance migrations.
-- Each empty domain is encoded as [] rather than null.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.export_finance_backup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;

  -- One SQL statement => one coherent export snapshot for all domains.
  RETURN jsonb_build_object(
    'format', 'myfinance-backup',
    'version', 2,
    'exported_at', now(),
    'data', jsonb_build_object(
      'wallets', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.wallets AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'categories', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.categories AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'debts', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.debts AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'goals', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.goals AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'budgets', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.budgets AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'investments', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.investments AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'savings', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.savings AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'saving_transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.saving_transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'forex_accounts', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.forex_accounts AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'forex_cash_transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.forex_cash_transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- restore_finance_backup
--
-- The function call is the transaction boundary. PostgreSQL rolls back every
-- DELETE and INSERT if any later statement raises, so a constraint failure,
-- malformed row, RLS rejection, or ownership mismatch can never leave a
-- partial restore behind.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_finance_backup(p_backup jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_restore_data jsonb;
  v_domain text;
  v_exported_at timestamptz;
  v_required_domains constant text[] := ARRAY[
    'wallets',
    'categories',
    'transactions',
    'debts',
    'goals',
    'budgets',
    'investments',
    'savings',
    'saving_transactions',
    'forex_accounts',
    'forex_cash_transactions'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;

  IF p_backup IS NULL OR jsonb_typeof(p_backup) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup envelope'
      USING ERRCODE = 'MFB02';
  END IF;

  -- The pre-V2 client exported pf_* keys and omitted Savings/Forex. Explicitly
  -- reject it rather than treating missing collections as empty and deleting
  -- the user's newer domains.
  IF p_backup ?| ARRAY[
    'pf_wallets',
    'pf_categories',
    'pf_transactions',
    'pf_debts',
    'pf_goals',
    'pf_budgets',
    'pf_investments'
  ] THEN
    RAISE EXCEPTION 'Legacy incomplete backup is not restorable safely'
      USING ERRCODE = 'MFB04';
  END IF;

  IF p_backup->>'format' IS DISTINCT FROM 'myfinance-backup' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup format'
      USING ERRCODE = 'MFB02';
  END IF;

  IF jsonb_typeof(p_backup->'version') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Backup version is missing or invalid'
      USING ERRCODE = 'MFB02';
  END IF;

  IF (p_backup->>'version')::numeric <> 2 THEN
    RAISE EXCEPTION 'Unsupported MyFinance backup version: %', p_backup->>'version'
      USING ERRCODE = 'MFB03';
  END IF;

  IF jsonb_typeof(p_backup->'exported_at') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Backup exported_at is missing or invalid'
      USING ERRCODE = 'MFB02';
  END IF;

  BEGIN
    v_exported_at := (p_backup->>'exported_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Backup exported_at is not a valid timestamp'
      USING ERRCODE = 'MFB02';
  END;

  v_data := p_backup->'data';
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Backup data object is missing'
      USING ERRCODE = 'MFB02';
  END IF;

  -- Mandatory complete-domain preflight. Every V2 collection must be present
  -- even when empty, and each element must be a JSON object. No DELETE occurs
  -- before this loop completes successfully.
  FOREACH v_domain IN ARRAY v_required_domains
  LOOP
    IF NOT (v_data ? v_domain) OR jsonb_typeof(v_data->v_domain) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Backup domain % is missing or is not an array', v_domain
        USING ERRCODE = 'MFB02';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_data->v_domain) AS item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
    ) THEN
      RAISE EXCEPTION 'Backup domain % contains a non-object row', v_domain
        USING ERRCODE = 'MFB02';
    END IF;
  END LOOP;

  -- Ignore any user_id contained in the uploaded JSON. This transformed copy
  -- is the only payload used below, and every row is forcibly attributed to
  -- the currently authenticated user.
  SELECT jsonb_object_agg(
    domain.key,
    COALESCE((
      SELECT jsonb_agg(item.value || jsonb_build_object('user_id', v_user_id))
      FROM jsonb_array_elements(domain.value) AS item(value)
    ), '[]'::jsonb)
  )
  INTO v_restore_data
  FROM jsonb_each(v_data) AS domain(key, value);

  -- Parse all collections into their live composite row types BEFORE the first
  -- DELETE. This catches incompatible JSON scalar/database types as preflight.
  -- Missing required SQL fields can still fail on INSERT constraints later;
  -- that failure remains atomic and rolls the entire RPC transaction back.
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.wallets, v_restore_data->'wallets');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.categories, v_restore_data->'categories');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.transactions, v_restore_data->'transactions');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.debts, v_restore_data->'debts');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.goals, v_restore_data->'goals');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.budgets, v_restore_data->'budgets');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.investments, v_restore_data->'investments');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.savings, v_restore_data->'savings');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.saving_transactions, v_restore_data->'saving_transactions');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.forex_accounts, v_restore_data->'forex_accounts');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.forex_cash_transactions, v_restore_data->'forex_cash_transactions');

  -- Child / ledger rows first on delete. All statements remain inside this one
  -- RPC transaction; if any subsequent insert fails, these deletes roll back.
  DELETE FROM public.saving_transactions WHERE user_id = v_user_id;
  DELETE FROM public.forex_cash_transactions WHERE user_id = v_user_id;
  DELETE FROM public.transactions WHERE user_id = v_user_id;
  DELETE FROM public.budgets WHERE user_id = v_user_id;
  DELETE FROM public.goals WHERE user_id = v_user_id;
  DELETE FROM public.debts WHERE user_id = v_user_id;
  DELETE FROM public.investments WHERE user_id = v_user_id;
  DELETE FROM public.savings WHERE user_id = v_user_id;
  DELETE FROM public.forex_accounts WHERE user_id = v_user_id;
  DELETE FROM public.categories WHERE user_id = v_user_id;
  DELETE FROM public.wallets WHERE user_id = v_user_id;

  -- Parent/snapshot rows first on insert. Direct inserts deliberately bypass the
  -- movement RPCs: balances in wallets/savings/forex_accounts are already the
  -- authoritative values captured by the backup snapshot.
  INSERT INTO public.wallets
    SELECT * FROM jsonb_populate_recordset(NULL::public.wallets, v_restore_data->'wallets');

  INSERT INTO public.categories
    SELECT * FROM jsonb_populate_recordset(NULL::public.categories, v_restore_data->'categories');

  INSERT INTO public.debts
    SELECT * FROM jsonb_populate_recordset(NULL::public.debts, v_restore_data->'debts');

  INSERT INTO public.goals
    SELECT * FROM jsonb_populate_recordset(NULL::public.goals, v_restore_data->'goals');

  INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(NULL::public.budgets, v_restore_data->'budgets');

  INSERT INTO public.investments
    SELECT * FROM jsonb_populate_recordset(NULL::public.investments, v_restore_data->'investments');

  INSERT INTO public.forex_accounts
    SELECT * FROM jsonb_populate_recordset(NULL::public.forex_accounts, v_restore_data->'forex_accounts');

  INSERT INTO public.savings
    SELECT * FROM jsonb_populate_recordset(NULL::public.savings, v_restore_data->'savings');

  INSERT INTO public.transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.transactions, v_restore_data->'transactions');

  INSERT INTO public.saving_transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.saving_transactions, v_restore_data->'saving_transactions');

  INSERT INTO public.forex_cash_transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.forex_cash_transactions, v_restore_data->'forex_cash_transactions');

  RETURN jsonb_build_object(
    'restored', true,
    'source_exported_at', v_exported_at,
    'counts', jsonb_build_object(
      'wallets', jsonb_array_length(v_data->'wallets'),
      'categories', jsonb_array_length(v_data->'categories'),
      'transactions', jsonb_array_length(v_data->'transactions'),
      'debts', jsonb_array_length(v_data->'debts'),
      'goals', jsonb_array_length(v_data->'goals'),
      'budgets', jsonb_array_length(v_data->'budgets'),
      'investments', jsonb_array_length(v_data->'investments'),
      'savings', jsonb_array_length(v_data->'savings'),
      'saving_transactions', jsonb_array_length(v_data->'saving_transactions'),
      'forex_accounts', jsonb_array_length(v_data->'forex_accounts'),
      'forex_cash_transactions', jsonb_array_length(v_data->'forex_cash_transactions')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb) TO authenticated;

-- Error contract:
--   MFB01  unauthenticated
--   MFB02  invalid / incomplete V2 backup
--   MFB03  unsupported backup version
--   MFB04  legacy pf_* backup intentionally rejected as incomplete
