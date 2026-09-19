-- FOREX-BALANCE-ASOF-CROSSPAGE-1
-- Preserve trusted Forex Balance history across Settings backup/restore while
-- keeping V2/V3 backups restorable without inventing historical observations.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.forex_balance_snapshots') IS NULL THEN
    RAISE EXCEPTION 'FOREX-BALANCE-ASOF-1B must be applied before cross-page backup adoption.';
  END IF;
END;
$$;

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

  RETURN jsonb_build_object(
    'format', 'myfinance-backup',
    'version', 4,
    'exported_at', now(),
    'data', jsonb_build_object(
      'wallets', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.wallets r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.categories r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.transactions r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'debts', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.debts r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'goals', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.goals r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'budgets', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.budgets r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'investments', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.investments r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'savings', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.savings r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'saving_transactions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.saving_transactions r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'forex_accounts', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.forex_accounts r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'forex_cash_transactions', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'user_id') FROM public.forex_cash_transactions r WHERE r.user_id = v_user_id), '[]'::jsonb),
      'net_worth_snapshots', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) - 'user_id' ORDER BY r.snapshot_month)
        FROM public.net_worth_snapshots r
        WHERE r.user_id = v_user_id
      ), '[]'::jsonb),
      'forex_balance_snapshots', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) - 'user_id' ORDER BY r.captured_at, r.id)
        FROM public.forex_balance_snapshots r
        WHERE r.user_id = v_user_id
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_finance_backup(p_backup jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_restore_data jsonb;
  v_domain text;
  v_exported_at timestamptz;
  v_version integer;
  v_required_domains_v2 constant text[] := ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions'
  ];
  v_required_domains_v3 constant text[] := ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'net_worth_snapshots'
  ];
  v_required_domains_v4 constant text[] := ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'net_worth_snapshots','forex_balance_snapshots'
  ];
  v_required_domains text[];
  v_source_counts jsonb;
  v_expected_counts jsonb;
  v_actual_counts jsonb;
  v_expected_snapshot_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;

  IF p_backup IS NULL OR jsonb_typeof(p_backup) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup envelope' USING ERRCODE = 'MFB02';
  END IF;

  IF p_backup ?| ARRAY['pf_wallets','pf_categories','pf_transactions','pf_debts','pf_goals','pf_budgets','pf_investments'] THEN
    RAISE EXCEPTION 'Legacy incomplete backup is not restorable safely' USING ERRCODE = 'MFB04';
  END IF;

  IF p_backup->>'format' IS DISTINCT FROM 'myfinance-backup' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup format' USING ERRCODE = 'MFB02';
  END IF;

  IF jsonb_typeof(p_backup->'version') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Backup version is missing or invalid' USING ERRCODE = 'MFB02';
  END IF;

  v_version := (p_backup->>'version')::integer;
  IF v_version NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Unsupported MyFinance backup version: %', p_backup->>'version' USING ERRCODE = 'MFB03';
  END IF;

  IF jsonb_typeof(p_backup->'exported_at') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Backup exported_at is missing or invalid' USING ERRCODE = 'MFB02';
  END IF;

  BEGIN
    v_exported_at := (p_backup->>'exported_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Backup exported_at is not a valid timestamp' USING ERRCODE = 'MFB02';
  END;

  v_data := p_backup->'data';
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Backup data object is missing' USING ERRCODE = 'MFB02';
  END IF;

  v_required_domains := CASE
    WHEN v_version = 2 THEN v_required_domains_v2
    WHEN v_version = 3 THEN v_required_domains_v3
    ELSE v_required_domains_v4
  END;

  FOREACH v_domain IN ARRAY v_required_domains
  LOOP
    IF NOT (v_data ? v_domain) OR jsonb_typeof(v_data->v_domain) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Backup domain % is missing or is not an array', v_domain USING ERRCODE = 'MFB02';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_data->v_domain) item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
    ) THEN
      RAISE EXCEPTION 'Backup domain % contains a non-object row', v_domain USING ERRCODE = 'MFB02';
    END IF;
  END LOOP;

  IF v_version = 2 THEN
    v_data := v_data || jsonb_build_object(
      'net_worth_snapshots', '[]'::jsonb,
      'forex_balance_snapshots', '[]'::jsonb
    );
  ELSIF v_version = 3 THEN
    v_data := v_data || jsonb_build_object(
      'forex_balance_snapshots', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_object_agg(
    domain.key,
    COALESCE((
      SELECT jsonb_agg(item.value || jsonb_build_object('user_id', v_user_id))
      FROM jsonb_array_elements(domain.value) item(value)
    ), '[]'::jsonb)
  )
  INTO v_restore_data
  FROM jsonb_each(v_data) domain(key, value);

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
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.net_worth_snapshots, v_restore_data->'net_worth_snapshots');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.forex_balance_snapshots, v_restore_data->'forex_balance_snapshots');

  v_source_counts := jsonb_build_object(
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
    'forex_cash_transactions', jsonb_array_length(v_data->'forex_cash_transactions'),
    'net_worth_snapshots', jsonb_array_length(v_data->'net_worth_snapshots'),
    'forex_balance_snapshots', jsonb_array_length(v_data->'forex_balance_snapshots')
  );

  LOCK TABLE
    public.forex_balance_snapshots,
    public.saving_transactions,
    public.forex_cash_transactions,
    public.transactions,
    public.budgets,
    public.categories,
    public.savings,
    public.forex_accounts,
    public.wallets,
    public.debts,
    public.goals,
    public.investments,
    public.net_worth_snapshots
  IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.forex_balance_snapshots WHERE user_id = v_user_id;
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

  INSERT INTO public.wallets SELECT * FROM jsonb_populate_recordset(NULL::public.wallets, v_restore_data->'wallets');
  INSERT INTO public.categories SELECT * FROM jsonb_populate_recordset(NULL::public.categories, v_restore_data->'categories');
  INSERT INTO public.debts SELECT * FROM jsonb_populate_recordset(NULL::public.debts, v_restore_data->'debts');
  INSERT INTO public.goals SELECT * FROM jsonb_populate_recordset(NULL::public.goals, v_restore_data->'goals');
  INSERT INTO public.budgets SELECT * FROM jsonb_populate_recordset(NULL::public.budgets, v_restore_data->'budgets');
  INSERT INTO public.investments SELECT * FROM jsonb_populate_recordset(NULL::public.investments, v_restore_data->'investments');
  INSERT INTO public.forex_accounts SELECT * FROM jsonb_populate_recordset(NULL::public.forex_accounts, v_restore_data->'forex_accounts');
  INSERT INTO public.savings SELECT * FROM jsonb_populate_recordset(NULL::public.savings, v_restore_data->'savings');
  INSERT INTO public.transactions SELECT * FROM jsonb_populate_recordset(NULL::public.transactions, v_restore_data->'transactions');
  INSERT INTO public.saving_transactions SELECT * FROM jsonb_populate_recordset(NULL::public.saving_transactions, v_restore_data->'saving_transactions');
  INSERT INTO public.forex_cash_transactions SELECT * FROM jsonb_populate_recordset(NULL::public.forex_cash_transactions, v_restore_data->'forex_cash_transactions');
  INSERT INTO public.forex_balance_snapshots
    SELECT * FROM jsonb_populate_recordset(NULL::public.forex_balance_snapshots, v_restore_data->'forex_balance_snapshots');

  DELETE FROM public.net_worth_snapshots WHERE user_id = v_user_id;
  INSERT INTO public.net_worth_snapshots
    SELECT * FROM jsonb_populate_recordset(NULL::public.net_worth_snapshots, v_restore_data->'net_worth_snapshots');

  IF NOT EXISTS (SELECT 1 FROM public.net_worth_snapshots WHERE user_id = v_user_id)
     AND (
       EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.savings WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.investments WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.debts WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.forex_accounts WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.forex_cash_transactions WHERE user_id = v_user_id)
     )
  THEN
    PERFORM public.capture_current_net_worth_snapshot(v_user_id);
  END IF;

  v_expected_snapshot_count := (v_source_counts->>'net_worth_snapshots')::bigint;
  IF v_expected_snapshot_count = 0
     AND (
       EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.savings WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.investments WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.debts WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.forex_accounts WHERE user_id = v_user_id)
       OR EXISTS (SELECT 1 FROM public.forex_cash_transactions WHERE user_id = v_user_id)
     )
  THEN
    v_expected_snapshot_count := 1;
  END IF;

  v_expected_counts := v_source_counts || jsonb_build_object(
    'net_worth_snapshots', v_expected_snapshot_count
  );

  SELECT jsonb_build_object(
    'wallets', (SELECT count(*) FROM public.wallets WHERE user_id = v_user_id),
    'categories', (SELECT count(*) FROM public.categories WHERE user_id = v_user_id),
    'transactions', (SELECT count(*) FROM public.transactions WHERE user_id = v_user_id),
    'debts', (SELECT count(*) FROM public.debts WHERE user_id = v_user_id),
    'goals', (SELECT count(*) FROM public.goals WHERE user_id = v_user_id),
    'budgets', (SELECT count(*) FROM public.budgets WHERE user_id = v_user_id),
    'investments', (SELECT count(*) FROM public.investments WHERE user_id = v_user_id),
    'savings', (SELECT count(*) FROM public.savings WHERE user_id = v_user_id),
    'saving_transactions', (SELECT count(*) FROM public.saving_transactions WHERE user_id = v_user_id),
    'forex_accounts', (SELECT count(*) FROM public.forex_accounts WHERE user_id = v_user_id),
    'forex_cash_transactions', (SELECT count(*) FROM public.forex_cash_transactions WHERE user_id = v_user_id),
    'net_worth_snapshots', (SELECT count(*) FROM public.net_worth_snapshots WHERE user_id = v_user_id),
    'forex_balance_snapshots', (SELECT count(*) FROM public.forex_balance_snapshots WHERE user_id = v_user_id)
  )
  INTO v_actual_counts;

  IF v_actual_counts IS DISTINCT FROM v_expected_counts THEN
    RAISE EXCEPTION 'Restore verification failed. expected=%, actual=%',
      v_expected_counts, v_actual_counts
      USING ERRCODE = 'MFB05';
  END IF;

  RETURN jsonb_build_object(
    'restored', true,
    'verified', true,
    'source_version', v_version,
    'source_exported_at', v_exported_at,
    'source_counts', v_source_counts,
    'counts', v_actual_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb) TO authenticated;

COMMIT;
