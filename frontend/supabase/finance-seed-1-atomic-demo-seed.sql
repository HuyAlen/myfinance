-- ═════════════════════════════════════════════════════════════════════════════
-- FINANCE-SEED-1 — Fail-Closed Atomic Demo Seed Integrity
--
-- Replaces the browser-side "SELECT wallets, then many independent UPSERTs"
-- bootstrap with one server-authoritative transaction.
--
-- Correctness invariants:
--   • no client read decides whether the account is seed-eligible;
--   • all concurrent seed calls for one user serialize;
--   • the check-and-seed window freezes writes to all persisted finance domains;
--   • existing user finance data is never replaced by auto-seed;
--   • the ONLY tolerated pre-existing rows are the exact untouched category
--     baseline created automatically by seed_default_categories() on signup;
--   • any malformed payload, RLS failure, FK/CHECK failure, or restore error
--     rolls the whole seed back;
--   • the actual replacement remains SSOT in restore_finance_backup(jsonb).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- FINANCE-SEED-1 CANONICAL BLOCK START
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
  IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id)
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

  -- FINANCE-DATA-2 validates the V2 envelope and all mandatory arrays before
  -- its first destructive write. Nested in this same transaction, any later
  -- error rolls back every seeded domain together.
  PERFORM public.restore_finance_backup(p_seed);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_demo_data(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_demo_data(jsonb) TO authenticated;
-- FINANCE-SEED-1 CANONICAL BLOCK END

COMMIT;
