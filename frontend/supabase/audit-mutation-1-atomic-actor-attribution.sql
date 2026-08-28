-- AUDIT-MUTATION-1 - Atomic Actor Attribution Across Finance Mutations
-- Forward migration for a database that already has HOUSEHOLD-IDENTITY-1 and
-- AUDIT-TRAIL-1. This ticket activates row-level audit capture across every
-- persisted finance mutation table. Audit capture runs synchronously in the
-- same PostgreSQL transaction as the business mutation, so an audit failure
-- aborts the original write instead of allowing unaudited state to commit.

BEGIN;

-- BEGIN AUDIT-MUTATION-1 SHARED BODY

-- Default categories are system bootstrap scaffolding, not a user finance
-- mutation. The auth.users signup trigger can execute without an authenticated
-- JWT, so mark only this private bootstrap path with a transaction-local audit
-- mode. All other unauthenticated finance writes remain fail-closed.
CREATE OR REPLACE FUNCTION public.seed_default_categories_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_audit_mode text := current_setting('myfinance.audit_mode', true);
BEGIN
  IF p_user_id IS NULL
     OR EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  PERFORM set_config(
    'myfinance.audit_mode',
    'bootstrap_default_categories',
    true
  );

  INSERT INTO public.categories (id, user_id, name, type, planning_group)
  VALUES
    (gen_random_uuid()::text, p_user_id, 'Lương',          'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Thưởng',        'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Freelance',     'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Đầu tư',        'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Thu nhập khác', 'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Ăn uống',       'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Nhà ở',         'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Di chuyển',     'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Mua sắm',       'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Sức khỏe',      'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Giáo dục',      'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Giải trí',      'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Hóa đơn & phí', 'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Tiết kiệm',     'expense', 'saving'),
    (gen_random_uuid()::text, p_user_id, 'Khác',          'expense', 'variable');

  PERFORM set_config(
    'myfinance.audit_mode',
    COALESCE(v_previous_audit_mode, ''),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_categories_for_user(uuid)
  FROM PUBLIC, anon, authenticated;

-- Harden the reusable AUDIT-TRAIL-1 trigger primitive before attaching it.
-- The row's stable finance owner must match the authenticated actor's current
-- household finance scope. This prevents a privileged/incorrect mutation path
-- from writing another household's row and then stamping it as the actor's
-- household in the audit log.
CREATE OR REPLACE FUNCTION public.capture_finance_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
  v_row_user_id uuid;
  v_finance_owner_user_id uuid;
  v_audit_mode text := current_setting('myfinance.audit_mode', true);
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR NOT (
       TG_TABLE_NAME = ANY (ARRAY[
         'wallets','categories','transactions','debts','goals','budgets','investments',
         'savings','saving_transactions','forex_accounts','forex_cash_transactions'
       ])
     ) THEN
    RAISE EXCEPTION 'Unsupported finance audit source table: %.%',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'MFA04';
  END IF;

  -- The only intentional non-audited write is the private default-category
  -- bootstrap path above. Never allow this transaction-local mode to suppress
  -- any other table or operation.
  IF v_audit_mode = 'bootstrap_default_categories' THEN
    IF TG_TABLE_NAME <> 'categories' OR TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'Invalid finance audit suppression scope'
        USING ERRCODE = 'MFA07';
    END IF;
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Finance mutation audit requires an authenticated actor'
      USING ERRCODE = 'MFA01';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSE
    RAISE EXCEPTION 'Unsupported finance audit operation: %', TG_OP
      USING ERRCODE = 'MFA05';
  END IF;

  v_entity_id := COALESCE(v_after->>'id', v_before->>'id');
  v_row_user_id := NULLIF(
    COALESCE(v_after->>'user_id', v_before->>'user_id'),
    ''
  )::uuid;
  v_finance_owner_user_id := public.current_finance_scope_owner_user_id();

  IF v_row_user_id IS NULL
     OR v_finance_owner_user_id IS NULL
     OR v_row_user_id IS DISTINCT FROM v_finance_owner_user_id THEN
    RAISE EXCEPTION 'Finance mutation row is outside the actor household scope'
      USING ERRCODE = 'MFA06';
  END IF;

  INSERT INTO public.finance_audit_log (
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    metadata
  )
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    lower(TG_OP),
    v_before,
    v_after,
    jsonb_build_object(
      'source', 'row_trigger',
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_finance_audit_row()
  FROM PUBLIC, anon, authenticated;

-- Attach one AFTER ROW trigger to every persisted finance mutation table.
-- AFTER timing means before_data/after_data reflect the row that PostgreSQL
-- actually accepted. Trigger exceptions still abort the containing statement
-- and transaction, preserving mutation + audit atomicity.
DROP TRIGGER IF EXISTS trg_wallets_finance_audit ON public.wallets;
CREATE TRIGGER trg_wallets_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_categories_finance_audit ON public.categories;
CREATE TRIGGER trg_categories_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_transactions_finance_audit ON public.transactions;
CREATE TRIGGER trg_transactions_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_debts_finance_audit ON public.debts;
CREATE TRIGGER trg_debts_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.debts
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_goals_finance_audit ON public.goals;
CREATE TRIGGER trg_goals_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_budgets_finance_audit ON public.budgets;
CREATE TRIGGER trg_budgets_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_investments_finance_audit ON public.investments;
CREATE TRIGGER trg_investments_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.investments
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_savings_finance_audit ON public.savings;
CREATE TRIGGER trg_savings_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.savings
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_saving_transactions_finance_audit ON public.saving_transactions;
CREATE TRIGGER trg_saving_transactions_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.saving_transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_forex_accounts_finance_audit ON public.forex_accounts;
CREATE TRIGGER trg_forex_accounts_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.forex_accounts
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

DROP TRIGGER IF EXISTS trg_forex_cash_transactions_finance_audit ON public.forex_cash_transactions;
CREATE TRIGGER trg_forex_cash_transactions_finance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.forex_cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_finance_audit_row();

-- END AUDIT-MUTATION-1 SHARED BODY

COMMIT;
