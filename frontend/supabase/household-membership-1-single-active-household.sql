-- HOUSEHOLD-MEMBERSHIP-1 — Single Active Household Invariant, Invite Reconciliation & Audit Isolation
-- Forward hardening migration for HOUSEHOLD-WORKSPACE-1 + AUDIT-TRAIL-1.
--
-- Production invariants:
--   * a user may keep memberships in multiple workspaces (personal + family),
--     but finance resolution has exactly one explicit active preference;
--   * current_household_id() never guesses an owner workspace when multiple
--     memberships exist and the preference is missing/invalid;
--   * accepting an invite atomically makes the joined household active without
--     deleting or merging the user's personal finance history;
--   * audit attribution resolves through that same active household, never an
--     arbitrary household_members LIMIT 1 row;
--   * leave/remove flows repair the active preference before membership removal.

BEGIN;

-- BEGIN HOUSEHOLD-MEMBERSHIP-1 SHARED BODY

-- ---------------------------------------------------------------------------
-- Active-workspace preference integrity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_finance_workspace_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Workspace preference requires a user'
      USING ERRCODE = 'MFH13';
  END IF;

  IF NEW.active_household_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.household_members hm
       WHERE hm.user_id = NEW.user_id
         AND hm.household_id = NEW.active_household_id
     ) THEN
    RAISE EXCEPTION 'Active workspace must be one of the user memberships'
      USING ERRCODE = 'MFH13';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_finance_workspace_preference()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_workspace_preferences_membership_guard
  ON public.finance_workspace_preferences;
CREATE TRIGGER trg_finance_workspace_preferences_membership_guard
BEFORE INSERT OR UPDATE OF user_id, active_household_id
ON public.finance_workspace_preferences
FOR EACH ROW
EXECUTE FUNCTION public.validate_finance_workspace_preference();

-- Defense in depth for privileged/direct membership deletion. Normal app RPCs
-- repair the preference before DELETE; this trigger prevents an out-of-band
-- delete from leaving active_household_id pointed at a membership that no
-- longer exists. Prefer the remaining owned personal workspace; only choose a
-- non-personal workspace when it is the sole remaining membership.
CREATE OR REPLACE FUNCTION public.reconcile_finance_workspace_after_membership_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_replacement_household_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_workspace_preferences p
    WHERE p.user_id = OLD.user_id
      AND p.active_household_id = OLD.household_id
  ) THEN
    RETURN OLD;
  END IF;

  SELECT h.id
  INTO v_replacement_household_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = OLD.user_id
    AND h.owner_user_id = OLD.user_id
  ORDER BY h.created_at ASC, h.id
  LIMIT 1;

  IF v_replacement_household_id IS NULL THEN
    SELECT hm.household_id
    INTO v_replacement_household_id
    FROM public.household_members hm
    WHERE hm.user_id = OLD.user_id
      AND (
        SELECT count(*)
        FROM public.household_members remaining_member
        WHERE remaining_member.user_id = OLD.user_id
      ) = 1
    LIMIT 1;
  END IF;

  UPDATE public.finance_workspace_preferences
  SET active_household_id = v_replacement_household_id,
      updated_at = now()
  WHERE user_id = OLD.user_id
    AND active_household_id = OLD.household_id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_finance_workspace_after_membership_delete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_household_members_reconcile_active_workspace
  ON public.household_members;
CREATE TRIGGER trg_household_members_reconcile_active_workspace
AFTER DELETE ON public.household_members
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_finance_workspace_after_membership_delete();

-- Repair only invalid/missing preferences. Valid active choices are preserved,
-- including already-selected family workspaces. The personal workspace is the
-- deterministic safe recovery target because it is owned by the same auth user.
DO $$
DECLARE
  r record;
  v_personal_household_id uuid;
BEGIN
  FOR r IN SELECT u.id AS user_id FROM auth.users u LOOP
    v_personal_household_id :=
      public.ensure_personal_household_for_user(r.user_id);

    IF NOT EXISTS (
      SELECT 1
      FROM public.finance_workspace_preferences p
      JOIN public.household_members hm
        ON hm.user_id = p.user_id
       AND hm.household_id = p.active_household_id
      WHERE p.user_id = r.user_id
    ) THEN
      INSERT INTO public.finance_workspace_preferences (
        user_id,
        active_household_id
      )
      VALUES (
        r.user_id,
        v_personal_household_id
      )
      ON CONFLICT (user_id) DO UPDATE
        SET active_household_id = EXCLUDED.active_household_id,
            updated_at = now();
    END IF;
  END LOOP;
END $$;

