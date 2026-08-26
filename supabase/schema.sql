-- ============================================================================
-- MyFinance - Canonical Supabase Schema (DB-SSOT-1)
--
-- This file is the single clean-install source of truth for the CURRENT
-- MyFinance database contract. Historical/incremental SQL lives under
-- frontend/supabase/ and must not be treated as a second complete schema.
--
-- Bootstrap semantics:
--   * intended for a fresh Supabase project / disposable local database;
--   * deliberately does not pretend CREATE TABLE IF NOT EXISTS can migrate a
--     stale production table to this shape;
--   * existing databases must use reviewed forward migrations and the
--     read-only verification queries in supabase/schema-verification.sql.
--
-- Security baseline:
--   * no public read/write policies;
--   * user-owned rows are scoped by auth.uid();
--   * Finance Engine, Savings, and backup RPCs are SECURITY INVOKER; the
--     currently deployed Forex cash RPCs are SECURITY DEFINER with explicit
--     auth.uid()/ownership checks; all mutation RPCs are executable only by
--     authenticated users in this canonical baseline.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------------
-- Database enums. Values below are reconciled against the live DB-SSOT-1
-- enum verification output. transaction_type intentionally includes the
-- legacy/current persisted saving and investment values in addition to the
-- Finance Engine's income/expense/transfer mutation surface.
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE wallet_type AS ENUM ('cash', 'bank', 'ewallet', 'investment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE category_type AS ENUM ('income', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer', 'saving', 'investment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recurrence_freq AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE investment_type AS ENUM ('stock', 'crypto', 'fund', 'gold', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- --------------------------------------------------------------------------
-- Core finance tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  id         text          NOT NULL,
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text          NOT NULL,
  type       wallet_type   NOT NULL DEFAULT 'cash',
  balance    numeric(15,2) NOT NULL DEFAULT 0,
  currency   text          NOT NULL DEFAULT 'VND',
  created_at timestamptz   NOT NULL DEFAULT now(),
  updated_at timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT wallets_pkey PRIMARY KEY (id),
  CONSTRAINT wallets_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT wallets_balance_nn CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id                text          NOT NULL,
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text          NOT NULL,
  type              category_type NOT NULL,
  planning_group    text,
  financial_group   text,
  is_recurring      boolean       NOT NULL DEFAULT false,
  recurrence        text,
  default_amount    numeric(15,2),
  default_wallet_id text,
  next_run_date     date,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_id_key UNIQUE (user_id, id),
  CONSTRAINT categories_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT categories_planning_group_check CHECK (
    planning_group IS NULL OR planning_group IN ('income','fixed','variable','saving','investment')
  ),
  CONSTRAINT categories_financial_group_check CHECK (
    financial_group IS NULL OR financial_group IN ('income','needs','wants','saving')
  ),
  CONSTRAINT categories_default_amount_check CHECK (
    default_amount IS NULL OR default_amount > 0
  ),
  CONSTRAINT categories_recurrence_check CHECK (
    recurrence IS NULL OR recurrence IN ('daily','weekly','monthly','yearly')
  ),
  CONSTRAINT categories_default_wallet_fk
    FOREIGN KEY (default_wallet_id) REFERENCES public.wallets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id                      text             NOT NULL,
  user_id                 uuid             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                    transaction_type NOT NULL,
  amount                  numeric(15,2)    NOT NULL,
  "categoryId"            text             NOT NULL DEFAULT '',
  "walletId"              text             NOT NULL,
  note                    text             NOT NULL DEFAULT '',
  date                    date             NOT NULL,
  "transferToWalletId"    text,
  "isRecurring"           boolean          NOT NULL DEFAULT false,
  recurrence              recurrence_freq,
  "nextRunDate"           date,
  transfer_fee            numeric,
  exchange_rate           numeric,
  transfer_reference      text,
  transfer_reference_type text,
  source_type             text,
  destination_type        text,
  created_at              timestamptz      NOT NULL DEFAULT now(),
  updated_at              timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT transactions_recurring_needs_freq CHECK (
    "isRecurring" = false OR recurrence IS NOT NULL
  ),
  CONSTRAINT transactions_transfer_needs_dest CHECK (
    type <> 'transfer'
    OR transfer_reference_type IN ('saving','investment','debt')
    OR "transferToWalletId" IS NOT NULL
  ),
  CONSTRAINT transactions_transfer_wallets_differ CHECK (
    type <> 'transfer' OR "walletId" <> "transferToWalletId"
  )
);

CREATE TABLE IF NOT EXISTS public.debts (
  id                text          NOT NULL,
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text          NOT NULL,
  "totalAmount"     numeric(15,2) NOT NULL,
  "remainingAmount" numeric(15,2) NOT NULL DEFAULT 0,
  "interestRate"    numeric(5,2),
  "minimumPayment"  numeric(15,2),
  "dueDate"         date,
  "loanTermMonths"  smallint,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT debts_pkey PRIMARY KEY (id),
  CONSTRAINT debts_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT debts_total_positive CHECK ("totalAmount" > 0),
  CONSTRAINT debts_remaining_nonneg CHECK ("remainingAmount" >= 0),
  CONSTRAINT debts_remaining_lte_total CHECK ("remainingAmount" <= "totalAmount"),
  CONSTRAINT debts_interest_nonneg CHECK ("interestRate" IS NULL OR "interestRate" >= 0),
  CONSTRAINT debts_minimum_payment_nonneg CHECK ("minimumPayment" IS NULL OR "minimumPayment" >= 0),
  CONSTRAINT debts_loan_term_positive CHECK ("loanTermMonths" IS NULL OR "loanTermMonths" > 0)
);

CREATE TABLE IF NOT EXISTS public.goals (
  id                  text          NOT NULL,
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text          NOT NULL,
  "targetAmount"      numeric(15,2) NOT NULL,
  "currentAmount"     numeric(15,2) NOT NULL DEFAULT 0,
  saving_category_ids text[]        NOT NULL DEFAULT '{}'::text[],
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT goals_target_positive CHECK ("targetAmount" > 0),
  CONSTRAINT goals_current_nonneg CHECK ("currentAmount" >= 0)
);

