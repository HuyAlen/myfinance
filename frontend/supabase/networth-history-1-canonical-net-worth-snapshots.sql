-- NETWORTH-HISTORY-1 — Canonical Net Worth Historical Snapshots
--
-- Introduces persisted monthly Net Worth snapshots as the historical SSOT.
-- Current-state finance mutations update only the current month. Historical
-- months are never reconstructed from today's balances or transaction deltas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_month   date          NOT NULL,
  cash_and_wallets numeric       NOT NULL DEFAULT 0,
  savings          numeric       NOT NULL DEFAULT 0,
  investments      numeric       NOT NULL DEFAULT 0,
  forex            numeric       NOT NULL DEFAULT 0,
  total_assets     numeric       NOT NULL DEFAULT 0,
  total_debt       numeric       NOT NULL DEFAULT 0,
  net_worth        numeric       NOT NULL DEFAULT 0,
  captured_at      timestamptz   NOT NULL DEFAULT now(),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT net_worth_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT net_worth_snapshots_user_month_key UNIQUE (user_id, snapshot_month),
  CONSTRAINT net_worth_snapshots_month_bucket_check CHECK (
    snapshot_month = date_trunc('month', snapshot_month)::date
  )
);

CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_month_idx
  ON public.net_worth_snapshots (user_id, snapshot_month);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS net_worth_snapshots_select ON public.net_worth_snapshots;
CREATE POLICY net_worth_snapshots_select ON public.net_worth_snapshots
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Snapshot rows are DB-maintained. Authenticated clients may read them but
-- cannot provide arbitrary component values through direct table writes.
REVOKE ALL ON TABLE public.net_worth_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.net_worth_snapshots TO authenticated;