-- Pure scope helper: preference wins only while it is backed by membership.
-- A single membership can safely bootstrap legacy users. With multiple
-- memberships and no valid preference, return NULL rather than guessing.
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
        AND p.active_household_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.household_members hm
          WHERE hm.user_id = auth.uid()
            AND hm.household_id = p.active_household_id
        )
      LIMIT 1
    ),
    (
      SELECT hm.household_id
      FROM public.household_members hm
      WHERE hm.user_id = auth.uid()
        AND (
          SELECT count(*)
          FROM public.household_members member_count
          WHERE member_count.user_id = auth.uid()
        ) = 1
      LIMIT 1
    )
  )
$$;

REVOKE ALL ON FUNCTION public.current_household_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;

-- Mutating bootstrap/repair helper. Unlike current_household_id(), this helper
-- may deliberately recover an invalid preference to the owned personal
-- workspace, guaranteeing a valid active row before application context loads.
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

  v_personal_household_id :=
    public.ensure_personal_household_for_user(v_user_id);

  SELECT p.active_household_id
  INTO v_active_household_id
  FROM public.finance_workspace_preferences p
  WHERE p.user_id = v_user_id
    AND p.active_household_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.user_id = v_user_id
        AND hm.household_id = p.active_household_id
    )
  LIMIT 1;

  IF v_active_household_id IS NULL THEN
    v_active_household_id := v_personal_household_id;

    INSERT INTO public.finance_workspace_preferences (
      user_id,
      active_household_id
    )
    VALUES (
      v_user_id,
      v_active_household_id
    )
    ON CONFLICT (user_id) DO UPDATE
      SET active_household_id = EXCLUDED.active_household_id,
          updated_at = now();
  END IF;

  RETURN v_active_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_current_household()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invite acceptance: membership + active preference are one transaction
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

  v_personal_household_id :=
    public.ensure_personal_household_for_user(v_user_id);

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

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role
  )
  VALUES (
    v_invite.household_id,
    v_user_id,
    v_invite.role
  )
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.household_members.role = 'owner' THEN 'owner'
      ELSE EXCLUDED.role
    END;

  -- Joining a family is an explicit user action. Make that joined workspace the
  -- active finance scope in the same transaction. Personal rows remain intact
  -- and can still be selected later through switch_finance_workspace().
  INSERT INTO public.finance_workspace_preferences (
    user_id,
    active_household_id
  )
  VALUES (
    v_user_id,
    v_invite.household_id
  )
  ON CONFLICT (user_id) DO UPDATE
    SET active_household_id = EXCLUDED.active_household_id,
        updated_at = now();

  UPDATE public.household_invites
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'accepted', true,
    'household_id', v_invite.household_id,
    'active_household_id', v_invite.household_id,
    'personal_household_id', v_personal_household_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_household_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_household_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Membership removal: repair active preference before deleting membership
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

  v_personal_household_id :=
    public.ensure_personal_household_for_user(v_user_id);

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

  UPDATE public.finance_workspace_preferences
  SET active_household_id = v_personal_household_id,
      updated_at = now()
  WHERE user_id = v_user_id
    AND active_household_id = p_household_id;

  DELETE FROM public.household_members
  WHERE household_id = p_household_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'left', true,
    'household_id', p_household_id,
    'active_household_id', public.ensure_current_household(),
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

  UPDATE public.finance_workspace_preferences
  SET active_household_id = v_target_personal_household_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND active_household_id = v_household_id;

  DELETE FROM public.household_members
  WHERE household_id = v_household_id
    AND user_id = p_user_id;

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
-- Audit attribution must use the exact same active workspace resolver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_finance_audit_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_household_id uuid;
  v_finance_owner_user_id uuid;
  v_actor_role text;
  v_actor_email text;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Finance audit requires an authenticated actor'
      USING ERRCODE = 'MFA01';
  END IF;

  v_household_id := public.current_household_id();

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Finance audit actor has no valid active household'
      USING ERRCODE = 'MFA02';
  END IF;

  SELECT
    h.owner_user_id,
    hm.role,
    lower(NULLIF(trim(COALESCE(u.email, '')), ''))
  INTO
    v_finance_owner_user_id,
    v_actor_role,
    v_actor_email
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  LEFT JOIN auth.users u ON u.id = hm.user_id
  WHERE hm.user_id = v_actor_user_id
    AND hm.household_id = v_household_id;

  IF v_finance_owner_user_id IS NULL
     OR v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Finance audit actor is not a member of the active household'
      USING ERRCODE = 'MFA02';
  END IF;

  NEW.household_id := v_household_id;
  NEW.finance_owner_user_id := v_finance_owner_user_id;
  NEW.actor_user_id := v_actor_user_id;
  NEW.actor_email := v_actor_email;
  NEW.actor_role := v_actor_role;
  NEW.created_at := clock_timestamp();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_finance_audit_log_insert()
  FROM PUBLIC, anon, authenticated;

-- END HOUSEHOLD-MEMBERSHIP-1 SHARED BODY

COMMIT;
