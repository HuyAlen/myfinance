-- FOREX-BALANCE-ASOF-1
-- Persist observed broker Balance snapshots so historical Forex performance is
-- based on recorded facts, never reconstructed from today's Balance.
BEGIN;

CREATE TABLE IF NOT EXISTS public.forex_balance_snapshots (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forex_account_id      uuid        NOT NULL REFERENCES public.forex_accounts(id) ON DELETE CASCADE,
  balance               numeric     NOT NULL,
  source                text        NOT NULL,
  source_transaction_id uuid        REFERENCES public.forex_cash_transactions(id) ON DELETE SET NULL,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forex_balance_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT forex_balance_snapshots_balance_check CHECK (balance >= 0),
  CONSTRAINT forex_balance_snapshots_source_check CHECK (
    source IN ('manual','deposit','withdrawal','backfill')
  )
);

CREATE INDEX IF NOT EXISTS forex_balance_snapshots_user_account_captured_idx
  ON public.forex_balance_snapshots (user_id, forex_account_id, captured_at DESC, id DESC);

ALTER TABLE public.forex_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forex_balance_snapshots_household_select
  ON public.forex_balance_snapshots;
CREATE POLICY forex_balance_snapshots_household_select
  ON public.forex_balance_snapshots
  FOR SELECT TO authenticated
  USING (user_id = public.current_finance_scope_owner_user_id());

-- Snapshot history is append-only and DB-maintained. Browser clients may read
-- it, but future manual/cash mutations must write snapshots inside their
-- server-authoritative PostgreSQL transaction boundary.
REVOKE ALL ON TABLE public.forex_balance_snapshots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.forex_balance_snapshots TO authenticated;

-- Deployment baseline: record the Balance that is authoritative at cutover.
-- This intentionally does not fabricate older history. Accounts without an
-- entered Balance remain unknown historically until a real snapshot exists.
INSERT INTO public.forex_balance_snapshots (
  user_id,
  forex_account_id,
  balance,
  source,
  captured_at
)
SELECT
  fa.user_id,
  fa.id,
  fa.current_equity,
  'backfill',
  now()
FROM public.forex_accounts fa
WHERE fa.current_equity IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.forex_balance_snapshots existing
    WHERE existing.user_id = fa.user_id
      AND existing.forex_account_id = fa.id
  );

COMMIT;