CREATE TABLE IF NOT EXISTS public.budgets (
  id                  text          NOT NULL,
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "categoryId"        text          NOT NULL,
  month               text          NOT NULL,
  "limitAmount"       numeric(15,2) NOT NULL,
  "rolloverAmount"    numeric(15,2) NOT NULL DEFAULT 0,
  "warningThreshold"  numeric(5,2),
  "criticalThreshold" numeric(5,2),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_category_owner_fk FOREIGN KEY (user_id, "categoryId") REFERENCES public.categories(user_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT budgets_month_format CHECK (month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT budgets_limit_positive CHECK ("limitAmount" > 0),
  CONSTRAINT budgets_rollover_nonneg CHECK ("rolloverAmount" >= 0),
  CONSTRAINT budgets_warning_range CHECK ("warningThreshold" IS NULL OR "warningThreshold" BETWEEN 0 AND 100),
  CONSTRAINT budgets_critical_range CHECK ("criticalThreshold" IS NULL OR "criticalThreshold" BETWEEN 0 AND 100),
  CONSTRAINT budgets_unique_category_month UNIQUE (user_id, "categoryId", month)
);

CREATE TABLE IF NOT EXISTS public.investments (
  id               text            NOT NULL,
  user_id          uuid            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text            NOT NULL,
  type             investment_type NOT NULL,
  symbol           text,
  "investedAmount" numeric(15,2)   NOT NULL,
  "currentValue"   numeric(15,2)   NOT NULL DEFAULT 0,
  "purchaseDate"   date,
  notes            text,
  quantity         numeric(18,8),
  "averageCost"    numeric(15,2),
  "currentPrice"   numeric(15,2),
  created_at       timestamptz     NOT NULL DEFAULT now(),
  updated_at       timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT investments_pkey PRIMARY KEY (id),
  CONSTRAINT investments_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT investments_invested_positive CHECK ("investedAmount" > 0),
  CONSTRAINT investments_value_nonneg CHECK ("currentValue" >= 0),
  CONSTRAINT investments_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT investments_avg_cost_nonneg CHECK ("averageCost" IS NULL OR "averageCost" >= 0),
  CONSTRAINT investments_price_nonneg CHECK ("currentPrice" IS NULL OR "currentPrice" >= 0)
);

-- --------------------------------------------------------------------------
-- Savings - UUID/type/balance/cardinality/default/FK facts below are now
-- reconciled against current live DB-SSOT-1 metadata. wallet_id and updated_at
-- are both present in the deployed table; the earlier apparent omission was
-- caused by a Supabase SQL Editor result cap, not an actual schema difference.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid          DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text          NOT NULL,
  type          text          NOT NULL,
  balance       numeric       NOT NULL DEFAULT 0,
  wallet_id     text,
  interest_rate numeric,
  maturity_date date,
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT savings_pkey PRIMARY KEY (id),
  CONSTRAINT savings_type_check CHECK (
    type IN ('savings_account','term_deposit','certificate','emergency_fund')
  ),
  CONSTRAINT savings_balance_check CHECK (balance >= 0),
  CONSTRAINT savings_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.wallets(id)
);

CREATE TABLE IF NOT EXISTS public.saving_transactions (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  saving_id        uuid        NOT NULL REFERENCES public.savings(id) ON DELETE CASCADE,
  user_id          uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type             text        NOT NULL,
  amount           numeric     NOT NULL,
  transaction_date date        NOT NULL DEFAULT CURRENT_DATE,
  note             text,
  wallet_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saving_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT saving_transactions_type_check CHECK (
    type IN ('deposit','withdraw','interest','settlement')
  ),
  CONSTRAINT saving_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT saving_transactions_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.wallets(id)
);

-- --------------------------------------------------------------------------
-- Forex persistence. Column types/nullability/defaults below are reconciled
-- against the live DB-SSOT-1 metadata output. UUID identifiers are intentional.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forex_accounts (
  id             uuid        NOT NULL,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  broker         text        NOT NULL,
  account_number text,
  currency       text        NOT NULL DEFAULT 'VND',
  status         text        NOT NULL DEFAULT 'active',
  opened_at      date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  current_equity numeric,
  CONSTRAINT forex_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT forex_accounts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT forex_accounts_status_check CHECK (status IN ('active','inactive','archived'))
);

CREATE TABLE IF NOT EXISTS public.forex_cash_transactions (
  id                uuid        NOT NULL,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forex_account_id  uuid        NOT NULL REFERENCES public.forex_accounts(id) ON DELETE CASCADE,
  type              text        NOT NULL,
  amount            numeric     NOT NULL,
  currency          text        NOT NULL DEFAULT 'VND',
  fee               numeric     NOT NULL DEFAULT 0,
  transaction_date  date        NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  wallet_id         text,
  transaction_time  time        NOT NULL DEFAULT LOCALTIME,
  transacted_at     timestamptz,
  CONSTRAINT forex_cash_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT forex_cash_transactions_type_check CHECK (type IN ('deposit','withdrawal')),
  CONSTRAINT forex_cash_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT forex_cash_transactions_fee_check CHECK (fee >= 0),
  CONSTRAINT forex_cash_transactions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT forex_cash_transactions_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE RESTRICT
);

-- --------------------------------------------------------------------------
-- AI persistence used by the server-side AI agent.
-- --------------------------------------------------------------------------
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
  CONSTRAINT ai_messages_provider_check CHECK (provider IS NULL OR provider IN ('local','openai','fallback')),
  CONSTRAINT ai_messages_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT ai_messages_status_check CHECK (status IN ('pending','streaming','completed','stopped','error'))
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
  idempotency_key text,
  expires_at      timestamptz NOT NULL,
  confirmed_at    timestamptz,
  executed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_pending_actions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_pending_actions_idempotency_key UNIQUE (user_id, idempotency_key),
  CONSTRAINT ai_pending_actions_status_check CHECK (
    status IN ('pending','confirmed','executing','completed','cancelled','expired','failed')
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
  CONSTRAINT ai_usage_logs_latency_nonnegative CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories (user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_recurring_next_run ON public.categories (user_id, next_run_date) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON public.categories (user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON public.transactions (user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON public.transactions (user_id, "walletId");
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions (user_id, "categoryId");
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON public.transactions (user_id, "isRecurring", "nextRunDate") WHERE "isRecurring" = true;
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON public.debts (user_id);
CREATE INDEX IF NOT EXISTS idx_debts_due_date ON public.debts (user_id, "dueDate") WHERE "dueDate" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals (user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets (user_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_user_category ON public.budgets (user_id, "categoryId");
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON public.investments (user_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_type ON public.investments (user_id, type);
CREATE INDEX IF NOT EXISTS idx_savings_wallet_id ON public.savings (wallet_id);
CREATE INDEX IF NOT EXISTS savings_user_id_created_at_idx ON public.savings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saving_transactions_wallet_id ON public.saving_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS saving_transactions_saving_id_date_idx ON public.saving_transactions (saving_id, transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS forex_accounts_user_id_idx ON public.forex_accounts (user_id);
CREATE INDEX IF NOT EXISTS forex_cash_transactions_account_date_idx ON public.forex_cash_transactions (forex_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS forex_cash_transactions_user_id_idx ON public.forex_cash_transactions (user_id);
CREATE INDEX IF NOT EXISTS forex_cash_transactions_wallet_id_idx ON public.forex_cash_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_last_message ON public.ai_conversations (user_id, is_pinned DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON public.ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_conversation ON public.ai_pending_actions (user_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_status_expires ON public.ai_pending_actions (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_user_created ON public.ai_action_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON public.ai_usage_logs (user_id, created_at DESC);

-- --------------------------------------------------------------------------
-- updated_at triggers
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','forex_accounts','forex_cash_transactions','ai_user_settings',
    'ai_conversations','ai_pending_actions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      'trg_' || t || '_updated_at', t
    );
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- RLS and authenticated table privileges
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments',
    'savings','saving_transactions','forex_accounts','forex_cash_transactions',
    'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
    'ai_action_audit_logs','ai_usage_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'wallets','categories','transactions','debts','goals','budgets','investments',
        'savings','saving_transactions','forex_accounts','forex_cash_transactions',
        'ai_user_settings','ai_conversations','ai_messages','ai_pending_actions',
        'ai_action_audit_logs','ai_usage_logs'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- RLS policy names are normalized in this clean baseline. The live database
-- contains redundant case-variant copies for ai_conversations/ai_messages;
-- those duplicates do not change effective access and are intentionally not
-- reproduced here. Where live pg_policies uses role PUBLIC, CREATE POLICY's
-- default role is kept. Policies that are explicitly authenticated-only live
-- are declared TO authenticated below.
--
-- Core finance tables use auth.uid() ownership for all CRUD. On their live
-- UPDATE policies WITH CHECK is omitted; PostgreSQL therefore reuses USING as
-- WITH CHECK, so the effective rule is still auth.uid() = user_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallets','categories','transactions','debts','goals','budgets','investments'
  ]
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)', t || '_delete', t);
  END LOOP;
END $$;

-- These direct-owned tables have explicit live UPDATE WITH CHECK expressions.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['savings','forex_accounts','ai_conversations']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)', t || '_delete', t);
  END LOOP;
END $$;

-- Saving ledger inserts must also prove ownership of the referenced saving.
CREATE POLICY saving_transactions_select ON public.saving_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY saving_transactions_insert ON public.saving_transactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.savings s
      WHERE s.id = saving_transactions.saving_id
        AND s.user_id = auth.uid()
    )
  );
CREATE POLICY saving_transactions_update ON public.saving_transactions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY saving_transactions_delete ON public.saving_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Forex cash writes must also prove ownership of the referenced Forex account.
CREATE POLICY forex_cash_transactions_select ON public.forex_cash_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY forex_cash_transactions_insert ON public.forex_cash_transactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.forex_accounts account
      WHERE account.id = forex_cash_transactions.forex_account_id
        AND account.user_id = auth.uid()
    )
  );
CREATE POLICY forex_cash_transactions_update ON public.forex_cash_transactions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.forex_accounts account
      WHERE account.id = forex_cash_transactions.forex_account_id
        AND account.user_id = auth.uid()
    )
  );
CREATE POLICY forex_cash_transactions_delete ON public.forex_cash_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- AI settings are read/create/update only in the live RLS contract (no DELETE
-- policy). The table privilege layer is verified separately below this ticket.
CREATE POLICY ai_user_settings_select ON public.ai_user_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_user_settings_insert ON public.ai_user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_user_settings_update ON public.ai_user_settings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pending actions: live INSERT/DELETE policies are explicitly authenticated;
-- SELECT/UPDATE use the default PUBLIC policy role but remain auth.uid()-scoped.
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

CREATE POLICY ai_messages_select ON public.ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_insert ON public.ai_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_update ON public.ai_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY ai_messages_delete ON public.ai_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY ai_action_audit_logs_select ON public.ai_action_audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_action_audit_logs_insert ON public.ai_action_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_action_audit_logs_delete ON public.ai_action_audit_logs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY ai_usage_logs_select ON public.ai_usage_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_usage_logs_insert ON public.ai_usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Supabase projects may carry broad default ACLs for anon/authenticated. RLS is
-- still the row-security boundary, but the canonical baseline also removes
-- privileges the application does not need (especially TRUNCATE/TRIGGER and
-- anonymous table access) so a fresh bootstrap is deterministic and least-
-- privilege instead of inheriting project defaults.
REVOKE ALL ON TABLE
  public.wallets,
  public.categories,
  public.transactions,
  public.debts,
  public.goals,
  public.budgets,
  public.investments,
  public.savings,
  public.saving_transactions,
  public.forex_accounts,
  public.forex_cash_transactions,
  public.ai_user_settings,
  public.ai_conversations,
  public.ai_messages,
  public.ai_pending_actions,
  public.ai_action_audit_logs,
  public.ai_usage_logs
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.wallets,
  public.categories,
  public.transactions,
  public.debts,
  public.goals,
  public.budgets,
  public.investments,
  public.savings,
  public.saving_transactions,
  public.forex_accounts,
  public.forex_cash_transactions,
  public.ai_conversations,
  public.ai_messages,
  public.ai_pending_actions
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_user_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ai_action_audit_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.ai_usage_logs TO authenticated;

-- --------------------------------------------------------------------------
-- Default categories on signup.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.categories (id, user_id, name, type, planning_group) VALUES
    (gen_random_uuid()::text, NEW.id, 'Lương',          'income',  'income'),
    (gen_random_uuid()::text, NEW.id, 'Thưởng',         'income',  'income'),
    (gen_random_uuid()::text, NEW.id, 'Freelance',       'income',  'income'),
    (gen_random_uuid()::text, NEW.id, 'Đầu tư',         'income',  'income'),
    (gen_random_uuid()::text, NEW.id, 'Thu nhập khác',  'income',  'income'),
    (gen_random_uuid()::text, NEW.id, 'Ăn uống',        'expense', 'variable'),
    (gen_random_uuid()::text, NEW.id, 'Nhà ở',          'expense', 'fixed'),
    (gen_random_uuid()::text, NEW.id, 'Di chuyển',      'expense', 'variable'),
    (gen_random_uuid()::text, NEW.id, 'Mua sắm',        'expense', 'variable'),
    (gen_random_uuid()::text, NEW.id, 'Sức khỏe',       'expense', 'variable'),
    (gen_random_uuid()::text, NEW.id, 'Giáo dục',       'expense', 'fixed'),
    (gen_random_uuid()::text, NEW.id, 'Giải trí',       'expense', 'variable'),
    (gen_random_uuid()::text, NEW.id, 'Hóa đơn & phí', 'expense', 'fixed'),
    (gen_random_uuid()::text, NEW.id, 'Tiết kiệm',      'expense', 'saving'),
    (gen_random_uuid()::text, NEW.id, 'Khác',           'expense', 'variable');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_categories_on_signup ON auth.users;
CREATE TRIGGER trg_seed_categories_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();

-- --------------------------------------------------------------------------
-- Realtime publication. Supabase owns the publication itself; add only when
-- it exists, and skip tables that are already members so re-running is safe.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'wallets','categories','transactions','debts','goals','budgets','investments',
      'forex_accounts','forex_cash_transactions'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- Atomic Forex cash movement RPCs.
--
-- DB-SSOT-1 live verification proves these three deployed functions currently
-- use UUID identifiers and SECURITY DEFINER (not SECURITY INVOKER), with
-- SET search_path = public and explicit auth.uid()/row-ownership checks in the
-- body. Their fee semantics are also part of the deployed contract: deposits
-- debit amount + fee; withdrawals credit amount - fee. This baseline mirrors
-- that current behavior rather than silently redesigning it.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_forex_cash_transaction(p_id uuid, p_forex_account_id uuid, p_wallet_id text, p_type text, p_amount numeric, p_currency text, p_fee numeric, p_transaction_date date, p_transaction_time time without time zone, p_notes text)
 RETURNS forex_cash_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_account public.forex_accounts%rowtype;
  v_result public.forex_cash_transactions%rowtype;
  v_amount numeric := coalesce(p_amount, 0);
  v_fee numeric := coalesce(p_fee, 0);
  v_wallet_delta numeric;
begin
  if v_user_id is null then
    raise exception 'Không có phiên đăng nhập.';
  end if;

  if p_type not in ('deposit', 'withdrawal') then
    raise exception 'Loại giao dịch Forex không hợp lệ.';
  end if;

  if v_amount <= 0 then
    raise exception 'Số tiền phải lớn hơn 0.';
  end if;

  if v_fee < 0 then
    raise exception 'Phí không được nhỏ hơn 0.';
  end if;

  if p_type = 'withdrawal' and v_fee >= v_amount then
    raise exception 'Phí rút phải nhỏ hơn số tiền rút.';
  end if;

  if upper(coalesce(p_currency, 'VND')) <> 'VND' then
    raise exception 'Forex Cash chỉ hỗ trợ VND.';
  end if;

  select *
  into v_account
  from public.forex_accounts
  where id = p_forex_account_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy tài khoản Forex.';
  end if;

  select *
  into v_wallet
  from public.wallets
  where id = p_wallet_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ví liên kết.';
  end if;

  if p_type = 'deposit' then
    v_wallet_delta := -(v_amount + v_fee);
  else
    v_wallet_delta := v_amount - v_fee;
  end if;

  if v_wallet.balance + v_wallet_delta < 0 then
    raise exception 'Số dư ví không đủ để thực hiện giao dịch Forex.';
  end if;

  update public.wallets
  set balance = balance + v_wallet_delta
  where id = p_wallet_id
    and user_id = v_user_id;

  insert into public.forex_cash_transactions (
    id,
    user_id,
    forex_account_id,
    wallet_id,
    type,
    amount,
    currency,
    fee,
    transaction_date,
    transaction_time,
    notes
  )
  values (
    p_id,
    v_user_id,
    p_forex_account_id,
    p_wallet_id,
    p_type,
    v_amount,
    'VND',
    v_fee,
    p_transaction_date,
    coalesce(p_transaction_time, localtime),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_result;

  return v_result;
end;
$function$

REVOKE ALL ON FUNCTION public.create_forex_cash_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_forex_cash_transaction TO authenticated;

CREATE OR REPLACE FUNCTION public.update_forex_cash_transaction(p_id uuid, p_forex_account_id uuid, p_wallet_id text, p_type text, p_amount numeric, p_currency text, p_fee numeric, p_transaction_date date, p_transaction_time time without time zone, p_notes text)
 RETURNS forex_cash_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old public.forex_cash_transactions%rowtype;
  v_account public.forex_accounts%rowtype;
  v_old_wallet public.wallets%rowtype;
  v_new_wallet public.wallets%rowtype;
  v_result public.forex_cash_transactions%rowtype;
  v_amount numeric := coalesce(p_amount, 0);
  v_fee numeric := coalesce(p_fee, 0);
  v_reverse_old_delta numeric;
  v_apply_new_delta numeric;
  v_same_wallet_balance numeric;
begin
  if v_user_id is null then
    raise exception 'Không có phiên đăng nhập.';
  end if;

  if p_type not in ('deposit', 'withdrawal') then
    raise exception 'Loại giao dịch Forex không hợp lệ.';
  end if;

  if v_amount <= 0 then
    raise exception 'Số tiền phải lớn hơn 0.';
  end if;

  if v_fee < 0 then
    raise exception 'Phí không được nhỏ hơn 0.';
  end if;

  if p_type = 'withdrawal' and v_fee >= v_amount then
    raise exception 'Phí rút phải nhỏ hơn số tiền rút.';
  end if;

  if upper(coalesce(p_currency, 'VND')) <> 'VND' then
    raise exception 'Forex Cash chỉ hỗ trợ VND.';
  end if;

  select *
  into v_old
  from public.forex_cash_transactions
  where id = p_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy giao dịch Forex cần cập nhật.';
  end if;

  select *
  into v_account
  from public.forex_accounts
  where id = p_forex_account_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy tài khoản Forex.';
  end if;

  select *
  into v_old_wallet
  from public.wallets
  where id = v_old.wallet_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ví cũ của giao dịch.';
  end if;

  if p_wallet_id = v_old.wallet_id then
    v_new_wallet := v_old_wallet;
  else
    select *
    into v_new_wallet
    from public.wallets
    where id = p_wallet_id
      and user_id = v_user_id
    for update;

    if not found then
      raise exception 'Không tìm thấy ví mới của giao dịch.';
    end if;
  end if;

  if v_old.type = 'deposit' then
    v_reverse_old_delta :=
      coalesce(v_old.amount, 0) + coalesce(v_old.fee, 0);
  else
    v_reverse_old_delta :=
      -(coalesce(v_old.amount, 0) - coalesce(v_old.fee, 0));
  end if;

  if p_type = 'deposit' then
    v_apply_new_delta := -(v_amount + v_fee);
  else
    v_apply_new_delta := v_amount - v_fee;
  end if;

  if p_wallet_id = v_old.wallet_id then
    v_same_wallet_balance :=
      v_old_wallet.balance +
      v_reverse_old_delta +
      v_apply_new_delta;

    if v_same_wallet_balance < 0 then
      raise exception 'Số dư ví không đủ để cập nhật giao dịch Forex.';
    end if;

    update public.wallets
    set balance = v_same_wallet_balance
    where id = p_wallet_id
      and user_id = v_user_id;
  else
    if v_old_wallet.balance + v_reverse_old_delta < 0 then
      raise exception 'Không thể hoàn nguyên số dư ví cũ.';
    end if;

    if v_new_wallet.balance + v_apply_new_delta < 0 then
      raise exception 'Số dư ví mới không đủ để cập nhật giao dịch Forex.';
    end if;

    update public.wallets
    set balance = balance + v_reverse_old_delta
    where id = v_old.wallet_id
      and user_id = v_user_id;

    update public.wallets
    set balance = balance + v_apply_new_delta
    where id = p_wallet_id
      and user_id = v_user_id;
  end if;

  update public.forex_cash_transactions
  set
    forex_account_id = p_forex_account_id,
    wallet_id = p_wallet_id,
    type = p_type,
    amount = v_amount,
    currency = 'VND',
    fee = v_fee,
    transaction_date = p_transaction_date,
    transaction_time = coalesce(p_transaction_time, localtime),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = p_id
    and user_id = v_user_id
  returning * into v_result;

  return v_result;
end;
$function$

REVOKE ALL ON FUNCTION public.update_forex_cash_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_forex_cash_transaction TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_forex_cash_transaction(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.forex_cash_transactions%rowtype;
  v_wallet public.wallets%rowtype;
  v_reverse_delta numeric;
begin
  if v_user_id is null then
    raise exception 'Không có phiên đăng nhập.';
  end if;

  select *
  into v_transaction
  from public.forex_cash_transactions
  where id = p_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy giao dịch Forex cần xóa.';
  end if;

  select *
  into v_wallet
  from public.wallets
  where id = v_transaction.wallet_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ví liên kết.';
  end if;

  if v_transaction.type = 'deposit' then
    v_reverse_delta :=
      coalesce(v_transaction.amount, 0) +
      coalesce(v_transaction.fee, 0);
  else
    v_reverse_delta :=
      -(coalesce(v_transaction.amount, 0) -
        coalesce(v_transaction.fee, 0));
  end if;

  if v_wallet.balance + v_reverse_delta < 0 then
    raise exception 'Số dư ví không đủ để hoàn nguyên giao dịch Forex.';
  end if;

  update public.wallets
  set balance = balance + v_reverse_delta
  where id = v_transaction.wallet_id
    and user_id = v_user_id;

  delete from public.forex_cash_transactions
  where id = p_id
    and user_id = v_user_id;
end;
$function$

REVOKE ALL ON FUNCTION public.delete_forex_cash_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_forex_cash_transaction TO authenticated;

-- Finance Engine, Savings Engine, and atomic backup/restore definitions follow.

-- ============================================================================
-- FINANCE-ENGINE-2 canonical RPC definitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_finance_transaction(
  p_id text,
  p_type text,
  p_amount numeric,
  p_category_id text,
  p_wallet_id text,
  p_note text,
  p_date date,
  p_effect_wallet_id_1 text,
  p_effect_delta_1 numeric,
  p_transfer_to_wallet_id text DEFAULT NULL,
  p_is_recurring boolean DEFAULT false,
  p_recurrence text DEFAULT NULL,
  p_next_run_date date DEFAULT NULL,
  p_transfer_fee numeric DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_transfer_reference text DEFAULT NULL,
  p_transfer_reference_type text DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_destination_type text DEFAULT NULL,
  p_effect_wallet_id_2 text DEFAULT NULL,
  p_effect_delta_2 numeric DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row transactions;
  v_wallet_ids text[];
  v_wallet_count int;
  v_balance_1 numeric;
  v_balance_2 numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFE04';
  END IF;

  IF p_type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid transaction type' USING ERRCODE = 'MFE04';
  END IF;

  IF p_effect_wallet_id_1 IS NULL THEN
    RAISE EXCEPTION 'At least one affected wallet is required' USING ERRCODE = 'MFE04';
  END IF;

  v_wallet_ids := ARRAY[p_effect_wallet_id_1];
  IF p_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_effect_wallet_id_2);
  END IF;

  -- Deterministic (id-ascending) lock order: two concurrent opposite-
  -- direction transfers (A->B and B->A) both request their locks lowest-id
  -- first, so neither can ever wait on the other's second lock — no
  -- deadlock possible from this function alone.
  PERFORM 1 FROM wallets
    WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
    ORDER BY id ASC
    FOR UPDATE;

  SELECT count(*) INTO v_wallet_count
    FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
  IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
    RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
  END IF;

  -- Authoritative (server-side, post-lock) balance read — never trust a
  -- client-computed "balance was sufficient" check, since it may be based
  -- on a stale read from before another device's concurrent write.
  SELECT balance INTO v_balance_1 FROM wallets
    WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;
  IF v_balance_1 + p_effect_delta_1 < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
  END IF;

  IF p_effect_wallet_id_2 IS NOT NULL THEN
    SELECT balance INTO v_balance_2 FROM wallets
      WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
    IF v_balance_2 + p_effect_delta_2 < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;
  END IF;

  -- "id" is the primary key: a retried create with the same id (lost
  -- response, client retry) hits this INSERT's unique-violation and aborts
  -- the whole function before any wallet balance is touched — natural,
  -- built-in idempotency with no ON CONFLICT trickery that could otherwise
  -- silently re-apply a wallet effect.
  INSERT INTO transactions (
    id, user_id, type, amount, "categoryId", "walletId", note, date,
    "transferToWalletId", "isRecurring", recurrence, "nextRunDate",
    transfer_fee, exchange_rate, transfer_reference,
    transfer_reference_type, source_type, destination_type
  ) VALUES (
    p_id, v_user_id, p_type::transaction_type, p_amount, p_category_id,
    p_wallet_id, p_note, p_date, p_transfer_to_wallet_id, p_is_recurring,
    p_recurrence::recurrence_freq, p_next_run_date, p_transfer_fee,
    p_exchange_rate, p_transfer_reference, p_transfer_reference_type,
    p_source_type, p_destination_type
  )
  RETURNING * INTO v_row;

  UPDATE wallets SET balance = balance + p_effect_delta_1
    WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;

  IF p_effect_wallet_id_2 IS NOT NULL THEN
    UPDATE wallets SET balance = balance + p_effect_delta_2
      WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
  END IF;

  -- Belt-and-suspenders: the explicit checks above already prevent this,
  -- but the existing wallets_balance_nn CHECK (balance >= 0) constraint is
  -- still the final authority — if it ever fires here, the whole function
  -- (INSERT + both UPDATEs) rolls back atomically.
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_finance_transaction TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- update_finance_transaction
--
-- Atomically reverses the OLD transaction's wallet effect(s), applies the
-- NEW effect(s), and updates the transaction row — one function call, one
-- implicit Postgres transaction. Old/new effects are both computed by the
-- caller (same reason as create_finance_transaction above).
--
-- Optimistic conflict check: the caller also passes the amount/wallet/type
-- it read the transaction as having (p_expected_*). If another writer
-- changed the row between the caller's read and this call, those fields
-- won't match the current locked row and the whole update is rejected —
-- this closes the TOCTOU window where a stale "old effect" computed by the
-- client could otherwise be reversed against a since-changed transaction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_finance_transaction(
  p_id text,
  p_type text,
  p_amount numeric,
  p_category_id text,
  p_wallet_id text,
  p_note text,
  p_date date,
  p_expected_amount numeric,
  p_expected_wallet_id text,
  p_expected_type text,
  p_old_effect_wallet_id_1 text,
  p_old_effect_delta_1 numeric,
  p_new_effect_wallet_id_1 text,
  p_new_effect_delta_1 numeric,
  p_expected_transfer_to_wallet_id text DEFAULT NULL,
  p_transfer_to_wallet_id text DEFAULT NULL,
  p_is_recurring boolean DEFAULT false,
  p_recurrence text DEFAULT NULL,
  p_next_run_date date DEFAULT NULL,
  p_transfer_fee numeric DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_transfer_reference text DEFAULT NULL,
  p_transfer_reference_type text DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_destination_type text DEFAULT NULL,
  p_old_effect_wallet_id_2 text DEFAULT NULL,
  p_old_effect_delta_2 numeric DEFAULT NULL,
  p_new_effect_wallet_id_2 text DEFAULT NULL,
  p_new_effect_delta_2 numeric DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing transactions;
  v_row transactions;
  v_wallet_ids text[] := ARRAY[]::text[];
  v_wallet_count int;
  v_balances jsonb := '{}'::jsonb;
  v_wallet_id text;
  v_balance numeric;
  v_net numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFE04';
  END IF;

  IF p_type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid transaction type' USING ERRCODE = 'MFE04';
  END IF;

  IF p_old_effect_wallet_id_1 IS NULL OR p_new_effect_wallet_id_1 IS NULL THEN
    RAISE EXCEPTION 'At least one affected wallet is required' USING ERRCODE = 'MFE04';
  END IF;

  -- Serialize concurrent writers on the same transaction before validating
  -- the caller's expected old state.
  SELECT * INTO v_existing FROM transactions
    WHERE id = p_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;

  IF v_existing.amount IS DISTINCT FROM p_expected_amount
     OR v_existing."walletId" IS DISTINCT FROM p_expected_wallet_id
     OR v_existing."transferToWalletId" IS DISTINCT FROM p_expected_transfer_to_wallet_id
     OR v_existing.type::text IS DISTINCT FROM p_expected_type THEN
    RAISE EXCEPTION 'Transaction was modified by another request; please reload and retry'
      USING ERRCODE = 'MFE07';
  END IF;

  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_1);
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_old_effect_wallet_id_2);
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_1);
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    v_wallet_ids := array_append(v_wallet_ids, p_new_effect_wallet_id_2);
  END IF;
  v_wallet_ids := ARRAY(SELECT DISTINCT unnest(v_wallet_ids) ORDER BY 1);

  -- Deterministic lock order across the union of old/new affected wallets.
  PERFORM 1 FROM wallets
    WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
    ORDER BY id ASC
    FOR UPDATE;

  SELECT count(*) INTO v_wallet_count
    FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
  IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
    RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
  END IF;

  -- Build the final per-wallet NET delta:
  --   reverse old effect = -old_delta
  --   apply new effect   = +new_delta
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    v_balances := jsonb_set(v_balances, ARRAY[v_wallet_id], '0'::jsonb);
  END LOOP;

  IF p_old_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_old_effect_wallet_id_1],
      to_jsonb((v_balances->>p_old_effect_wallet_id_1)::numeric - p_old_effect_delta_1)
    );
  END IF;
  IF p_old_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_old_effect_wallet_id_2],
      to_jsonb((v_balances->>p_old_effect_wallet_id_2)::numeric - p_old_effect_delta_2)
    );
  END IF;
  IF p_new_effect_wallet_id_1 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_new_effect_wallet_id_1],
      to_jsonb((v_balances->>p_new_effect_wallet_id_1)::numeric + p_new_effect_delta_1)
    );
  END IF;
  IF p_new_effect_wallet_id_2 IS NOT NULL THEN
    v_balances := jsonb_set(
      v_balances,
      ARRAY[p_new_effect_wallet_id_2],
      to_jsonb((v_balances->>p_new_effect_wallet_id_2)::numeric + p_new_effect_delta_2)
    );
  END IF;

  -- Validate every final balance before mutating any wallet.
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    SELECT balance INTO v_balance FROM wallets
      WHERE id = v_wallet_id AND user_id = v_user_id;
    v_net := (v_balances->>v_wallet_id)::numeric;
    IF v_balance + v_net < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;
  END LOOP;

  -- FINANCE-TRANSACTION-EDIT-1: apply exactly one final NET mutation per
  -- affected wallet. A zero-net metadata-only edit skips wallet mutation,
  -- so wallets_balance_nn can never see a false transient negative state.
  FOREACH v_wallet_id IN ARRAY v_wallet_ids LOOP
    v_net := (v_balances->>v_wallet_id)::numeric;
    IF v_net <> 0 THEN
      UPDATE wallets
      SET balance = balance + v_net
      WHERE id = v_wallet_id AND user_id = v_user_id;
    END IF;
  END LOOP;

  UPDATE transactions SET
    type = p_type::transaction_type,
    amount = p_amount,
    "categoryId" = p_category_id,
    "walletId" = p_wallet_id,
    note = p_note,
    date = p_date,
    "transferToWalletId" = p_transfer_to_wallet_id,
    "isRecurring" = p_is_recurring,
    recurrence = p_recurrence::recurrence_freq,
    "nextRunDate" = p_next_run_date,
    transfer_fee = p_transfer_fee,
    exchange_rate = p_exchange_rate,
    transfer_reference = p_transfer_reference,
    transfer_reference_type = p_transfer_reference_type,
    source_type = p_source_type,
    destination_type = p_destination_type
  WHERE id = p_id AND user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_finance_transaction TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_finance_transaction