DROP TRIGGER IF EXISTS trg_net_worth_snapshots_updated_at ON public.net_worth_snapshots;
CREATE TRIGGER trg_net_worth_snapshots_updated_at
BEFORE UPDATE ON public.net_worth_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.capture_current_net_worth_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_user_id uuid := auth.uid();
  v_snapshot_month date := date_trunc('month', current_date)::date;
  v_cash_and_wallets numeric := 0;
  v_savings numeric := 0;
  v_investments numeric := 0;
  v_forex numeric := 0;
  v_total_debt numeric := 0;
  v_total_assets numeric := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Direct authenticated calls are limited to the caller's own account.
  -- Migration/trigger execution may have no auth.uid(), which is allowed.
  IF v_request_user_id IS NOT NULL AND v_request_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot capture Net Worth for another user'
      USING ERRCODE = 'MFW01';
  END IF;

  SELECT COALESCE(sum(w.balance), 0)
  INTO v_cash_and_wallets
  FROM public.wallets w
  WHERE w.user_id = p_user_id;

  SELECT COALESCE(sum(s.balance), 0)
  INTO v_savings
  FROM public.savings s
  WHERE s.user_id = p_user_id;

  SELECT COALESCE(sum(i."currentValue"), 0)
  INTO v_investments
  FROM public.investments i
  WHERE i.user_id = p_user_id;

  SELECT COALESCE(sum(d."remainingAmount"), 0)
  INTO v_total_debt
  FROM public.debts d
  WHERE d.user_id = p_user_id;

  -- Contract-equivalent to getForexAssetValue(): each account contributes
  -- current_equity when present; otherwise that account's net capital:
  -- deposits - withdrawals - all non-negative fees.
  SELECT COALESCE(sum(
    CASE
      WHEN fa.current_equity IS NOT NULL THEN fa.current_equity
      ELSE COALESCE((
        SELECT sum(
          CASE
            WHEN fct.type = 'deposit' THEN fct.amount
            WHEN fct.type = 'withdrawal' THEN -fct.amount
            ELSE 0
          END - GREATEST(COALESCE(fct.fee, 0), 0)
        )
        FROM public.forex_cash_transactions fct
        WHERE fct.user_id = p_user_id
          AND fct.forex_account_id = fa.id
      ), 0)
    END
  ), 0)
  INTO v_forex
  FROM public.forex_accounts fa
  WHERE fa.user_id = p_user_id;

  v_total_assets := v_cash_and_wallets + v_savings + v_investments + v_forex;

  INSERT INTO public.net_worth_snapshots (
    user_id,
    snapshot_month,
    cash_and_wallets,
    savings,
    investments,
    forex,
    total_assets,
    total_debt,
    net_worth,
    captured_at
  ) VALUES (
    p_user_id,
    v_snapshot_month,
    v_cash_and_wallets,
    v_savings,
    v_investments,
    v_forex,
    v_total_assets,
    v_total_debt,
    v_total_assets - v_total_debt,
    now()
  )
  ON CONFLICT (user_id, snapshot_month) DO UPDATE SET
    cash_and_wallets = EXCLUDED.cash_and_wallets,
    savings = EXCLUDED.savings,
    investments = EXCLUDED.investments,
    forex = EXCLUDED.forex,
    total_assets = EXCLUDED.total_assets,
    total_debt = EXCLUDED.total_debt,
    net_worth = EXCLUDED.net_worth,
    captured_at = EXCLUDED.captured_at,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.capture_current_net_worth_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_net_worth_snapshot_from_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  PERFORM public.capture_current_net_worth_snapshot(v_user_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_net_worth_snapshot_from_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wallets_capture_net_worth ON public.wallets;
CREATE TRIGGER trg_wallets_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

DROP TRIGGER IF EXISTS trg_savings_capture_net_worth ON public.savings;
CREATE TRIGGER trg_savings_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.savings
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

DROP TRIGGER IF EXISTS trg_investments_capture_net_worth ON public.investments;
CREATE TRIGGER trg_investments_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.investments
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

DROP TRIGGER IF EXISTS trg_debts_capture_net_worth ON public.debts;
CREATE TRIGGER trg_debts_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.debts
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

DROP TRIGGER IF EXISTS trg_forex_accounts_capture_net_worth ON public.forex_accounts;
CREATE TRIGGER trg_forex_accounts_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.forex_accounts
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

DROP TRIGGER IF EXISTS trg_forex_cash_transactions_capture_net_worth ON public.forex_cash_transactions;
CREATE TRIGGER trg_forex_cash_transactions_capture_net_worth
AFTER INSERT OR UPDATE OR DELETE ON public.forex_cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_net_worth_snapshot_from_change();

-- One truthful baseline for existing users. No earlier month is synthesized.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM (
      SELECT user_id FROM public.wallets
      UNION ALL SELECT user_id FROM public.savings
      UNION ALL SELECT user_id FROM public.investments
      UNION ALL SELECT user_id FROM public.debts
      UNION ALL SELECT user_id FROM public.forex_accounts
      UNION ALL SELECT user_id FROM public.forex_cash_transactions
    ) source_users
    WHERE user_id IS NOT NULL
  LOOP
    PERFORM public.capture_current_net_worth_snapshot(r.user_id);
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- Backup V3: history is persisted user finance data.
-- --------------------------------------------------------------------------
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
    'version', 3,
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
  v_required_domains text[];
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
  IF v_version NOT IN (2, 3) THEN
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
    ELSE v_required_domains_v3
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

  -- V2 is intentionally normalized to an empty snapshot collection. After the
  -- finance state is restored, one current-month baseline is captured.
  IF v_version = 2 THEN
    v_data := v_data || jsonb_build_object('net_worth_snapshots', '[]'::jsonb);
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

  -- Full type preflight before any destructive write.
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

  -- Child/ledger rows first. Snapshot triggers may upsert a temporary current
  -- row while state is replaced; final snapshot replacement below is authoritative.
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

  -- Snapshot history is restored raw, never reconstructed from transaction
  -- history. Intermediate rows produced by source-table triggers are removed.
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

  RETURN jsonb_build_object(
    'restored', true,
    'source_version', v_version,
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
      'forex_cash_transactions', jsonb_array_length(v_data->'forex_cash_transactions'),
      'net_worth_snapshots', jsonb_array_length(v_data->'net_worth_snapshots')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb) TO authenticated;

-- --------------------------------------------------------------------------
-- Demo seed fail-closed: snapshot history proves prior finance usage.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_finance_demo_data(p_seed jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_category_count bigint;
  v_default_category_shape_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'MFD01';
  END IF;

  -- Serialize competing first-login/page-mount seed calls for this user.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('myfinance-demo-seed:' || v_user_id::text, 0)
  );

  -- Auto-seed is a rare first-login operation. Freeze the complete finance
  -- write surface for the short authoritative check + atomic restore window.
  LOCK TABLE
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
    public.investments
  IN SHARE ROW EXCLUSIVE MODE;

  -- Any persisted finance row outside Categories proves that this is not a
  -- pristine first-login bootstrap. Fail closed and preserve the user's data.
  IF EXISTS (SELECT 1 FROM public.net_worth_snapshots WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.debts WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.goals WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.budgets WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.investments WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.savings WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.saving_transactions WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.forex_accounts WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.forex_cash_transactions WHERE user_id = v_user_id)
  THEN
    RETURN false;
  END IF;

  -- DB-SSOT-1 creates 15 default categories synchronously from the auth.users
  -- signup trigger. Those rows are bootstrap scaffolding, not user-entered
  -- finance data. Preserve historical first-login demo behavior ONLY when the
  -- Categories table is either empty or is exactly that untouched baseline.
  SELECT count(*)
  INTO v_category_count
  FROM public.categories
  WHERE user_id = v_user_id;

  IF v_category_count > 0 THEN
    IF v_category_count <> 15 THEN
      RETURN false;
    END IF;

    -- Every row must match one canonical signup tuple and remain untouched in
    -- every mutable/default field. A renamed, reclassified, recurring, or
    -- otherwise edited category makes the account ineligible for auto-seed.
    IF EXISTS (
      SELECT 1
      FROM public.categories c
      WHERE c.user_id = v_user_id
        AND (
          c.financial_group IS NOT NULL
          OR c.is_recurring IS DISTINCT FROM false
          OR c.recurrence IS NOT NULL
          OR c.default_amount IS NOT NULL
          OR c.default_wallet_id IS NOT NULL
          OR c.next_run_date IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM (
              VALUES
                ('Lương',         'income',  'income'),
                ('Thưởng',        'income',  'income'),
                ('Freelance',      'income',  'income'),
                ('Đầu tư',        'income',  'income'),
                ('Thu nhập khác', 'income',  'income'),
                ('Ăn uống',       'expense', 'variable'),
                ('Nhà ở',         'expense', 'fixed'),
                ('Di chuyển',     'expense', 'variable'),
                ('Mua sắm',       'expense', 'variable'),
                ('Sức khỏe',      'expense', 'variable'),
                ('Giáo dục',      'expense', 'fixed'),
                ('Giải trí',      'expense', 'variable'),
                ('Hóa đơn & phí', 'expense', 'fixed'),
                ('Tiết kiệm',     'expense', 'saving'),
                ('Khác',          'expense', 'variable')
            ) AS expected(name, type, planning_group)
            WHERE expected.name = c.name
              AND expected.type = c.type::text
              AND expected.planning_group IS NOT DISTINCT FROM c.planning_group
          )
        )
    ) THEN
      RETURN false;
    END IF;

    -- Count alone plus "each row is allowed" would still permit duplicates
    -- replacing a missing default tuple. Require all 15 canonical shapes.
    SELECT count(
      DISTINCT (c.name, c.type::text, c.planning_group)
    )
    INTO v_default_category_shape_count
    FROM public.categories c
    WHERE c.user_id = v_user_id;

    IF v_default_category_shape_count <> 15 THEN
      RETURN false;
    END IF;
  END IF;

  -- NETWORTH-HISTORY-1/FINANCE-DATA-2 validates the versioned envelope and all mandatory arrays before
  -- its first destructive write. Nested in this same transaction, any later
  -- error rolls back every seeded domain together.
  PERFORM public.restore_finance_backup(p_seed);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_demo_data(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_demo_data(jsonb) TO authenticated;

COMMIT;
