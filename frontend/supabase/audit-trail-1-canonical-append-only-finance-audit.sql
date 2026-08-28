-- AUDIT-TRAIL-1 - Canonical Append-only Finance Audit Log
-- Forward migration for an existing HOUSEHOLD-IDENTITY-1 database.
-- This ticket creates the authoritative audit event store and reusable trigger
-- functions. It intentionally does NOT attach audit capture triggers to finance
-- domain tables yet; that rollout belongs to AUDIT-MUTATION-1.

BEGIN;

-- BEGIN AUDIT-TRAIL-1 SHARED BODY
CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid        NOT NULL,
  finance_owner_user_id uuid        NOT NULL,
  actor_user_id         uuid        NOT NULL,
  actor_email           text,
  actor_role            text        NOT NULL,
  entity_type           text        NOT NULL,
  entity_id             text,
  action                text        NOT NULL,
  before_data           jsonb,
  after_data            jsonb,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  request_id            uuid,
  transaction_id        bigint      NOT NULL DEFAULT txid_current(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_audit_log_actor_role_check
    CHECK (actor_role IN ('owner','member','viewer')),
  CONSTRAINT finance_audit_log_entity_type_nonempty
    CHECK (trim(entity_type) <> ''),
  CONSTRAINT finance_audit_log_action_nonempty
    CHECK (trim(action) <> ''),
  CONSTRAINT finance_audit_log_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT finance_audit_log_payload_present
    CHECK (
      before_data IS NOT NULL
      OR after_data IS NOT NULL
      OR metadata <> '{}'::jsonb
    )
);

COMMENT ON TABLE public.finance_audit_log IS
  'Append-only household finance audit event store. Identity columns are server-stamped from auth.uid() and household membership. Actor/household identifiers intentionally remain snapshots rather than cascading foreign keys so historical attribution survives identity lifecycle changes.';

CREATE INDEX IF NOT EXISTS finance_audit_log_household_created_idx
  ON public.finance_audit_log (household_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS finance_audit_log_actor_created_idx
  ON public.finance_audit_log (household_id, actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_log_entity_created_idx
  ON public.finance_audit_log (household_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_log_transaction_idx
  ON public.finance_audit_log (household_id, transaction_id);
CREATE INDEX IF NOT EXISTS finance_audit_log_request_idx
  ON public.finance_audit_log (household_id, request_id)
  WHERE request_id IS NOT NULL;

-- Server-authoritative identity stamping. Even privileged internal insert paths
-- cannot choose another actor, role, household or historical timestamp while a
-- user request is executing; those values come from auth.uid() + membership.
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

  SELECT
    hm.household_id,
    h.owner_user_id,
    hm.role,
    lower(NULLIF(trim(COALESCE(u.email, '')), ''))
  INTO
    v_household_id,
    v_finance_owner_user_id,
    v_actor_role,
    v_actor_email
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  LEFT JOIN auth.users u ON u.id = hm.user_id
  WHERE hm.user_id = v_actor_user_id
  LIMIT 1;

  IF v_household_id IS NULL
     OR v_finance_owner_user_id IS NULL
     OR v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Finance audit actor is not a household member'
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

DROP TRIGGER IF EXISTS trg_finance_audit_log_stamp_insert
  ON public.finance_audit_log;
CREATE TRIGGER trg_finance_audit_log_stamp_insert
BEFORE INSERT ON public.finance_audit_log
FOR EACH ROW
EXECUTE FUNCTION public.stamp_finance_audit_log_insert();

-- Defense in depth for append-only semantics. RLS/table grants already deny
-- application UPDATE/DELETE, and this trigger also blocks privileged accidental
-- mutation paths that still fire normal triggers.
CREATE OR REPLACE FUNCTION public.reject_finance_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Finance audit log is append-only'
    USING ERRCODE = 'MFA03';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_finance_audit_log_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_audit_log_append_only_guard
  ON public.finance_audit_log;
CREATE TRIGGER trg_finance_audit_log_append_only_guard
BEFORE UPDATE OR DELETE ON public.finance_audit_log
FOR EACH ROW
EXECUTE FUNCTION public.reject_finance_audit_log_mutation();

-- Reusable row-trigger implementation for AUDIT-MUTATION-1. It performs the
-- audit INSERT directly and deliberately has no exception-swallowing block, so
-- once attached to a finance mutation, an audit failure aborts that same SQL
-- transaction instead of allowing unaudited state to commit.
CREATE OR REPLACE FUNCTION public.capture_finance_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR NOT (
       TG_TABLE_NAME = ANY (ARRAY[
         'wallets','categories','transactions','debts','goals','budgets','investments',
         'savings','saving_transactions','forex_accounts','forex_cash_transactions'
       ])
     ) THEN
    RAISE EXCEPTION 'Unsupported finance audit source table: %.%',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'MFA04';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSE
    RAISE EXCEPTION 'Unsupported finance audit operation: %', TG_OP
      USING ERRCODE = 'MFA05';
  END IF;

  v_entity_id := COALESCE(v_after->>'id', v_before->>'id');

  INSERT INTO public.finance_audit_log (
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    metadata
  )
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    lower(TG_OP),
    v_before,
    v_after,
    jsonb_build_object(
      'source', 'row_trigger',
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_finance_audit_row()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'finance_audit_log'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.finance_audit_log',
      r.policyname
    );
  END LOOP;
END $$;

CREATE POLICY finance_audit_log_household_select
ON public.finance_audit_log
FOR SELECT TO authenticated
USING (household_id = public.current_household_id());

-- Clients may read their current household history but cannot manufacture,
-- modify or remove audit events. Future finance mutation triggers write through
-- the SECURITY DEFINER capture function in the same transaction.
REVOKE ALL ON TABLE public.finance_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.finance_audit_log
  TO authenticated, service_role;
-- END AUDIT-TRAIL-1 SHARED BODY

COMMIT;
