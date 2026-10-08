-- ============================================================================
-- AI-PENDING-ACTION-ATOMIC-EXECUTION-1
--
-- Close the crash window between:
--   pending -> executing -> finance mutation -> completed
--
-- The pending-action row lock, finance mutation, execution receipt, and AI
-- action audit now commit (or roll back) as one PostgreSQL transaction.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.ai_pending_actions') IS NULL THEN
    RAISE EXCEPTION
      'AI-PENDING-ACTION-ATOMIC-EXECUTION-1 requires public.ai_pending_actions';
  END IF;

  IF to_regprocedure('public.current_finance_write_owner_user_id()') IS NULL THEN
    RAISE EXCEPTION
      'AI-PENDING-ACTION-ATOMIC-EXECUTION-1 requires household finance ownership helpers';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.execute_ai_pending_action_atomic(
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_finance_owner_user_id uuid;
  v_action public.ai_pending_actions%ROWTYPE;
  v_budget public.budgets%ROWTYPE;
  v_goal public.goals%ROWTYPE;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_error_message text;
  v_error_code text;
  v_category_id text;
  v_month text;
  v_budget_id text;
  v_goal_name text;
  v_limit_amount numeric;
  v_target_amount numeric;
  v_current_amount numeric;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MPA01';
  END IF;

  -- Serialize every confirmation/retry for this actor/action. A second request
  -- waits for the first transaction and then observes its final committed
  -- status; it never runs the finance mutation concurrently.
  SELECT *
  INTO v_action
  FROM public.ai_pending_actions
  WHERE id = p_action_id
    AND user_id = v_actor_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not_found',
      'action', NULL
    );
  END IF;

  -- Idempotent replay after a committed success.
  IF v_action.status = 'completed' THEN
    RETURN jsonb_build_object(
      'outcome', 'completed',
      'action', to_jsonb(v_action)
    );
  END IF;

  -- Stable terminal states are never re-executed.
  IF v_action.status IN ('cancelled', 'expired', 'failed') THEN
    RETURN jsonb_build_object(
      'outcome', v_action.status,
      'action', to_jsonb(v_action)
    );
  END IF;

  -- Legacy recovery only when durable execution evidence already exists.
  -- An old `executing` row with no evidence remains fail-closed because retrying
  -- it could duplicate a mutation that committed before the old process died.
  IF v_action.status IN ('executing', 'confirmed') THEN
    IF v_action.executed_at IS NULL AND v_action.result IS NULL THEN
      RETURN jsonb_build_object(
        'outcome', 'in_progress',
        'action', to_jsonb(v_action)
      );
    END IF;

    UPDATE public.ai_pending_actions
    SET
      status = 'completed',
      error_message = NULL,
      executed_at = COALESCE(executed_at, v_now),
      updated_at = v_now
    WHERE id = v_action.id
      AND user_id = v_actor_user_id
    RETURNING * INTO v_action;

    INSERT INTO public.ai_action_audit_logs (
      user_id,
      pending_action_id,
      conversation_id,
      tool_name,
      status,
      old_value,
      new_value,
      result,
      error_message
    )
    VALUES (
      v_actor_user_id,
      v_action.id,
      v_action.conversation_id,
      v_action.tool_name,
      'completed',
      v_action.old_value,
      v_action.new_value,
      v_action.result,
      NULL
    );

    RETURN jsonb_build_object(
      'outcome', 'completed',
      'action', to_jsonb(v_action)
    );
  END IF;

  IF v_action.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'outcome', 'in_progress',
      'action', to_jsonb(v_action)
    );
  END IF;

  IF v_action.expires_at <= v_now THEN
    UPDATE public.ai_pending_actions
    SET
      status = 'expired',
      error_message = NULL,
      updated_at = v_now
    WHERE id = v_action.id
      AND user_id = v_actor_user_id
    RETURNING * INTO v_action;

    INSERT INTO public.ai_action_audit_logs (
      user_id,
      pending_action_id,
      conversation_id,
      tool_name,
      status,
      old_value,
      new_value,
      result,
      error_message
    )
    VALUES (
      v_actor_user_id,
      v_action.id,
      v_action.conversation_id,
      v_action.tool_name,
      'expired',
      v_action.old_value,
      v_action.new_value,
      NULL,
      NULL
    );

    RETURN jsonb_build_object(
      'outcome', 'expired',
      'action', to_jsonb(v_action)
    );
  END IF;

  -- Finance rows are household-scoped to the stable owner identity while
  -- confirmed_by / AI audit retain the authenticated actor identity.
  v_finance_owner_user_id := public.current_finance_write_owner_user_id();

  IF v_finance_owner_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'forbidden',
      'action', to_jsonb(v_action)
    );
  END IF;

  UPDATE public.ai_pending_actions
  SET
    status = 'executing',
    confirmed_at = COALESCE(confirmed_at, v_now),
    confirmed_by = v_actor_user_id,
    error_message = NULL,
    updated_at = v_now
  WHERE id = v_action.id
    AND user_id = v_actor_user_id
  RETURNING * INTO v_action;

  -- PL/pgSQL exception blocks are subtransactions. If the finance mutation
  -- throws, every statement in this block is rolled back before we persist the
  -- failed action receipt below. No partial finance mutation can survive.
  BEGIN
    CASE v_action.tool_name
      WHEN 'create_budget' THEN
        v_category_id := trim(COALESCE(v_action.arguments ->> 'categoryId', ''));
        v_month := trim(COALESCE(v_action.arguments ->> 'month', ''));
        v_limit_amount := (v_action.arguments ->> 'limitAmount')::numeric;

        IF v_category_id = ''
           OR v_month !~ '^[0-9]{4}-[0-9]{2}$'
           OR v_limit_amount IS NULL
           OR v_limit_amount <= 0
           OR v_limit_amount = 'NaN'::numeric THEN
          RAISE EXCEPTION 'Invalid create_budget arguments'
            USING ERRCODE = 'MPA05';
        END IF;

        INSERT INTO public.budgets (
          id,
          user_id,
          "categoryId",
          month,
          "limitAmount"
        )
        VALUES (
          gen_random_uuid()::text,
          v_finance_owner_user_id,
          v_category_id,
          v_month,
          v_limit_amount
        )
        RETURNING * INTO v_budget;

        v_result := to_jsonb(v_budget);

      WHEN 'update_budget' THEN
        v_budget_id := trim(COALESCE(v_action.arguments ->> 'budgetId', ''));
        v_limit_amount := (v_action.arguments ->> 'limitAmount')::numeric;

        IF v_budget_id = ''
           OR v_limit_amount IS NULL
           OR v_limit_amount <= 0
           OR v_limit_amount = 'NaN'::numeric THEN
          RAISE EXCEPTION 'Invalid update_budget arguments'
            USING ERRCODE = 'MPA05';
        END IF;

        UPDATE public.budgets
        SET "limitAmount" = v_limit_amount
        WHERE id = v_budget_id
          AND user_id = v_finance_owner_user_id
        RETURNING * INTO v_budget;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Budget not found'
            USING ERRCODE = 'MPA06';
        END IF;

        v_result := to_jsonb(v_budget);

      WHEN 'create_goal' THEN
        v_goal_name := trim(COALESCE(v_action.arguments ->> 'name', ''));
        v_target_amount := (v_action.arguments ->> 'targetAmount')::numeric;
        v_current_amount := COALESCE(
          (v_action.arguments ->> 'currentAmount')::numeric,
          0
        );

        IF v_goal_name = ''
           OR v_target_amount IS NULL
           OR v_target_amount <= 0
           OR v_target_amount = 'NaN'::numeric
           OR v_current_amount < 0
           OR v_current_amount = 'NaN'::numeric THEN
          RAISE EXCEPTION 'Invalid create_goal arguments'
            USING ERRCODE = 'MPA05';
        END IF;

        INSERT INTO public.goals (
          id,
          user_id,
          name,
          "targetAmount",
          "currentAmount"
        )
        VALUES (
          gen_random_uuid()::text,
          v_finance_owner_user_id,
          v_goal_name,
          v_target_amount,
          v_current_amount
        )
        RETURNING * INTO v_goal;

        v_result := to_jsonb(v_goal);

      ELSE
        RAISE EXCEPTION 'Unsupported AI write tool: %', v_action.tool_name
          USING ERRCODE = 'MPA04';
    END CASE;

  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_error_message = MESSAGE_TEXT,
        v_error_code = RETURNED_SQLSTATE;

      UPDATE public.ai_pending_actions
      SET
        status = 'failed',
        result = NULL,
        error_message = v_error_message,
        updated_at = clock_timestamp()
      WHERE id = v_action.id
        AND user_id = v_actor_user_id
      RETURNING * INTO v_action;

      INSERT INTO public.ai_action_audit_logs (
        user_id,
        pending_action_id,
        conversation_id,
        tool_name,
        status,
        old_value,
        new_value,
        result,
        error_message
      )
      VALUES (
        v_actor_user_id,
        v_action.id,
        v_action.conversation_id,
        v_action.tool_name,
        'failed',
        v_action.old_value,
        v_action.new_value,
        NULL,
        v_error_message
      );

      RETURN jsonb_build_object(
        'outcome', 'failed',
        'action', to_jsonb(v_action),
        'error_code', v_error_code
      );
  END;

  -- Finance mutation + completion receipt + AI audit are still inside this one
  -- outer function transaction. Any failure below rolls back the finance row.
  UPDATE public.ai_pending_actions
  SET
    status = 'completed',
    result = v_result,
    error_message = NULL,
    executed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = v_action.id
    AND user_id = v_actor_user_id
  RETURNING * INTO v_action;

  INSERT INTO public.ai_action_audit_logs (
    user_id,
    pending_action_id,
    conversation_id,
    tool_name,
    status,
    old_value,
    new_value,
    result,
    error_message
  )
  VALUES (
    v_actor_user_id,
    v_action.id,
    v_action.conversation_id,
    v_action.tool_name,
    'completed',
    v_action.old_value,
    v_action.new_value,
    v_action.result,
    NULL
  );

  RETURN jsonb_build_object(
    'outcome', 'completed',
    'action', to_jsonb(v_action)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_ai_pending_action_atomic(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_ai_pending_action_atomic(uuid)
  TO authenticated;