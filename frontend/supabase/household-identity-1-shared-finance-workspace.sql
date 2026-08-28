-- HOUSEHOLD-IDENTITY-1 — Shared Finance Workspace & Membership
-- Forward migration. Apply to the existing Supabase project; do not use as a
-- substitute for the canonical clean-install schema at /supabase/schema.sql.
--
-- Design note: existing finance rows keep their legacy user_id column as the
-- stable household finance-owner anchor. Members authenticate with distinct
-- auth.uid() values; future audit events can therefore attribute the real actor
-- without rewriting every historical finance row or weakening existing FKs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Household identity core
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL DEFAULT 'Gia đình MyFinance',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT households_name_nonempty CHECK (trim(name) <> '')
);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  CONSTRAINT household_members_role_check CHECK (role IN ('owner','member','viewer'))
);

CREATE TABLE IF NOT EXISTS public.household_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  role         text        NOT NULL DEFAULT 'member',
  status       text        NOT NULL DEFAULT 'pending',
  invited_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_invites_email_nonempty CHECK (trim(email) <> ''),
  CONSTRAINT household_invites_role_check CHECK (role IN ('member','viewer')),
  CONSTRAINT household_invites_status_check CHECK (status IN ('pending','accepted','revoked','expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS household_invites_one_pending_email_idx
  ON public.household_invites (household_id, lower(email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS household_members_user_idx
  ON public.household_members (user_id);
CREATE INDEX IF NOT EXISTS household_invites_email_status_idx
  ON public.household_invites (lower(email), status, expires_at DESC);

DROP TRIGGER IF EXISTS trg_households_updated_at ON public.households;
CREATE TRIGGER trg_households_updated_at
BEFORE UPDATE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_household_invites_updated_at ON public.household_invites;
CREATE TRIGGER trg_household_invites_updated_at
BEFORE UPDATE ON public.household_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT hm.household_id
  FROM public.household_members hm
  WHERE hm.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_household_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT hm.role
  FROM public.household_members hm
  WHERE hm.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_finance_scope_owner_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.owner_user_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_finance_write_owner_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.owner_user_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = auth.uid()
    AND hm.role IN ('owner','member')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_finance_admin_owner_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.owner_user_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = auth.uid()
    AND hm.role = 'owner'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_household_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_finance_write_owner_user_id() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.current_household_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_finance_admin_owner_user_id() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.current_household_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_household_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_scope_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_write_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_admin_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_household_can_write() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_household_is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_scope_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_write_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_admin_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_can_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_is_owner() TO authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap helpers and existing-user migration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_categories_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.categories (id, user_id, name, type, planning_group) VALUES
    (gen_random_uuid()::text, p_user_id, 'Lương',          'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Thưởng',         'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Freelance',       'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Đầu tư',         'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Thu nhập khác',  'income',  'income'),
    (gen_random_uuid()::text, p_user_id, 'Ăn uống',        'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Nhà ở',          'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Di chuyển',      'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Mua sắm',        'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Sức khỏe',       'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Giáo dục',       'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Giải trí',       'expense', 'variable'),
    (gen_random_uuid()::text, p_user_id, 'Hóa đơn & phí', 'expense', 'fixed'),
    (gen_random_uuid()::text, p_user_id, 'Tiết kiệm',      'expense', 'saving'),
    (gen_random_uuid()::text, p_user_id, 'Khác',           'expense', 'variable');
END;
$$;
REVOKE ALL ON FUNCTION public.seed_default_categories_for_user(uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO public.households (owner_user_id, name)
SELECT
  u.id,
  COALESCE(NULLIF(trim(u.raw_user_meta_data->>'name'), ''), NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''), 'Gia đình MyFinance')
FROM auth.users u
ON CONFLICT (owner_user_id) DO NOTHING;

INSERT INTO public.household_members (household_id, user_id, role)
SELECT h.id, h.owner_user_id, 'owner'
FROM public.households h
LEFT JOIN public.household_members hm ON hm.user_id = h.owner_user_id
WHERE hm.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_current_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  SELECT hm.household_id
  INTO v_household_id
  FROM public.household_members hm
  WHERE hm.user_id = v_user_id
  LIMIT 1;

  IF v_household_id IS NOT NULL THEN
    RETURN v_household_id;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Gia đình MyFinance'
  )
  INTO v_name
  FROM auth.users u
  WHERE u.id = v_user_id;

  INSERT INTO public.households (owner_user_id, name)
  VALUES (v_user_id, COALESCE(v_name, 'Gia đình MyFinance'))
  ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
  RETURNING id INTO v_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE
    SET household_id = EXCLUDED.household_id, role = 'owner';

  PERFORM public.seed_default_categories_for_user(v_user_id);
  RETURN v_household_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_current_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_household() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_scope_owner_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_owner_user_id uuid;
BEGIN
  v_household_id := public.ensure_current_household();
  SELECT h.owner_user_id INTO v_owner_user_id
  FROM public.households h
  WHERE h.id = v_household_id;
  RETURN v_owner_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_finance_scope_owner_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_scope_owner_user_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_household_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_role text;
  v_email text;
  v_context jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  v_household_id := public.ensure_current_household();
  SELECT hm.role INTO v_role
  FROM public.household_members hm
  WHERE hm.household_id = v_household_id AND hm.user_id = v_user_id;
  SELECT lower(COALESCE(u.email, '')) INTO v_email FROM auth.users u WHERE u.id = v_user_id;

  SELECT jsonb_build_object(
    'household', jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'owner_user_id', h.owner_user_id,
      'created_at', h.created_at,
      'updated_at', h.updated_at
    ),
    'role', v_role,
    'finance_owner_user_id', h.owner_user_id,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', hm.user_id,
        'email', COALESCE(u.email, ''),
        'role', hm.role,
        'joined_at', hm.joined_at
      ) ORDER BY CASE hm.role WHEN 'owner' THEN 0 WHEN 'member' THEN 1 ELSE 2 END, hm.joined_at)
      FROM public.household_members hm
      LEFT JOIN auth.users u ON u.id = hm.user_id
      WHERE hm.household_id = h.id
    ), '[]'::jsonb),
    'invites', CASE WHEN v_role = 'owner' THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
      FROM public.household_invites i
      WHERE i.household_id = h.id AND i.status = 'pending' AND i.expires_at > now()
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'pending_invite', (
      SELECT to_jsonb(i)
      FROM public.household_invites i
      WHERE lower(i.email) = v_email
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND i.household_id <> h.id
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  )
  INTO v_context
  FROM public.households h
  WHERE h.id = v_household_id;

  RETURN v_context;
