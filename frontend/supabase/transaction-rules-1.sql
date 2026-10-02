-- TRANSACTION-RULES-1
-- User-configurable, household-scoped transaction classification/routing rules.
-- Rules never write transactions by themselves. Manual entry requires explicit
-- "Apply suggestion"; CSV rules are materialized only in preview before import.

CREATE TABLE IF NOT EXISTS public.transaction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  transaction_type text NOT NULL,
  note_contains text,
  wallet_id text REFERENCES public.wallets(id) ON DELETE RESTRICT,
  amount_min numeric,
  amount_max numeric,
  action_category_id text REFERENCES public.categories(id) ON DELETE RESTRICT,
  action_wallet_id text REFERENCES public.wallets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_rules_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT transaction_rules_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT transaction_rules_priority_check CHECK (priority BETWEEN 0 AND 9999),
  CONSTRAINT transaction_rules_type_check CHECK (transaction_type IN ('income','expense')),
  CONSTRAINT transaction_rules_amount_min_check CHECK (amount_min IS NULL OR amount_min >= 0),
  CONSTRAINT transaction_rules_amount_max_check CHECK (amount_max IS NULL OR amount_max >= 0),
  CONSTRAINT transaction_rules_amount_range_check CHECK (
    amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max
  ),
  CONSTRAINT transaction_rules_action_check CHECK (
    action_category_id IS NOT NULL OR action_wallet_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS transaction_rules_user_priority_idx
  ON public.transaction_rules (user_id, enabled DESC, priority ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS transaction_rules_wallet_idx
  ON public.transaction_rules (wallet_id)
  WHERE wallet_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_transaction_rules_updated_at ON public.transaction_rules;
CREATE TRIGGER trg_transaction_rules_updated_at
BEFORE UPDATE ON public.transaction_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_rules_select ON public.transaction_rules;
DROP POLICY IF EXISTS transaction_rules_insert ON public.transaction_rules;
DROP POLICY IF EXISTS transaction_rules_update ON public.transaction_rules;
DROP POLICY IF EXISTS transaction_rules_delete ON public.transaction_rules;

CREATE POLICY transaction_rules_select
ON public.transaction_rules
FOR SELECT TO authenticated
USING (user_id = public.current_finance_scope_owner_user_id());

CREATE POLICY transaction_rules_insert
ON public.transaction_rules
FOR INSERT TO authenticated
WITH CHECK (user_id = public.current_finance_write_owner_user_id());

CREATE POLICY transaction_rules_update
ON public.transaction_rules
FOR UPDATE TO authenticated
USING (user_id = public.current_finance_write_owner_user_id())
WITH CHECK (user_id = public.current_finance_write_owner_user_id());

CREATE POLICY transaction_rules_delete
ON public.transaction_rules
FOR DELETE TO authenticated
USING (user_id = public.current_finance_write_owner_user_id());

REVOKE ALL ON TABLE public.transaction_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transaction_rules TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_rules;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.transaction_rules IS
  'Household-scoped transaction suggestion rules. Rules are advisory until explicitly applied/confirmed by the user.';
