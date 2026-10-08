-- ============================================================================
-- AI-2.3 - Pending action hardening
--
-- Must be applied after ai-2.2-pending-actions.sql.
-- Adds the runtime idempotency/CAS contract used by
-- aiPendingActionRepository.server.ts and aiWriteActionExecutor.server.ts.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.ai_pending_actions') IS NULL THEN
    RAISE EXCEPTION
      'AI-2.3 requires public.ai_pending_actions from AI-2.2';
  END IF;
END $$;

ALTER TABLE public.ai_pending_actions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

ALTER TABLE public.ai_pending_actions
  DROP CONSTRAINT IF EXISTS ai_pending_actions_status_check;

ALTER TABLE public.ai_pending_actions
  ADD CONSTRAINT ai_pending_actions_status_check CHECK (
    status IN (
      'pending',
      'confirmed',
      'executing',
      'completed',
      'cancelled',
      'expired',
      'failed'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ai_pending_actions'::regclass
      AND conname = 'ai_pending_actions_idempotency_key'
  ) THEN
    ALTER TABLE public.ai_pending_actions
      ADD CONSTRAINT ai_pending_actions_idempotency_key
      UNIQUE (user_id, idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_conversation
  ON public.ai_pending_actions (user_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_status_expires
  ON public.ai_pending_actions (user_id, status, expires_at);

ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_pending_actions_select ON public.ai_pending_actions;
DROP POLICY IF EXISTS ai_pending_actions_insert ON public.ai_pending_actions;
DROP POLICY IF EXISTS ai_pending_actions_update ON public.ai_pending_actions;
DROP POLICY IF EXISTS ai_pending_actions_delete ON public.ai_pending_actions;
CREATE POLICY ai_pending_actions_select ON public.ai_pending_actions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_pending_actions_insert ON public.ai_pending_actions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_pending_actions_update ON public.ai_pending_actions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_pending_actions_delete ON public.ai_pending_actions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.ai_pending_actions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_pending_actions TO authenticated;
