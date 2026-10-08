-- ============================================================================
-- AI-BYOK-1.6 - Encrypted provider key storage and connection diagnostics
--
-- Historical note:
-- ai_user_settings originally stored provider API keys in plaintext `api_key`.
-- This migration keeps that legacy column for compatibility but all new runtime
-- writes use AES-256-GCM payload fields. Existing plaintext values are NOT
-- transformed in SQL because the application encryption secret is intentionally
-- not available to the database.
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

CREATE TABLE IF NOT EXISTS public.ai_user_settings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text        NOT NULL DEFAULT 'local',
  api_key               text,
  encrypted_api_key     text,
  api_key_iv            text,
  api_key_auth_tag      text,
  api_key_hint          text,
  model                 text        NOT NULL DEFAULT 'gpt-4.1-mini',
  temperature           numeric     NOT NULL DEFAULT 0.2,
  max_tokens            integer     NOT NULL DEFAULT 4096,
  fallback_local        boolean     NOT NULL DEFAULT true,
  no_fabrication        boolean     NOT NULL DEFAULT true,
  send_finance_context  boolean     NOT NULL DEFAULT true,
  send_rule_insights    boolean     NOT NULL DEFAULT true,
  connection_status     text        NOT NULL DEFAULT 'not_tested',
  last_tested_at        timestamptz,
  last_test_latency_ms  integer,
  last_test_error       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT ai_user_settings_user_key UNIQUE (user_id),
  CONSTRAINT ai_user_settings_provider_check CHECK (provider IN ('openai','local')),
  CONSTRAINT ai_user_settings_temperature_check CHECK (temperature BETWEEN 0 AND 2),
  CONSTRAINT ai_user_settings_max_tokens_check CHECK (max_tokens BETWEEN 256 AND 32768),
  CONSTRAINT ai_user_settings_connection_status_check CHECK (
    connection_status IN ('not_tested','connected','invalid','error')
  )
);

ALTER TABLE public.ai_user_settings
  ADD COLUMN IF NOT EXISTS encrypted_api_key text,
  ADD COLUMN IF NOT EXISTS api_key_iv text,
  ADD COLUMN IF NOT EXISTS api_key_auth_tag text,
  ADD COLUMN IF NOT EXISTS api_key_hint text,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'not_tested',
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_latency_ms integer,
  ADD COLUMN IF NOT EXISTS last_test_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_user_settings'::regclass
      AND conname = 'ai_user_settings_user_key'
  ) THEN
    ALTER TABLE public.ai_user_settings
      ADD CONSTRAINT ai_user_settings_user_key UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_user_settings'::regclass
      AND conname = 'ai_user_settings_provider_check'
  ) THEN
    ALTER TABLE public.ai_user_settings
      ADD CONSTRAINT ai_user_settings_provider_check
      CHECK (provider IN ('openai','local'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_user_settings'::regclass
      AND conname = 'ai_user_settings_temperature_check'
  ) THEN
    ALTER TABLE public.ai_user_settings
      ADD CONSTRAINT ai_user_settings_temperature_check
      CHECK (temperature BETWEEN 0 AND 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_user_settings'::regclass
      AND conname = 'ai_user_settings_max_tokens_check'
  ) THEN
    ALTER TABLE public.ai_user_settings
      ADD CONSTRAINT ai_user_settings_max_tokens_check
      CHECK (max_tokens BETWEEN 256 AND 32768);
  END IF;
END $$;

ALTER TABLE public.ai_user_settings
  DROP CONSTRAINT IF EXISTS ai_user_settings_connection_status_check;
ALTER TABLE public.ai_user_settings
  ADD CONSTRAINT ai_user_settings_connection_status_check CHECK (
    connection_status IN ('not_tested','connected','invalid','error')
  );

DROP TRIGGER IF EXISTS trg_ai_user_settings_updated_at ON public.ai_user_settings;
CREATE TRIGGER trg_ai_user_settings_updated_at
  BEFORE UPDATE ON public.ai_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ai_user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_user_settings_select ON public.ai_user_settings;
DROP POLICY IF EXISTS ai_user_settings_insert ON public.ai_user_settings;
DROP POLICY IF EXISTS ai_user_settings_update ON public.ai_user_settings;
DROP POLICY IF EXISTS ai_user_settings_delete ON public.ai_user_settings;
CREATE POLICY ai_user_settings_select ON public.ai_user_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_user_settings_insert ON public.ai_user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_user_settings_update ON public.ai_user_settings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.ai_user_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_user_settings TO authenticated;

COMMENT ON COLUMN public.ai_user_settings.api_key IS
  'Legacy plaintext provider key. New application writes must keep this NULL and use encrypted_api_key/api_key_iv/api_key_auth_tag.';
