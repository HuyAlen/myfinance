-- ============================================================================
-- CROSS-DOMAIN-INTEGRITY-1 — Atomic previous-month budget clone
--
-- The Budgets UI used to copy previous-month rows by issuing one client-side
-- INSERT per category. A failure after the first successful INSERT left the
-- target month only partially cloned. This RPC moves the whole clone into one
-- Postgres transaction and serializes concurrent budget writes while choosing
-- the source/target rows, so success means the clone is complete and any SQL
-- error rolls the entire operation back.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.clone_previous_month_budgets_atomic(
  p_target_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_date date;
  v_source_month text;
  v_source public.budgets%ROWTYPE;
  v_new_id public.budgets.id%TYPE;
  v_cloned integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFBG1';
  END IF;

  IF p_target_month IS NULL
     OR p_target_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Invalid target month' USING ERRCODE = 'MFBG2';
  END IF;

  v_target_date := to_date(p_target_month || '-01', 'YYYY-MM-DD');
  v_source_month := to_char(v_target_date - interval '1 month', 'YYYY-MM');

  -- Normal INSERT/UPDATE/DELETE obtains ROW EXCLUSIVE. SHARE ROW EXCLUSIVE
  -- conflicts with it, giving this low-frequency bulk clone a stable target
  -- snapshot and preventing a concurrent manual budget write from racing the
  -- NOT EXISTS check. RLS remains active because this is SECURITY INVOKER.
  LOCK TABLE public.budgets IN SHARE ROW EXCLUSIVE MODE;

  FOR v_source IN
    SELECT source_budget.*
    FROM public.budgets AS source_budget
    WHERE source_budget.user_id = v_user_id
      AND source_budget.month = v_source_month
      AND NOT EXISTS (
        SELECT 1
        FROM public.budgets AS target_budget
        WHERE target_budget.user_id = v_user_id
          AND target_budget.month = p_target_month
          AND target_budget."categoryId" = source_budget."categoryId"
      )
    ORDER BY source_budget.created_at, source_budget.id
  LOOP
    -- %TYPE keeps this assignment valid whether the canonical id column is
    -- text or uuid. PL/pgSQL applies the destination-column assignment cast.
    v_new_id := gen_random_uuid();

    INSERT INTO public.budgets (
      id,
      user_id,
      "categoryId",
      month,
      "limitAmount",
      "rolloverAmount"
    )
    VALUES (
      v_new_id,
      v_user_id,
      v_source."categoryId",
      p_target_month,
      v_source."limitAmount",
      0
    );

    v_cloned := v_cloned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'cloned', v_cloned,
    'source_month', v_source_month,
    'target_month', p_target_month,
    'verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clone_previous_month_budgets_atomic(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clone_previous_month_budgets_atomic(text)
  TO authenticated;

COMMIT;
