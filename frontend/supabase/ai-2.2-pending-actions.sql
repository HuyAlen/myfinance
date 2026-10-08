-- ============================================================================
-- AI-2.2 - Persistent conversations, pending write actions, audit, and usage
--
-- Historical note:
-- This file was committed as an empty placeholder in the original squashed AI
-- delivery. It is reconstructed from the runtime repositories and the current
-- canonical supabase/schema.sql contract.
--
-- Apply before AI-2.3. The follow-up migration adds the idempotency/CAS
-- hardening columns and final pending-action status constraint.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  is_pinned       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,
  content         text        NOT NULL,
  provider        text,
  model           text,
  confidence      numeric,
  status          text        NOT NULL DEFAULT 'completed',
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_pkey PRIMARY KEY (id),
  CONSTRAINT ai_messages_role_check CHECK (role IN ('user','assistant')),
  CONSTRAINT ai_messages_provider_check CHECK (
    provider IS NULL OR provider IN ('local','openai','fallback')
  ),
  CONSTRAINT ai_messages_confidence_check CHECK (
    confidence IS NULL OR confidence BETWEEN 0 AND 1
  ),
  CONSTRAINT ai_messages_status_check CHECK (
    status IN ('pending','streaming','completed','stopped','error')
  )
);

CREATE TABLE IF NOT EXISTS public.ai_pending_actions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid        REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  tool_name       text        NOT NULL,
  arguments       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  preview         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'pending',
  result          jsonb,
  error_message   text,
  old_value       jsonb,
  new_value       jsonb,
  expires_at      timestamptz NOT NULL,
  confirmed_at    timestamptz,
  executed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_pending_actions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_pending_actions_status_check CHECK (
    status IN ('pending','confirmed','completed','cancelled','expired','failed')
  )
);

CREATE TABLE IF NOT EXISTS public.ai_action_audit_logs (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_action_id uuid        NOT NULL REFERENCES public.ai_pending_actions(id) ON DELETE CASCADE,
  conversation_id   uuid        REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  tool_name         text        NOT NULL,
  status            text        NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  result            jsonb,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_action_audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid        REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  provider        text        NOT NULL,
  model           text,
  request_type    text        NOT NULL DEFAULT 'chat',
  input_tokens    integer     NOT NULL DEFAULT 0,
  output_tokens   integer     NOT NULL DEFAULT 0,
  total_tokens    integer     NOT NULL DEFAULT 0,
  latency_ms      integer,
  status          text        NOT NULL DEFAULT 'completed',
  error_code      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_usage_logs_tokens_nonnegative CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0
  ),
  CONSTRAINT ai_usage_logs_latency_nonnegative CHECK (
    latency_ms IS NULL OR latency_ms >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_last_message
  ON public.ai_conversations (user_id, is_pinned DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_conversation
  ON public.ai_pending_actions (user_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_user_created
  ON public.ai_action_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON public.ai_usage_logs (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_ai_pending_actions_updated_at ON public.ai_pending_actions;
CREATE TRIGGER trg_ai_pending_actions_updated_at
  BEFORE UPDATE ON public.ai_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_select ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_insert ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_update ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conversations_delete ON public.ai_conversations;
CREATE POLICY ai_conversations_select ON public.ai_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_conversations_insert ON public.ai_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_conversations_update ON public.ai_conversations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_conversations_delete ON public.ai_conversations
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_messages_select ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_insert ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_update ON public.ai_messages;
DROP POLICY IF EXISTS ai_messages_delete ON public.ai_messages;
CREATE POLICY ai_messages_select ON public.ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_insert ON public.ai_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_update ON public.ai_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_delete ON public.ai_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

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

DROP POLICY IF EXISTS ai_action_audit_logs_select ON public.ai_action_audit_logs;
DROP POLICY IF EXISTS ai_action_audit_logs_insert ON public.ai_action_audit_logs;
DROP POLICY IF EXISTS ai_action_audit_logs_delete ON public.ai_action_audit_logs;
CREATE POLICY ai_action_audit_logs_select ON public.ai_action_audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_action_audit_logs_insert ON public.ai_action_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_action_audit_logs_delete ON public.ai_action_audit_logs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_usage_logs_select ON public.ai_usage_logs;
DROP POLICY IF EXISTS ai_usage_logs_insert ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_select ON public.ai_usage_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_usage_logs_insert ON public.ai_usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE
  public.ai_conversations,
  public.ai_messages,
  public.ai_pending_actions,
  public.ai_action_audit_logs,
  public.ai_usage_logs
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.ai_conversations,
  public.ai_messages,
  public.ai_pending_actions
TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ai_action_audit_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.ai_usage_logs TO authenticated;
