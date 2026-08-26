-- ============================================================================
-- CATEGORY-INTEGRITY-1 — Prevent Orphaned Budget & Category References
--
-- Forward migration for existing Supabase projects.
--
-- Guarantees:
--   1. Every budget references a category owned by the same user.
--   2. A referenced category cannot be deleted while budgets still point at it.
--   3. Existing orphan/cross-owner budget rows abort the migration; nothing is
--      auto-deleted or silently reassigned.
-- ============================================================================

BEGIN;

-- Block concurrent category/budget writes while validating and installing the
-- owner-safe relationship, so the preflight cannot race a new orphan row.
LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.budgets IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO v_invalid_count
  FROM public.budgets b
  LEFT JOIN public.categories c
    ON c.user_id = b.user_id
   AND c.id = b."categoryId"
  WHERE c.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'CATEGORY-INTEGRITY-1 blocked: % budget row(s) reference a missing or differently-owned category. Resolve them manually before retrying.',
      v_invalid_count;
  END IF;
END
$$;

-- Composite ownership key required by the composite budget FK. Category id is
-- already a primary key, but the pair makes same-user ownership explicit at
-- the relational boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.categories'::regclass
      AND conname = 'categories_user_id_id_key'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_user_id_id_key UNIQUE (user_id, id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.budgets'::regclass
      AND conname = 'budgets_category_owner_fk'
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_category_owner_fk
      FOREIGN KEY (user_id, "categoryId")
      REFERENCES public.categories(user_id, id)
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.budgets
  VALIDATE CONSTRAINT budgets_category_owner_fk;

COMMIT;