END;
$$;
REVOKE ALL ON FUNCTION public.get_current_household_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_household_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_household_invite(p_email text, p_role text DEFAULT 'member')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_invite public.household_invites%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;
  IF NOT public.current_household_is_owner() THEN
    RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04';
  END IF;
  IF v_email = '' OR position('@' IN v_email) <= 1 THEN
    RAISE EXCEPTION 'Invalid invite email' USING ERRCODE = 'MFH05';
  END IF;
  IF p_role NOT IN ('member','viewer') THEN
    RAISE EXCEPTION 'Invalid household role' USING ERRCODE = 'MFH03';
  END IF;

  v_household_id := public.current_household_id();
  IF EXISTS (
    SELECT 1
    FROM public.household_members hm
    JOIN auth.users u ON u.id = hm.user_id
    WHERE hm.household_id = v_household_id AND lower(COALESCE(u.email, '')) = v_email
  ) THEN
    RAISE EXCEPTION 'User is already a household member' USING ERRCODE = 'MFH06';
  END IF;

  UPDATE public.household_invites
  SET status = 'expired', updated_at = now()
  WHERE household_id = v_household_id
    AND lower(email) = v_email
    AND status = 'pending'
    AND expires_at <= now();

  INSERT INTO public.household_invites (household_id, email, role, status, invited_by)
  VALUES (v_household_id, v_email, p_role, 'pending', v_user_id)
  ON CONFLICT (household_id, lower(email)) WHERE status = 'pending'
  DO UPDATE SET
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now()
  RETURNING * INTO v_invite;

  RETURN to_jsonb(v_invite);
