-- HOUSEHOLD-WORKSPACE-1 — In-App Invite, Personal/Family Workspace Switching & Safe Membership
-- Forward migration for an existing HOUSEHOLD-IDENTITY-1 database.
--
-- Invariants:
--   * every auth identity keeps an owned personal workspace;
--   * accepting an invite adds membership, never merges/deletes personal finance rows;
--   * one user can belong to multiple households but only one is active at a time;
--   * the active preference is UX state only; every finance read/write is still
--     authorized from authenticated membership + role through the canonical helpers;
--   * leaving a family immediately removes shared-data access and falls back to personal.

BEGIN;

-- ---------------------------------------------------------------------------
-- Multi-workspace membership + active workspace preference
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint name;
BEGIN
  SELECT c.conname
  INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'household_members'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (user_id)'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.household_members DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS household_members_user_idx
  ON public.household_members (user_id);

ALTER TABLE public.household_invites
  DROP CONSTRAINT IF EXISTS household_invites_status_check;
ALTER TABLE public.household_invites
  ADD CONSTRAINT household_invites_status_check
  CHECK (status IN ('pending','accepted','revoked','expired','declined'));

CREATE TABLE IF NOT EXISTS public.finance_workspace_preferences (
  user_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_household_id uuid        REFERENCES public.households(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_workspace_preferences_active_idx
  ON public.finance_workspace_preferences (active_household_id);

DROP TRIGGER IF EXISTS trg_finance_workspace_preferences_updated_at
  ON public.finance_workspace_preferences;
CREATE TRIGGER trg_finance_workspace_preferences_updated_at
BEFORE UPDATE ON public.finance_workspace_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.finance_workspace_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_workspace_preferences
  FROM PUBLIC, anon, authenticated;

-- Invite rows are readable only by the active household owner or by the
-- authenticated account whose JWT email exactly matches the invited email.
-- This narrow SELECT surface enables an in-app Realtime notification without
-- exposing invitation rows to unrelated accounts.
DROP POLICY IF EXISTS household_invites_select ON public.household_invites;
CREATE POLICY household_invites_select ON public.household_invites
  FOR SELECT TO authenticated
  USING (
    (
      household_id = public.current_household_id()
      AND public.current_household_is_owner()
    )
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
GRANT SELECT ON TABLE public.household_invites TO authenticated;

-- Supabase projects normally expose a supabase_realtime publication. Add the
-- invitation table once when that publication is table-scoped; if a project
-- uses FOR ALL TABLES (or no publication), no change is required here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication p
    WHERE p.pubname = 'supabase_realtime'
      AND NOT p.puballtables
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND pt.tablename = 'household_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.household_invites;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Private personal-workspace repair/bootstrap helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_personal_household_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_name text;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Auth identity not found' USING ERRCODE = 'MFH01';
  END IF;

  SELECT h.id
  INTO v_household_id
  FROM public.households h
  WHERE h.owner_user_id = p_user_id
  LIMIT 1;

  IF v_household_id IS NULL THEN
    SELECT COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
      'Gia đình MyFinance'
    )
    INTO v_name
    FROM auth.users u
    WHERE u.id = p_user_id;

    INSERT INTO public.households (owner_user_id, name)
    VALUES (p_user_id, COALESCE(v_name, 'Gia đình MyFinance'))
    ON CONFLICT (owner_user_id) DO UPDATE
      SET owner_user_id = EXCLUDED.owner_user_id
    RETURNING id INTO v_household_id;
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, p_user_id, 'owner')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'owner';

  PERFORM public.seed_default_categories_for_user(p_user_id);
  RETURN v_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_household_for_user(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_personal_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;
  RETURN public.ensure_personal_household_for_user(v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_household()
  FROM PUBLIC, anon, authenticated;

-- Existing HOUSEHOLD-IDENTITY-1 invitees may have had their pristine personal
-- bootstrap household removed. Recreate one for every identity without
-- touching any finance history. Default categories are seeded only when absent.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT u.id FROM auth.users u LOOP
    PERFORM public.ensure_personal_household_for_user(r.id);
  END LOOP;
END $$;

-- Preserve the old shared workspace as active for users who were already
-- joined under the one-membership model; everyone else starts on personal.
INSERT INTO public.finance_workspace_preferences (user_id, active_household_id)
SELECT
  u.id,
  COALESCE(
    (
      SELECT hm.household_id
      FROM public.household_members hm
      JOIN public.households h ON h.id = hm.household_id
      WHERE hm.user_id = u.id
        AND h.owner_user_id IS DISTINCT FROM u.id
      ORDER BY hm.joined_at ASC, hm.household_id
      LIMIT 1
    ),
    (
      SELECT h.id
      FROM public.households h
      WHERE h.owner_user_id = u.id
      LIMIT 1
    )
  )
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Canonical active-workspace scope helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT p.active_household_id
      FROM public.finance_workspace_preferences p
      WHERE p.user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.household_members hm
          WHERE hm.user_id = auth.uid()
            AND hm.household_id = p.active_household_id
        )
      LIMIT 1
    ),
    (
      SELECT h.id
      FROM public.households h
      JOIN public.household_members hm
        ON hm.household_id = h.id
       AND hm.user_id = auth.uid()
      WHERE h.owner_user_id = auth.uid()
      ORDER BY h.created_at ASC, h.id
      LIMIT 1
    )
  )
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
    AND hm.household_id = public.current_household_id()
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
    AND hm.household_id = public.current_household_id()
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
    AND hm.household_id = public.current_household_id()
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
    AND hm.household_id = public.current_household_id()
    AND hm.role = 'owner'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_household_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_household_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_scope_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_write_owner_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_finance_admin_owner_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_scope_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_write_owner_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_admin_owner_user_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_current_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_personal_household_id uuid;
  v_active_household_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  v_personal_household_id := public.ensure_personal_household_for_user(v_user_id);

  SELECT p.active_household_id
  INTO v_active_household_id
  FROM public.finance_workspace_preferences p
  WHERE p.user_id = v_user_id
    AND EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.user_id = v_user_id
        AND hm.household_id = p.active_household_id
    )
  LIMIT 1;

  IF v_active_household_id IS NULL THEN
    v_active_household_id := v_personal_household_id;
    INSERT INTO public.finance_workspace_preferences (user_id, active_household_id)
    VALUES (v_user_id, v_active_household_id)
    ON CONFLICT (user_id) DO UPDATE
      SET active_household_id = EXCLUDED.active_household_id,
          updated_at = now();
  END IF;

  RETURN v_active_household_id;
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
  SELECT h.owner_user_id
  INTO v_owner_user_id
  FROM public.households h
  JOIN public.household_members hm
    ON hm.household_id = h.id
   AND hm.user_id = auth.uid()
  WHERE h.id = v_household_id;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Active workspace membership not found' USING ERRCODE = 'MFH11';
  END IF;
  RETURN v_owner_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_scope_owner_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_scope_owner_user_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- Context + workspace switching
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_household_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_personal_household_id uuid;
  v_role text;
  v_email text;
  v_context jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  v_personal_household_id := public.ensure_personal_household_for_user(v_user_id);
  v_household_id := public.ensure_current_household();

  SELECT hm.role
  INTO v_role
  FROM public.household_members hm
  WHERE hm.household_id = v_household_id
    AND hm.user_id = v_user_id;

  SELECT lower(COALESCE(u.email, ''))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

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
    'active_household_id', v_household_id,
    'personal_household_id', v_personal_household_id,
    'workspaces', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'household_id', wh.id,
          'name', wh.name,
          'owner_user_id', wh.owner_user_id,
          'finance_owner_user_id', wh.owner_user_id,
          'role', wm.role,
          'is_personal', wh.owner_user_id = v_user_id,
          'is_active', wh.id = v_household_id,
          'member_count', (
            SELECT count(*)
            FROM public.household_members count_member
            WHERE count_member.household_id = wh.id
          )
        )
        ORDER BY
          CASE WHEN wh.owner_user_id = v_user_id THEN 0 ELSE 1 END,
          lower(wh.name),
          wm.joined_at
      )
      FROM public.household_members wm
      JOIN public.households wh ON wh.id = wm.household_id
      WHERE wm.user_id = v_user_id
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', hm.user_id,
          'email', COALESCE(u.email, ''),
          'role', hm.role,
          'joined_at', hm.joined_at
        )
        ORDER BY
          CASE hm.role WHEN 'owner' THEN 0 WHEN 'member' THEN 1 ELSE 2 END,
          hm.joined_at
      )
      FROM public.household_members hm
      LEFT JOIN auth.users u ON u.id = hm.user_id
      WHERE hm.household_id = h.id
    ), '[]'::jsonb),
    'invites', CASE WHEN v_role = 'owner' THEN COALESCE((
      SELECT jsonb_agg(
        to_jsonb(i) || jsonb_build_object(
          'household_name', h.name,
          'invited_by_email', COALESCE(inviter.email, '')
        )
        ORDER BY i.created_at DESC
      )
      FROM public.household_invites i
      LEFT JOIN auth.users inviter ON inviter.id = i.invited_by
      WHERE i.household_id = h.id
        AND i.status = 'pending'
        AND i.expires_at > now()
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'pending_invites', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(i) || jsonb_build_object(
          'household_name', invited_household.name,
          'invited_by_email', COALESCE(inviter.email, '')
        )
        ORDER BY i.created_at DESC
      )
      FROM public.household_invites i
      JOIN public.households invited_household ON invited_household.id = i.household_id
      LEFT JOIN auth.users inviter ON inviter.id = i.invited_by
      WHERE lower(i.email) = v_email
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1
          FROM public.household_members existing_member
          WHERE existing_member.household_id = i.household_id
            AND existing_member.user_id = v_user_id
        )
    ), '[]'::jsonb),
    'pending_invite', (
      SELECT to_jsonb(i) || jsonb_build_object(
        'household_name', invited_household.name,
        'invited_by_email', COALESCE(inviter.email, '')
      )
      FROM public.household_invites i
      JOIN public.households invited_household ON invited_household.id = i.household_id
      LEFT JOIN auth.users inviter ON inviter.id = i.invited_by
      WHERE lower(i.email) = v_email
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1
          FROM public.household_members existing_member
          WHERE existing_member.household_id = i.household_id
            AND existing_member.user_id = v_user_id
        )
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