--
-- Atomically reverses the transaction's wallet effect(s) and deletes the
-- row. Same optimistic conflict check as update, for the same reason: the
-- caller's "effects to reverse" were computed from a read that may be
-- stale by the time this call lands.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_finance_transaction(
  p_id text,
  p_expected_amount numeric,
  p_expected_wallet_id text,
  p_expected_type text,
  p_expected_transfer_to_wallet_id text DEFAULT NULL,
  p_effect_wallet_id_1 text DEFAULT NULL,
  p_effect_delta_1 numeric DEFAULT NULL,
  p_effect_wallet_id_2 text DEFAULT NULL,
  p_effect_delta_2 numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing transactions;
  v_wallet_ids text[];
  v_wallet_count int;
  v_balance_1 numeric;
  v_balance_2 numeric;
  v_deleted_id text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFE01';
  END IF;

  -- Lock the transaction row first — see update_finance_transaction's
  -- comment for the update-vs-delete race this serializes.
  SELECT * INTO v_existing FROM transactions
    WHERE id = p_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;

  IF v_existing.amount IS DISTINCT FROM p_expected_amount
     OR v_existing."walletId" IS DISTINCT FROM p_expected_wallet_id
     OR v_existing."transferToWalletId" IS DISTINCT FROM p_expected_transfer_to_wallet_id
     OR v_existing.type::text IS DISTINCT FROM p_expected_type THEN
    RAISE EXCEPTION 'Transaction was modified by another request; please reload and retry'
      USING ERRCODE = 'MFE07';
  END IF;

  IF p_effect_wallet_id_1 IS NOT NULL THEN
    v_wallet_ids := ARRAY[p_effect_wallet_id_1];
    IF p_effect_wallet_id_2 IS NOT NULL THEN
      v_wallet_ids := array_append(v_wallet_ids, p_effect_wallet_id_2);
    END IF;

    PERFORM 1 FROM wallets
      WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id
      ORDER BY id ASC
      FOR UPDATE;

    SELECT count(*) INTO v_wallet_count
      FROM wallets WHERE id = ANY(v_wallet_ids) AND user_id = v_user_id;
    IF v_wallet_count <> array_length(v_wallet_ids, 1) THEN
      RAISE EXCEPTION 'One or more wallets were not found' USING ERRCODE = 'MFE02';
    END IF;

    -- Reversing a delete can legitimately push a wallet negative (e.g. the
    -- income being deleted was already spent elsewhere) — this preserves
    -- the exact business rule the previous JS-side implementation already
    -- enforced (reject the delete rather than allow a negative balance).
    SELECT balance INTO v_balance_1 FROM wallets
      WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;
    IF v_balance_1 - p_effect_delta_1 < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
    END IF;

    IF p_effect_wallet_id_2 IS NOT NULL THEN
      SELECT balance INTO v_balance_2 FROM wallets
        WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
      IF v_balance_2 - p_effect_delta_2 < 0 THEN
        RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFE05';
      END IF;
    END IF;

    UPDATE wallets SET balance = balance - p_effect_delta_1
      WHERE id = p_effect_wallet_id_1 AND user_id = v_user_id;

    IF p_effect_wallet_id_2 IS NOT NULL THEN
      UPDATE wallets SET balance = balance - p_effect_delta_2
        WHERE id = p_effect_wallet_id_2 AND user_id = v_user_id;
    END IF;
  END IF;

  DELETE FROM transactions WHERE id = p_id AND user_id = v_user_id
    RETURNING id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'MFE03';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_finance_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_finance_transaction TO authenticated;

-- ============================================================================
-- FINANCE-ENGINE-3 canonical Savings RPC definitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_saving_account(
  p_saving_id uuid,
  p_name text,
  p_type text,
  p_balance numeric,
  p_wallet_id text,
  p_saving_transaction_id uuid,
  p_transaction_date date,
  p_interest_rate numeric DEFAULT NULL,
  p_maturity_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (saving savings, wallet wallets, saving_transaction saving_transactions)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_wallet wallets;
  v_saving savings;
  v_saving_transaction saving_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Saving name is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Matches the live savings_type CHECK constraint exactly — it does NOT
  -- allow 'other' (confirmed against the real database; the client's
  -- SavingsPage.tsx form also only ever offers these four values, so this
  -- was never reachable through the UI regardless).
  IF p_type NOT IN ('savings_account', 'term_deposit', 'certificate', 'emergency_fund') THEN
    RAISE EXCEPTION 'Invalid saving type' USING ERRCODE = 'MFS04';
  END IF;

  IF p_balance IS NULL OR p_balance <= 0 THEN
    RAISE EXCEPTION 'Initial deposit must be greater than zero' USING ERRCODE = 'MFS04';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'A source wallet is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Lock the wallet before reading its balance — see
  -- create_finance_transaction for the same authoritative-post-lock-read
  -- rationale (never trust a client-computed "balance was sufficient").
  SELECT * INTO v_wallet FROM wallets
    WHERE id = p_wallet_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'MFS03';
  END IF;

  IF v_wallet.balance - p_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE = 'MFS05';
  END IF;

  UPDATE wallets SET balance = balance - p_balance, updated_at = now()
    WHERE id = p_wallet_id AND user_id = v_user_id
    RETURNING * INTO v_wallet;

  -- "id" is the primary key: a retried create with the same client-supplied
  -- id (lost response, client retry) hits this INSERT's unique-violation
  -- and aborts the whole function before any further write — this is
  -- duplicate REPLAY PROTECTION, not full idempotency (a true retry would
  -- return/recover the original successful result; here it surfaces a
  -- duplicate-key error instead). Same guarantee create_finance_transaction
  -- already relies on.
  INSERT INTO savings (
    id, user_id, name, type, balance, wallet_id, interest_rate,
    maturity_date, notes
  ) VALUES (
    p_saving_id, v_user_id, trim(p_name), p_type, p_balance, p_wallet_id,
    p_interest_rate, p_maturity_date, p_notes
  )
  RETURNING * INTO v_saving;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_saving_transaction_id, v_user_id, v_saving.id, 'deposit', p_balance,
    p_wallet_id, p_transaction_date, 'Số dư ban đầu khi tạo khoản tiết kiệm'
  )
  RETURNING * INTO v_saving_transaction;

  RETURN QUERY SELECT v_saving, v_wallet, v_saving_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_saving_account FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_saving_account TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- create_saving_movement
--
-- Atomically records a deposit, withdrawal, or settlement (full close) on an
-- EXISTING saving: mutates the wallet and inserts the main "transactions"
-- ledger row via create_finance_transaction (nested call, same transaction),
-- mutates savings.balance, and inserts the saving_transactions ledger row.
--
-- Settlement always closes the account for its authoritative, server-locked
-- current balance (v_saving.balance) rather than any client-supplied
-- amount — this closes a latent bug in the previous JS implementation,
-- where a manually edited settlement amount could zero the saving balance
-- while crediting the wallet with a smaller amount, silently destroying the
-- difference. p_amount is ignored when p_type = 'settlement'.
--
-- Wallet ↔ Savings is modeled as a ONE-WALLET transfer: only the wallet
-- side lives in create_finance_transaction's domain (wallets/transactions);
-- the savings side is mutated separately, right below, in this same
-- transaction. This is confirmed valid against create_finance_transaction's
-- actual body (not assumed): it requires only p_effect_wallet_id_1 to be
-- non-null ("At least one affected wallet is required"), and every check
-- involving p_effect_wallet_id_2/p_effect_delta_2 is itself gated behind
-- `IF p_effect_wallet_id_2 IS NOT NULL` — there is no code path that
-- requires a second wallet, a p_transfer_to_wallet_id, or type-specific
-- wallet-count validation for p_type = 'transfer'. Omitting
-- p_effect_wallet_id_2/p_transfer_to_wallet_id below (left at their
-- DEFAULT NULL) is therefore a semantically valid call, not a workaround.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_saving_movement(
  p_saving_id uuid,
  p_wallet_id text,
  p_type text,
  p_amount numeric,
  p_note text,
  p_transaction_date date,
  p_saving_transaction_id uuid,
  p_finance_transaction_id text
)
RETURNS TABLE (saving savings, wallet wallets, saving_transaction saving_transactions)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_saving savings;
  v_wallet wallets;
  v_saving_transaction saving_transactions;
  v_finance_transaction transactions;
  v_amount numeric;
  v_transfer_kind text;
  v_source_type text;
  v_destination_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  IF p_type NOT IN ('deposit', 'withdraw', 'settlement') THEN
    RAISE EXCEPTION 'Invalid saving movement type' USING ERRCODE = 'MFS04';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'A wallet is required' USING ERRCODE = 'MFS04';
  END IF;

  -- Lock the saving row before the wallet (create_finance_transaction locks
  -- the wallet below) — a single, consistent savings-then-wallet lock order
  -- across every caller of this function means two concurrent movements can
  -- never deadlock against each other here.
  SELECT * INTO v_saving FROM savings
    WHERE id = p_saving_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  IF p_type = 'settlement' THEN
    v_amount := v_saving.balance;
  ELSE
    v_amount := p_amount;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = 'MFS04';
  END IF;

  IF p_type IN ('withdraw', 'settlement') AND v_amount > v_saving.balance THEN
    RAISE EXCEPTION 'Insufficient savings balance' USING ERRCODE = 'MFS02';
  END IF;

  IF p_type = 'deposit' THEN
    v_transfer_kind := 'saving_deposit';
    v_source_type := 'wallet';
    v_destination_type := 'saving';
  ELSIF p_type = 'withdraw' THEN
    v_transfer_kind := 'saving_withdraw';
    v_source_type := 'saving';
    v_destination_type := 'wallet';
  ELSE
    v_transfer_kind := 'saving_close';
    v_source_type := 'saving';
    v_destination_type := 'wallet';
  END IF;

  -- Wallet mutation + main "transactions" ledger row are delegated to the
  -- existing FINANCE-ENGINE-2 function. It performs its own wallet lock,
  -- ownership check, and authoritative balance check (raises MFE02/MFE04/
  -- MFE05 as appropriate) — none of that is duplicated here. Because this
  -- is a normal (not autonomous) function call, it executes inside the
  -- SAME transaction as this function, so its insert/update and everything
  -- below either all commit together or all roll back together.
  --
  -- p_category_id => '' matches transactions."categoryId"'s own column
  -- default (TEXT NOT NULL DEFAULT ''), not a workaround — this is the
  -- same value every existing non-categorized transfer already uses.
  -- p_transfer_reference_type/p_source_type/p_destination_type ('saving',
  -- 'wallet') are free-form text columns with no CHECK constraint in
  -- create_finance_transaction's body; the pre-migration client code
  -- already sent these exact values successfully through this same RPC.
  v_finance_transaction := public.create_finance_transaction(
    p_id                      => p_finance_transaction_id,
    p_type                    => 'transfer',
    p_amount                  => v_amount,
    p_category_id             => '',
    p_wallet_id               => p_wallet_id,
    p_note                    => p_note,
    p_date                    => p_transaction_date,
    p_effect_wallet_id_1      => p_wallet_id,
    p_effect_delta_1          => CASE WHEN p_type = 'deposit' THEN -v_amount ELSE v_amount END,
    p_transfer_reference      => v_transfer_kind || ':' || p_saving_id::text || ':' || clock_timestamp()::text,
    p_transfer_reference_type => 'saving',
    p_source_type             => v_source_type,
    p_destination_type        => v_destination_type
  );

  SELECT * INTO v_wallet FROM wallets
    WHERE id = p_wallet_id AND user_id = v_user_id;

  UPDATE savings SET
    balance = CASE
      WHEN p_type = 'settlement' THEN 0
      WHEN p_type = 'deposit' THEN balance + v_amount
      ELSE balance - v_amount
    END,
    maturity_date = CASE
      WHEN p_type = 'settlement' THEN p_transaction_date
      ELSE maturity_date
    END,
    updated_at = now()
  WHERE id = p_saving_id AND user_id = v_user_id
  RETURNING * INTO v_saving;

  INSERT INTO saving_transactions (
    id, user_id, saving_id, type, amount, wallet_id, transaction_date, note
  ) VALUES (
    p_saving_transaction_id, v_user_id, p_saving_id, p_type, v_amount,
    p_wallet_id, p_transaction_date, p_note
  )
  RETURNING * INTO v_saving_transaction;

  RETURN QUERY SELECT v_saving, v_wallet, v_saving_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_saving_movement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_saving_movement TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_saving_account
--
-- Atomically deletes a saving account and its saving_transactions history —
-- but ONLY when its authoritative, server-locked balance is exactly zero.
-- This is the actual security/correctness boundary: a saving account with
-- money still in it can never be deleted by any client, no matter what the
-- client believes its own balance check found. SavingsPage.tsx's own
-- `balance > 0` guard is UX convenience only (immediate feedback, no round
-- trip) — this function is the authoritative one.
--
-- Uses `<> 0` rather than `> 0`: even though the live database DOES have
-- `savings_balance_check CHECK (balance >= 0)` (confirmed), rejecting any
-- nonzero balance — not just positive — remains the correct invariant
-- regardless of that constraint, and doesn't depend on it.
--
-- The live saving_transactions.saving_id -> savings.id FK is
-- ON DELETE CASCADE, meaning deleting the "savings" row alone would already
-- delete its saving_transactions history automatically. The explicit
-- `DELETE FROM saving_transactions` below is kept anyway, purely so the
-- ledger deletion is not an invisible side effect of the FK — both
-- statements are inside this one transaction regardless, so this is a
-- readability choice, not a correctness requirement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_saving_account(
  p_saving_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_saving savings;
  v_deleted_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFS01';
  END IF;

  SELECT * INTO v_saving FROM savings
    WHERE id = p_saving_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  IF v_saving.balance <> 0 THEN
    RAISE EXCEPTION 'Saving balance must be zero before it can be deleted'
      USING ERRCODE = 'MFS06';
  END IF;

  DELETE FROM saving_transactions
    WHERE saving_id = p_saving_id AND user_id = v_user_id;

  DELETE FROM savings WHERE id = p_saving_id AND user_id = v_user_id
    RETURNING id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Saving account not found' USING ERRCODE = 'MFS03';
  END IF;

  RETURN v_deleted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_saving_account FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_saving_account TO authenticated;

-- ============================================================================
-- FINANCE-DATA-2 canonical backup / restore RPC definitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.export_finance_backup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;

  -- One SQL statement => one coherent export snapshot for all domains.
  RETURN jsonb_build_object(
    'format', 'myfinance-backup',
    'version', 2,
    'exported_at', now(),
    'data', jsonb_build_object(
      'wallets', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.wallets AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'categories', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.categories AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'debts', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.debts AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'goals', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.goals AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'budgets', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.budgets AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'investments', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.investments AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'savings', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.savings AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'saving_transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.saving_transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'forex_accounts', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.forex_accounts AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb),
      'forex_cash_transactions', COALESCE((
        SELECT jsonb_agg(to_jsonb(row_data) - 'user_id')
        FROM public.forex_cash_transactions AS row_data
        WHERE row_data.user_id = v_user_id
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_finance_backup() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- restore_finance_backup
--
-- The function call is the transaction boundary. PostgreSQL rolls back every
-- DELETE and INSERT if any later statement raises, so a constraint failure,
-- malformed row, RLS rejection, or ownership mismatch can never leave a
-- partial restore behind.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_finance_backup(p_backup jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_restore_data jsonb;
  v_domain text;
  v_exported_at timestamptz;
  v_required_domains constant text[] := ARRAY[
    'wallets',
    'categories',
    'transactions',
    'debts',
    'goals',
    'budgets',
    'investments',
    'savings',
    'saving_transactions',
    'forex_accounts',
    'forex_cash_transactions'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'MFB01';
  END IF;

  IF p_backup IS NULL OR jsonb_typeof(p_backup) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup envelope'
      USING ERRCODE = 'MFB02';
  END IF;

  -- The pre-V2 client exported pf_* keys and omitted Savings/Forex. Explicitly
  -- reject it rather than treating missing collections as empty and deleting
  -- the user's newer domains.
  IF p_backup ?| ARRAY[
    'pf_wallets',
    'pf_categories',
    'pf_transactions',
    'pf_debts',
    'pf_goals',
    'pf_budgets',
    'pf_investments'
  ] THEN
    RAISE EXCEPTION 'Legacy incomplete backup is not restorable safely'
      USING ERRCODE = 'MFB04';
  END IF;

  IF p_backup->>'format' IS DISTINCT FROM 'myfinance-backup' THEN
    RAISE EXCEPTION 'Invalid MyFinance backup format'
      USING ERRCODE = 'MFB02';
  END IF;

  IF jsonb_typeof(p_backup->'version') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Backup version is missing or invalid'
      USING ERRCODE = 'MFB02';
  END IF;

  IF (p_backup->>'version')::numeric <> 2 THEN
    RAISE EXCEPTION 'Unsupported MyFinance backup version: %', p_backup->>'version'
      USING ERRCODE = 'MFB03';
  END IF;

  IF jsonb_typeof(p_backup->'exported_at') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Backup exported_at is missing or invalid'
      USING ERRCODE = 'MFB02';
  END IF;

  BEGIN
    v_exported_at := (p_backup->>'exported_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Backup exported_at is not a valid timestamp'
      USING ERRCODE = 'MFB02';
  END;

  v_data := p_backup->'data';
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Backup data object is missing'
      USING ERRCODE = 'MFB02';
  END IF;

  -- Mandatory complete-domain preflight. Every V2 collection must be present
  -- even when empty, and each element must be a JSON object. No DELETE occurs
  -- before this loop completes successfully.
  FOREACH v_domain IN ARRAY v_required_domains
  LOOP
    IF NOT (v_data ? v_domain) OR jsonb_typeof(v_data->v_domain) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Backup domain % is missing or is not an array', v_domain
        USING ERRCODE = 'MFB02';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_data->v_domain) AS item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
    ) THEN
      RAISE EXCEPTION 'Backup domain % contains a non-object row', v_domain
        USING ERRCODE = 'MFB02';
    END IF;
  END LOOP;

  -- Ignore any user_id contained in the uploaded JSON. This transformed copy
  -- is the only payload used below, and every row is forcibly attributed to
  -- the currently authenticated user.
  SELECT jsonb_object_agg(
    domain.key,
    COALESCE((
      SELECT jsonb_agg(item.value || jsonb_build_object('user_id', v_user_id))
      FROM jsonb_array_elements(domain.value) AS item(value)
    ), '[]'::jsonb)
  )
  INTO v_restore_data
  FROM jsonb_each(v_data) AS domain(key, value);

  -- Parse all collections into their live composite row types BEFORE the first
  -- DELETE. This catches incompatible JSON scalar/database types as preflight.
  -- Missing required SQL fields can still fail on INSERT constraints later;
  -- that failure remains atomic and rolls the entire RPC transaction back.
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.wallets, v_restore_data->'wallets');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.categories, v_restore_data->'categories');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.transactions, v_restore_data->'transactions');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.debts, v_restore_data->'debts');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.goals, v_restore_data->'goals');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.budgets, v_restore_data->'budgets');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.investments, v_restore_data->'investments');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.savings, v_restore_data->'savings');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.saving_transactions, v_restore_data->'saving_transactions');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.forex_accounts, v_restore_data->'forex_accounts');
  PERFORM 1 FROM jsonb_populate_recordset(NULL::public.forex_cash_transactions, v_restore_data->'forex_cash_transactions');

  -- Child / ledger rows first on delete. All statements remain inside this one
  -- RPC transaction; if any subsequent insert fails, these deletes roll back.
  DELETE FROM public.saving_transactions WHERE user_id = v_user_id;
  DELETE FROM public.forex_cash_transactions WHERE user_id = v_user_id;
  DELETE FROM public.transactions WHERE user_id = v_user_id;
  DELETE FROM public.budgets WHERE user_id = v_user_id;
  DELETE FROM public.goals WHERE user_id = v_user_id;
  DELETE FROM public.debts WHERE user_id = v_user_id;
  DELETE FROM public.investments WHERE user_id = v_user_id;
  DELETE FROM public.savings WHERE user_id = v_user_id;
  DELETE FROM public.forex_accounts WHERE user_id = v_user_id;
  DELETE FROM public.categories WHERE user_id = v_user_id;
  DELETE FROM public.wallets WHERE user_id = v_user_id;

  -- Parent/snapshot rows first on insert. Direct inserts deliberately bypass the
  -- movement RPCs: balances in wallets/savings/forex_accounts are already the
  -- authoritative values captured by the backup snapshot.
  INSERT INTO public.wallets
    SELECT * FROM jsonb_populate_recordset(NULL::public.wallets, v_restore_data->'wallets');

  INSERT INTO public.categories
    SELECT * FROM jsonb_populate_recordset(NULL::public.categories, v_restore_data->'categories');

  INSERT INTO public.debts
    SELECT * FROM jsonb_populate_recordset(NULL::public.debts, v_restore_data->'debts');

  INSERT INTO public.goals
    SELECT * FROM jsonb_populate_recordset(NULL::public.goals, v_restore_data->'goals');

  INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(NULL::public.budgets, v_restore_data->'budgets');

  INSERT INTO public.investments
    SELECT * FROM jsonb_populate_recordset(NULL::public.investments, v_restore_data->'investments');

  INSERT INTO public.forex_accounts
    SELECT * FROM jsonb_populate_recordset(NULL::public.forex_accounts, v_restore_data->'forex_accounts');

  INSERT INTO public.savings
    SELECT * FROM jsonb_populate_recordset(NULL::public.savings, v_restore_data->'savings');

  INSERT INTO public.transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.transactions, v_restore_data->'transactions');

  INSERT INTO public.saving_transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.saving_transactions, v_restore_data->'saving_transactions');

  INSERT INTO public.forex_cash_transactions
    SELECT * FROM jsonb_populate_recordset(NULL::public.forex_cash_transactions, v_restore_data->'forex_cash_transactions');

  RETURN jsonb_build_object(
    'restored', true,
    'source_exported_at', v_exported_at,
    'counts', jsonb_build_object(
      'wallets', jsonb_array_length(v_data->'wallets'),
      'categories', jsonb_array_length(v_data->'categories'),
      'transactions', jsonb_array_length(v_data->'transactions'),
      'debts', jsonb_array_length(v_data->'debts'),
      'goals', jsonb_array_length(v_data->'goals'),
      'budgets', jsonb_array_length(v_data->'budgets'),
      'investments', jsonb_array_length(v_data->'investments'),
      'savings', jsonb_array_length(v_data->'savings'),
      'saving_transactions', jsonb_array_length(v_data->'saving_transactions'),
      'forex_accounts', jsonb_array_length(v_data->'forex_accounts'),
      'forex_cash_transactions', jsonb_array_length(v_data->'forex_cash_transactions')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_finance_backup(jsonb) TO authenticated;

-- FINANCE-SEED-1 CANONICAL BLOCK START
CREATE OR REPLACE FUNCTION public.seed_finance_demo_data(p_seed jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_category_count bigint;
  v_default_category_shape_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'MFD01';
  END IF;

  -- Serialize competing first-login/page-mount seed calls for this user.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('myfinance-demo-seed:' || v_user_id::text, 0)
  );

  -- Auto-seed is a rare first-login operation. Freeze the complete finance
  -- write surface for the short authoritative check + atomic restore window.
  LOCK TABLE
    public.saving_transactions,
    public.forex_cash_transactions,
    public.transactions,
    public.budgets,
    public.categories,
    public.savings,
    public.forex_accounts,
    public.wallets,
    public.debts,
    public.goals,
    public.investments
  IN SHARE ROW EXCLUSIVE MODE;

  -- Any persisted finance row outside Categories proves that this is not a
  -- pristine first-login bootstrap. Fail closed and preserve the user's data.
  IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.debts WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.goals WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.budgets WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.investments WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.savings WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.saving_transactions WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.forex_accounts WHERE user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.forex_cash_transactions WHERE user_id = v_user_id)
  THEN
    RETURN false;
  END IF;

  -- DB-SSOT-1 creates 15 default categories synchronously from the auth.users
  -- signup trigger. Those rows are bootstrap scaffolding, not user-entered
  -- finance data. Preserve historical first-login demo behavior ONLY when the
  -- Categories table is either empty or is exactly that untouched baseline.
  SELECT count(*)
  INTO v_category_count
  FROM public.categories
  WHERE user_id = v_user_id;

  IF v_category_count > 0 THEN
    IF v_category_count <> 15 THEN
      RETURN false;
    END IF;

    -- Every row must match one canonical signup tuple and remain untouched in
    -- every mutable/default field. A renamed, reclassified, recurring, or
    -- otherwise edited category makes the account ineligible for auto-seed.
    IF EXISTS (
      SELECT 1
      FROM public.categories c
      WHERE c.user_id = v_user_id
        AND (
          c.financial_group IS NOT NULL
          OR c.is_recurring IS DISTINCT FROM false
          OR c.recurrence IS NOT NULL
          OR c.default_amount IS NOT NULL
          OR c.default_wallet_id IS NOT NULL
          OR c.next_run_date IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM (
              VALUES
                ('Lương',         'income',  'income'),
                ('Thưởng',        'income',  'income'),
                ('Freelance',      'income',  'income'),
                ('Đầu tư',        'income',  'income'),
                ('Thu nhập khác', 'income',  'income'),
                ('Ăn uống',       'expense', 'variable'),
                ('Nhà ở',         'expense', 'fixed'),
                ('Di chuyển',     'expense', 'variable'),
                ('Mua sắm',       'expense', 'variable'),
                ('Sức khỏe',      'expense', 'variable'),
                ('Giáo dục',      'expense', 'fixed'),
                ('Giải trí',      'expense', 'variable'),
                ('Hóa đơn & phí', 'expense', 'fixed'),
                ('Tiết kiệm',     'expense', 'saving'),
                ('Khác',          'expense', 'variable')
            ) AS expected(name, type, planning_group)
            WHERE expected.name = c.name
              AND expected.type = c.type::text
              AND expected.planning_group IS NOT DISTINCT FROM c.planning_group
          )
        )
    ) THEN
      RETURN false;
    END IF;

    -- Count alone plus "each row is allowed" would still permit duplicates
    -- replacing a missing default tuple. Require all 15 canonical shapes.
    SELECT count(
      DISTINCT (c.name, c.type::text, c.planning_group)
    )
    INTO v_default_category_shape_count
    FROM public.categories c
    WHERE c.user_id = v_user_id;

    IF v_default_category_shape_count <> 15 THEN
      RETURN false;
    END IF;
  END IF;

  -- FINANCE-DATA-2 validates the V2 envelope and all mandatory arrays before
  -- its first destructive write. Nested in this same transaction, any later
  -- error rolls back every seeded domain together.
  PERFORM public.restore_finance_backup(p_seed);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_demo_data(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_demo_data(jsonb) TO authenticated;
-- FINANCE-SEED-1 CANONICAL BLOCK END

-- End of canonical schema.