END;
$$;
REVOKE ALL ON FUNCTION public.create_household_invite(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_invite(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_current_household_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invite public.household_invites%rowtype;
  v_current_household_id uuid;
  v_current_role text;
  v_current_owner uuid;
  v_member_count bigint;
  v_category_count bigint;
  v_distinct_category_count bigint;
  v_non_default_category_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;
  SELECT lower(COALESCE(u.email, '')), u.email_confirmed_at
  INTO v_email, v_email_confirmed_at
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email = '' OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirmed email required' USING ERRCODE = 'MFH10';
  END IF;

  SELECT * INTO v_invite
  FROM public.household_invites i
  WHERE lower(i.email) = v_email
    AND i.status = 'pending'
    AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending household invite not found' USING ERRCODE = 'MFH07';
  END IF;

  SELECT hm.household_id, hm.role, h.owner_user_id
  INTO v_current_household_id, v_current_role, v_current_owner
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = v_user_id
  LIMIT 1;

  IF v_current_household_id = v_invite.household_id THEN
    UPDATE public.household_invites
    SET status = 'accepted', accepted_by = v_user_id, accepted_at = now(), updated_at = now()
    WHERE id = v_invite.id;
    RETURN jsonb_build_object('accepted', true, 'household_id', v_invite.household_id);
  END IF;

  -- Fail closed: automatic joining is only allowed from the pristine personal
  -- bootstrap workspace. HOUSEHOLD-IDENTITY-1 deliberately does not invent a
  -- merge algorithm for two independent finance histories.
  IF v_current_household_id IS NULL
     OR v_current_role <> 'owner'
     OR v_current_owner IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Existing workspace cannot be auto-merged' USING ERRCODE = 'MFH08';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.household_members hm
  WHERE hm.household_id = v_current_household_id;
  IF v_member_count <> 1 THEN
    RAISE EXCEPTION 'Existing workspace cannot be auto-merged' USING ERRCODE = 'MFH08';
  END IF;

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
     OR EXISTS (SELECT 1 FROM public.net_worth_snapshots WHERE user_id = v_user_id)
  THEN
    RAISE EXCEPTION 'Existing workspace contains finance data' USING ERRCODE = 'MFH08';
  END IF;

  SELECT count(*), count(DISTINCT c.name)
  INTO v_category_count, v_distinct_category_count
  FROM public.categories c
  WHERE c.user_id = v_user_id;

  SELECT count(*) INTO v_non_default_category_count
  FROM public.categories c
  WHERE c.user_id = v_user_id
    AND NOT (
      (c.name = 'Lương' AND c.type = 'income' AND c.planning_group = 'income') OR
      (c.name = 'Thưởng' AND c.type = 'income' AND c.planning_group = 'income') OR
      (c.name = 'Freelance' AND c.type = 'income' AND c.planning_group = 'income') OR
      (c.name = 'Đầu tư' AND c.type = 'income' AND c.planning_group = 'income') OR
      (c.name = 'Thu nhập khác' AND c.type = 'income' AND c.planning_group = 'income') OR
      (c.name = 'Ăn uống' AND c.type = 'expense' AND c.planning_group = 'variable') OR
      (c.name = 'Nhà ở' AND c.type = 'expense' AND c.planning_group = 'fixed') OR
      (c.name = 'Di chuyển' AND c.type = 'expense' AND c.planning_group = 'variable') OR
      (c.name = 'Mua sắm' AND c.type = 'expense' AND c.planning_group = 'variable') OR
      (c.name = 'Sức khỏe' AND c.type = 'expense' AND c.planning_group = 'variable') OR
      (c.name = 'Giáo dục' AND c.type = 'expense' AND c.planning_group = 'fixed') OR
      (c.name = 'Giải trí' AND c.type = 'expense' AND c.planning_group = 'variable') OR
      (c.name = 'Hóa đơn & phí' AND c.type = 'expense' AND c.planning_group = 'fixed') OR
      (c.name = 'Tiết kiệm' AND c.type = 'expense' AND c.planning_group = 'saving') OR
      (c.name = 'Khác' AND c.type = 'expense' AND c.planning_group = 'variable')
    )
    OR c.financial_group IS NOT NULL
    OR c.is_recurring IS DISTINCT FROM false
    OR c.recurrence IS NOT NULL
    OR c.default_amount IS NOT NULL
    OR c.default_wallet_id IS NOT NULL
    OR c.next_run_date IS NOT NULL;

  IF v_category_count <> 15
     OR v_distinct_category_count <> 15
     OR v_non_default_category_count > 0 THEN
    RAISE EXCEPTION 'Existing workspace contains custom categories' USING ERRCODE = 'MFH08';
  END IF;

  DELETE FROM public.categories WHERE user_id = v_user_id;
  DELETE FROM public.household_members WHERE user_id = v_user_id;
  DELETE FROM public.households WHERE id = v_current_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_invite.household_id, v_user_id, v_invite.role)
  ON CONFLICT (user_id) DO UPDATE
    SET household_id = EXCLUDED.household_id, role = EXCLUDED.role, joined_at = now();

  UPDATE public.household_invites
  SET status = 'accepted', accepted_by = v_user_id, accepted_at = now(), updated_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('accepted', true, 'household_id', v_invite.household_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_current_household_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_current_household_invite() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_household_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01'; END IF;
  IF NOT public.current_household_is_owner() THEN RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04'; END IF;
  v_household_id := public.current_household_id();
  UPDATE public.household_invites
  SET status = 'revoked', updated_at = now()
  WHERE id = p_invite_id AND household_id = v_household_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'MFH07'; END IF;
  RETURN jsonb_build_object('revoked', true, 'invite_id', p_invite_id);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_household_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_household_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_household_member(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_owner_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01'; END IF;
  IF NOT public.current_household_is_owner() THEN RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04'; END IF;
  SELECT h.id, h.owner_user_id INTO v_household_id, v_owner_user_id
  FROM public.households h WHERE h.id = public.current_household_id();
  IF p_user_id IS NULL OR p_user_id = v_owner_user_id THEN
    RAISE EXCEPTION 'Household owner cannot be removed' USING ERRCODE = 'MFH09';
  END IF;
  DELETE FROM public.household_members WHERE household_id = v_household_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'MFH02'; END IF;
  RETURN jsonb_build_object('removed', true, 'user_id', p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.remove_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_household_member_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_owner_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01'; END IF;
  IF NOT public.current_household_is_owner() THEN RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04'; END IF;
  IF p_role NOT IN ('member','viewer') THEN RAISE EXCEPTION 'Invalid household role' USING ERRCODE = 'MFH03'; END IF;
  SELECT h.id, h.owner_user_id INTO v_household_id, v_owner_user_id
  FROM public.households h WHERE h.id = public.current_household_id();
  IF p_user_id IS NULL OR p_user_id = v_owner_user_id THEN
    RAISE EXCEPTION 'Household owner role cannot be changed' USING ERRCODE = 'MFH09';
  END IF;
  UPDATE public.household_members SET role = p_role
  WHERE household_id = v_household_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'MFH02'; END IF;
  RETURN jsonb_build_object('updated', true, 'user_id', p_user_id, 'role', p_role);
END;
$$;
REVOKE ALL ON FUNCTION public.set_household_member_role(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_member_role(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_current_household(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := trim(COALESCE(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01'; END IF;
  IF NOT public.current_household_is_owner() THEN RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04'; END IF;
  IF v_name = '' OR length(v_name) > 80 THEN RAISE EXCEPTION 'Invalid household name' USING ERRCODE = 'MFH05'; END IF;
  UPDATE public.households SET name = v_name WHERE id = public.current_household_id();
  RETURN jsonb_build_object('updated', true, 'name', v_name);
END;
$$;
REVOKE ALL ON FUNCTION public.rename_current_household(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_current_household(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Household and finance RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('households','household_members','household_invites')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY households_select ON public.households
  FOR SELECT TO authenticated
  USING (id = public.current_household_id());
CREATE POLICY household_members_select ON public.household_members
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY household_invites_select ON public.household_invites
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id() AND public.current_household_is_owner());

REVOKE ALL ON TABLE public.households, public.household_members, public.household_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.households, public.household_members TO authenticated;

DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions'
  ]
  LOOP
    FOR r IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = public.current_finance_scope_owner_user_id())',
      t || '_household_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = public.current_finance_write_owner_user_id())',
      t || '_household_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = public.current_finance_write_owner_user_id()) WITH CHECK (user_id = public.current_finance_write_owner_user_id())',
      t || '_household_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = public.current_finance_write_owner_user_id())',
      t || '_household_delete', t
    );
  END LOOP;
END $$;

-- Preserve the stricter referenced-owner checks for the two ledger tables.
DROP POLICY IF EXISTS saving_transactions_household_insert ON public.saving_transactions;
CREATE POLICY saving_transactions_household_insert ON public.saving_transactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = public.current_finance_write_owner_user_id()
    AND EXISTS (
      SELECT 1 FROM public.savings s
      WHERE s.id = saving_transactions.saving_id
        AND s.user_id = public.current_finance_write_owner_user_id()
    )
  );
DROP POLICY IF EXISTS saving_transactions_household_update ON public.saving_transactions;
CREATE POLICY saving_transactions_household_update ON public.saving_transactions
  FOR UPDATE TO authenticated
  USING (user_id = public.current_finance_write_owner_user_id())
  WITH CHECK (
    user_id = public.current_finance_write_owner_user_id()
    AND EXISTS (
      SELECT 1 FROM public.savings s
      WHERE s.id = saving_transactions.saving_id
        AND s.user_id = public.current_finance_write_owner_user_id()
    )
  );

DROP POLICY IF EXISTS forex_cash_transactions_household_insert ON public.forex_cash_transactions;
CREATE POLICY forex_cash_transactions_household_insert ON public.forex_cash_transactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = public.current_finance_write_owner_user_id()
    AND EXISTS (
      SELECT 1 FROM public.forex_accounts account
      WHERE account.id = forex_cash_transactions.forex_account_id
        AND account.user_id = public.current_finance_write_owner_user_id()
    )
  );
DROP POLICY IF EXISTS forex_cash_transactions_household_update ON public.forex_cash_transactions;
CREATE POLICY forex_cash_transactions_household_update ON public.forex_cash_transactions
  FOR UPDATE TO authenticated
  USING (user_id = public.current_finance_write_owner_user_id())
  WITH CHECK (
    user_id = public.current_finance_write_owner_user_id()
    AND EXISTS (
      SELECT 1 FROM public.forex_accounts account
      WHERE account.id = forex_cash_transactions.forex_account_id
        AND account.user_id = public.current_finance_write_owner_user_id()
    )
  );

DROP POLICY IF EXISTS net_worth_snapshots_select ON public.net_worth_snapshots;
CREATE POLICY net_worth_snapshots_select ON public.net_worth_snapshots
  FOR SELECT TO authenticated
  USING (user_id = public.current_finance_scope_owner_user_id());

-- ---------------------------------------------------------------------------
-- Signup bootstrap: every auth identity starts in a personal household.
-- A shared-household invite is accepted explicitly after login and confirmed
-- email verification, so an unverified signup can never claim an invite by
-- matching an email string alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_name text;
BEGIN
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Gia đình MyFinance'
  );
  INSERT INTO public.households (owner_user_id, name)
  VALUES (NEW.id, v_name)
  ON CONFLICT (owner_user_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
  RETURNING id INTO v_household_id;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, NEW.id, 'owner')
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.seed_default_categories_for_user(NEW.id);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Adapt existing finance RPC ownership without duplicating their business
-- logic. Historical finance user_id remains the household owner's stable scope.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_definition text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'create_finance_transaction','update_finance_transaction','delete_finance_transaction',
        'delete_wallet_atomic','create_saving_account','create_saving_movement','delete_saving_account',
        'delete_category_atomic','create_forex_cash_transaction','update_forex_cash_transaction',
        'delete_forex_cash_transaction','delete_forex_account_atomic','clone_previous_month_budgets_atomic'
      ])
  LOOP
    v_definition := pg_get_functiondef(r.oid);
    v_definition := replace(v_definition, 'auth.uid()', 'public.current_finance_write_owner_user_id()');
    EXECUTE v_definition;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'export_finance_backup'
  LOOP
    v_definition := pg_get_functiondef(r.oid);
    v_definition := replace(v_definition, 'auth.uid()', 'public.current_finance_scope_owner_user_id()');
    EXECUTE v_definition;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY['restore_finance_backup','seed_finance_demo_data'])
  LOOP
    v_definition := pg_get_functiondef(r.oid);
    v_definition := replace(v_definition, 'auth.uid()', 'public.current_finance_admin_owner_user_id()');
    EXECUTE v_definition;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'capture_current_net_worth_snapshot'
  LIMIT 1;
  IF v_definition IS NOT NULL THEN
    v_definition := replace(
      v_definition,
      'v_request_user_id IS NOT NULL AND v_request_user_id IS DISTINCT FROM p_user_id',
      'v_request_user_id IS NOT NULL AND public.current_finance_scope_owner_user_id() IS DISTINCT FROM p_user_id'
    );
    EXECUTE v_definition;
  END IF;
END $$;

-- Keep the household RPC surface authenticated-only. The underlying membership
-- tables are not directly writable by clients.
REVOKE ALL ON FUNCTION public.get_finance_scope_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_household_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_household_invite(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_current_household_invite() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_household_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_household_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_household_member_role(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rename_current_household(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_scope_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_household_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_household_invite(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_current_household_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_household_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_household_member_role(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_current_household(text) TO authenticated;

COMMIT;
