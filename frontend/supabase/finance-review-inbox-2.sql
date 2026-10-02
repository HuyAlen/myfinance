-- FINANCE-REVIEW-INBOX-2
-- Durable, household-scoped review acknowledgement receipts.
-- Acknowledgements are keyed by transaction fingerprint so any edit to the
-- transaction naturally invalidates an old acknowledgement without deleting
-- provenance.

CREATE TABLE IF NOT EXISTS public.transaction_review_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id text NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  fingerprint text NOT NULL,
  actor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_review_ack_reason_check CHECK (
    reason IN (
      'uncategorized',
      'possible-duplicate',
      'unusual-expense',
      'category-type-mismatch'
    )
  ),
  CONSTRAINT transaction_review_ack_fingerprint_nonempty CHECK (
    char_length(trim(fingerprint)) > 0
  ),
  CONSTRAINT transaction_review_ack_unique
    UNIQUE (user_id, transaction_id, reason, fingerprint)
);

CREATE INDEX IF NOT EXISTS transaction_review_ack_user_created_idx
  ON public.transaction_review_acknowledgements (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_review_ack_transaction_idx
  ON public.transaction_review_acknowledgements (transaction_id, created_at DESC);

ALTER TABLE public.transaction_review_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_review_ack_select
  ON public.transaction_review_acknowledgements;
DROP POLICY IF EXISTS transaction_review_ack_insert
  ON public.transaction_review_acknowledgements;
DROP POLICY IF EXISTS transaction_review_ack_delete
  ON public.transaction_review_acknowledgements;

CREATE POLICY transaction_review_ack_select
ON public.transaction_review_acknowledgements
FOR SELECT TO authenticated
USING (user_id = public.current_finance_scope_owner_user_id());

CREATE POLICY transaction_review_ack_insert
ON public.transaction_review_acknowledgements
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.current_finance_write_owner_user_id()
  AND actor_user_id = auth.uid()
);

CREATE POLICY transaction_review_ack_delete
ON public.transaction_review_acknowledgements
FOR DELETE TO authenticated
USING (user_id = public.current_finance_write_owner_user_id());

REVOKE ALL ON TABLE public.transaction_review_acknowledgements
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.transaction_review_acknowledgements
  TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    ADD TABLE public.transaction_review_acknowledgements;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.transaction_review_acknowledgements IS
  'Durable Finance Review Inbox acknowledgement receipts. Fingerprints make stale acknowledgements self-invalidating after transaction edits.';
