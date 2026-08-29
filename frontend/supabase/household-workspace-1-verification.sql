-- HOUSEHOLD-WORKSPACE-1 — read-only deployment verification
-- Run in Supabase SQL Editor AFTER household-workspace-1-multi-workspace-membership.sql.
-- Every *_issues / *_missing / *_invalid result should be 0 unless noted.

-- 1) The old one-household-per-user uniqueness must be gone.
SELECT count(*) AS household_members_user_unique_constraints
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'household_members'
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) = 'UNIQUE (user_id)';

-- 2) Active workspace preference exists, is RLS-enabled, and has no direct
-- authenticated table grant. Mutations are intentionally RPC-only.
SELECT
  to_regclass('public.finance_workspace_preferences') IS NOT NULL AS preferences_table_exists,
  COALESCE(c.relrowsecurity, false) AS rls_enabled,
  has_table_privilege('authenticated', 'public.finance_workspace_preferences', 'SELECT') AS authenticated_select,
  has_table_privilege('authenticated', 'public.finance_workspace_preferences', 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', 'public.finance_workspace_preferences', 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', 'public.finance_workspace_preferences', 'DELETE') AS authenticated_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'finance_workspace_preferences';

-- 3) The invitation SELECT surface is narrow: RLS remains enabled, the
-- authenticated role can SELECT, and the policy is bound to active-owner or
-- matching JWT email. Realtime publication should include the table when the
-- project uses a table-scoped supabase_realtime publication.
SELECT
  has_table_privilege('authenticated', 'public.household_invites', 'SELECT') AS authenticated_invite_select,
  (
    SELECT COALESCE(qual, '')
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'household_invites'
      AND policyname = 'household_invites_select'
  ) AS household_invites_select_policy,
  EXISTS (
    SELECT 1
    FROM pg_publication p
    WHERE p.pubname = 'supabase_realtime'
      AND p.puballtables
  ) OR EXISTS (
    SELECT 1
    FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND pt.tablename = 'household_invites'
  ) AS household_invites_realtime_enabled;

-- 4) Required authenticated RPC surface.
WITH required(name, args) AS (
  VALUES
    ('get_current_household_context', ''),
    ('get_finance_scope_owner_user_id', ''),
    ('accept_household_invite', 'uuid'),
    ('accept_current_household_invite', ''),
    ('decline_household_invite', 'uuid'),
    ('switch_finance_workspace', 'uuid'),
    ('leave_household', 'uuid')
)
SELECT
  r.name,
  r.args,
  p.oid IS NOT NULL AS exists,
  CASE WHEN p.oid IS NULL THEN false
       ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE')
  END AS authenticated_can_execute
FROM required r
LEFT JOIN pg_proc p
  ON p.proname = r.name
 AND pg_get_function_identity_arguments(p.oid) = r.args
LEFT JOIN pg_namespace n
  ON n.oid = p.pronamespace
 AND n.nspname = 'public'
ORDER BY r.name;

-- 5) Invite state contract now supports declined.
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'household_invites'
  AND c.conname = 'household_invites_status_check';

-- 6) Every auth identity must retain an owned personal workspace and owner membership.
SELECT count(*) AS users_missing_personal_workspace
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.households h
  JOIN public.household_members hm
    ON hm.household_id = h.id
   AND hm.user_id = u.id
   AND hm.role = 'owner'
  WHERE h.owner_user_id = u.id
);

-- 7) Every auth identity should have a preference and it must point to a
-- household the identity is currently a member of.
SELECT count(*) AS users_missing_workspace_preference
FROM auth.users u
LEFT JOIN public.finance_workspace_preferences p ON p.user_id = u.id
WHERE p.user_id IS NULL;

SELECT count(*) AS invalid_active_workspace_preferences
FROM public.finance_workspace_preferences p
WHERE p.active_household_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.user_id = p.user_id
      AND hm.household_id = p.active_household_id
  );

-- 8) Multi-membership is legal. This is informational: values > 0 mean users
-- currently belong to personal + one or more family workspaces.
SELECT
  count(*) FILTER (WHERE membership_count > 1) AS users_with_multiple_workspaces,
  max(membership_count) AS max_workspaces_for_one_user
FROM (
  SELECT user_id, count(*) AS membership_count
  FROM public.household_members
  GROUP BY user_id
) membership_counts;

-- 9) Finance RLS should still resolve through the canonical scope helpers.
SELECT
  count(*) FILTER (
    WHERE COALESCE(qual, '') ILIKE '%current_finance_scope_owner_user_id%'
  ) AS read_scope_policies,
  count(*) FILTER (
    WHERE COALESCE(with_check, '') ILIKE '%current_finance_write_owner_user_id%'
       OR COALESCE(with_check, '') ILIKE '%current_finance_admin_owner_user_id%'
  ) AS write_or_admin_scope_policies
FROM pg_policies
WHERE schemaname = 'public';

-- 10) Compact deployment summary for manual inspection.
SELECT
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM public.households) AS households,
  (SELECT count(*) FROM public.household_members) AS memberships,
  (SELECT count(*) FROM public.finance_workspace_preferences) AS preferences,
  (SELECT count(*) FROM public.household_invites WHERE status = 'pending' AND expires_at > now()) AS pending_invites,
  (SELECT count(*) FROM public.household_invites WHERE status = 'declined') AS declined_invites;