CREATE OR REPLACE FUNCTION public.switch_finance_workspace(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;
  PERFORM public.ensure_personal_household_for_user(v_user_id);

  SELECT h.owner_user_id, hm.role
  INTO v_owner_user_id, v_role
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = v_user_id
    AND hm.household_id = p_household_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace membership not found' USING ERRCODE = 'MFH11';
  END IF;

  INSERT INTO public.finance_workspace_preferences (user_id, active_household_id)
  VALUES (v_user_id, p_household_id)
  ON CONFLICT (user_id) DO UPDATE
    SET active_household_id = EXCLUDED.active_household_id,
        updated_at = now();

  RETURN jsonb_build_object(
    'switched', true,
    'household_id', p_household_id,
    'finance_owner_user_id', v_owner_user_id,
    'role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.switch_finance_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_finance_workspace(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- In-app invitation acceptance / decline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_household_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.household_invites%rowtype;
  v_personal_household_id uuid;
  v_active_household_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  SELECT lower(COALESCE(u.email, ''))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email = '' THEN
    RAISE EXCEPTION 'Authenticated email required' USING ERRCODE = 'MFH05';
  END IF;

  v_personal_household_id := public.ensure_personal_household_for_user(v_user_id);
  v_active_household_id := public.ensure_current_household();

  SELECT *
  INTO v_invite
  FROM public.household_invites i
  WHERE i.id = p_invite_id
    AND lower(i.email) = v_email
    AND i.status = 'pending'
    AND i.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending household invite not found' USING ERRCODE = 'MFH07';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_invite.household_id, v_user_id, v_invite.role)
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.household_members.role = 'owner' THEN 'owner'
      ELSE EXCLUDED.role
    END;

  UPDATE public.household_invites
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_invite.id;

  -- Intentionally do not switch active_household_id here. Acceptance grants
  -- membership only; the user explicitly chooses Personal or Family in-app.
  RETURN jsonb_build_object(
    'accepted', true,
    'household_id', v_invite.household_id,
    'active_household_id', v_active_household_id,
    'personal_household_id', v_personal_household_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_household_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_household_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_current_household_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  SELECT lower(COALESCE(u.email, ''))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  SELECT i.id
  INTO v_invite_id
  FROM public.household_invites i
  WHERE lower(i.email) = v_email
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = i.household_id
        AND hm.user_id = v_user_id
    )
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Pending household invite not found' USING ERRCODE = 'MFH07';
  END IF;

  RETURN public.accept_household_invite(v_invite_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_current_household_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_current_household_invite() TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_household_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  SELECT lower(COALESCE(u.email, ''))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  UPDATE public.household_invites
  SET status = 'declined', updated_at = now()
  WHERE id = p_invite_id
    AND lower(email) = v_email
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending household invite not found' USING ERRCODE = 'MFH07';
  END IF;

  RETURN jsonb_build_object('declined', true, 'invite_id', p_invite_id);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_household_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_household_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Safe leave / owner removal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_household(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_personal_household_id uuid;
  v_role text;
  v_owner_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;

  v_personal_household_id := public.ensure_personal_household_for_user(v_user_id);

  SELECT hm.role, h.owner_user_id
  INTO v_role, v_owner_user_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.household_id = p_household_id
    AND hm.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household membership not found' USING ERRCODE = 'MFH02';
  END IF;

  IF p_household_id = v_personal_household_id
     OR v_role = 'owner'
     OR v_owner_user_id = v_user_id THEN
    RAISE EXCEPTION 'Owned personal workspace cannot be left' USING ERRCODE = 'MFH12';
  END IF;

  DELETE FROM public.household_members
  WHERE household_id = p_household_id
    AND user_id = v_user_id;

  UPDATE public.finance_workspace_preferences
  SET active_household_id = v_personal_household_id,
      updated_at = now()
  WHERE user_id = v_user_id
    AND active_household_id = p_household_id;

  RETURN jsonb_build_object(
    'left', true,
    'household_id', p_household_id,
    'active_household_id', COALESCE(public.current_household_id(), v_personal_household_id),
    'personal_household_id', v_personal_household_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_household(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_household(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_household_member(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
  v_owner_user_id uuid;
  v_target_personal_household_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFH01';
  END IF;
  IF NOT public.current_household_is_owner() THEN
    RAISE EXCEPTION 'Household owner required' USING ERRCODE = 'MFH04';
  END IF;

  SELECT h.id, h.owner_user_id
  INTO v_household_id, v_owner_user_id
  FROM public.households h
  WHERE h.id = public.current_household_id();

  IF p_user_id IS NULL OR p_user_id = v_owner_user_id THEN
    RAISE EXCEPTION 'Household owner cannot be removed' USING ERRCODE = 'MFH09';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'MFH02';
  END IF;

  v_target_personal_household_id :=
    public.ensure_personal_household_for_user(p_user_id);

  DELETE FROM public.household_members
  WHERE household_id = v_household_id
    AND user_id = p_user_id;

  UPDATE public.finance_workspace_preferences
  SET active_household_id = v_target_personal_household_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND active_household_id = v_household_id;

  RETURN jsonb_build_object(
    'removed', true,
    'user_id', p_user_id,
    'personal_household_id', v_target_personal_household_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Signup bootstrap under composite membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  v_household_id := public.ensure_personal_household_for_user(NEW.id);

  INSERT INTO public.finance_workspace_preferences (user_id, active_household_id)
  VALUES (NEW.id, v_household_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- RPC surface is authenticated-only. Active workspace never grants authority
-- by itself: all finance RLS continues to resolve through membership-aware
-- current_finance_* helpers above.
REVOKE ALL ON FUNCTION public.switch_finance_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_household_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_current_household_invite() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_household_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_household(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_finance_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_household_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_current_household_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_household_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_household(uuid) TO authenticated;

COMMIT;
