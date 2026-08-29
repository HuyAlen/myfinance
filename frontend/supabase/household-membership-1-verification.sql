-- HOUSEHOLD-MEMBERSHIP-1 — read-only deployment verification

-- 1) Every active preference must point at a real membership.
SELECT
  p.user_id,
  u.email,
  p.active_household_id,
  hm.role,
  CASE WHEN hm.user_id IS NOT NULL THEN true ELSE false END AS active_membership_valid
FROM public.finance_workspace_preferences p
LEFT JOIN auth.users u ON u.id = p.user_id
LEFT JOIN public.household_members hm
  ON hm.user_id = p.user_id
 AND hm.household_id = p.active_household_id
ORDER BY lower(COALESCE(u.email, '')), p.user_id;

-- Expected: invalid_active_preference_count = 0.
SELECT count(*) AS invalid_active_preference_count
FROM public.finance_workspace_preferences p
WHERE p.active_household_id IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM public.household_members hm
     WHERE hm.user_id = p.user_id
       AND hm.household_id = p.active_household_id
   );

-- 2) No multi-membership identity may be left without a valid preference.
-- Expected: zero rows.
SELECT
  hm.user_id,
  u.email,
  count(*) AS membership_count,
  max(p.active_household_id::text) AS active_household_id
FROM public.household_members hm
LEFT JOIN auth.users u ON u.id = hm.user_id
LEFT JOIN public.finance_workspace_preferences p ON p.user_id = hm.user_id
GROUP BY hm.user_id, u.email
HAVING count(*) > 1
   AND NOT bool_or(hm.household_id = p.active_household_id)
ORDER BY lower(COALESCE(u.email, ''));

-- 3) Resolver definition must be preference-first and single-membership-only
-- for fallback; it must not select an owned household as a multi-membership guess.
SELECT pg_get_functiondef(
  'public.current_household_id()'::regprocedure
) AS current_household_id_definition;

-- 4) Invite acceptance must atomically upsert active_household_id to the invite.
SELECT pg_get_functiondef(
  'public.accept_household_invite(uuid)'::regprocedure
) AS accept_household_invite_definition;

-- 5) Audit stamping must bind actor attribution to current_household_id().
SELECT pg_get_functiondef(
  'public.stamp_finance_audit_log_insert()'::regprocedure
) AS audit_stamp_definition;

-- 6) Preference guard must be installed.
SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'finance_workspace_preferences'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 7) Household audit events remain isolated by the recorded household.
-- Historical rows are intentionally not rewritten by this migration.
SELECT
  household_id,
  actor_user_id,
  actor_email,
  actor_role,
  count(*) AS event_count,
  min(created_at) AS first_event,
  max(created_at) AS last_event
FROM public.finance_audit_log
GROUP BY household_id, actor_user_id, actor_email, actor_role
ORDER BY last_event DESC;
