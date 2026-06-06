-- ═══════════════════════════════════════════════════════════════════════════
-- MyFinance – Complete Supabase Schema
-- Generated: 2026-06-06
--
-- HOW TO USE
--   Paste the entire file into Supabase Dashboard → SQL Editor → Run.
--   Safe to re-run: all DDL uses CREATE … IF NOT EXISTS / OR REPLACE.
--
-- DESIGN NOTES
--   • id columns are TEXT (not UUID) to support both user-created UUIDs
--     (crypto.randomUUID()) and demo data's human-readable slugs
--     ("cash", "vcb", "salary", "t1", …).
--   • camelCase column names use quoted identifiers to match the
--     TypeScript client types in database.types.ts exactly.
--   • FK constraints from transactions/"budgets back to wallets/categories
--     are intentionally omitted: the app inserts all tables in parallel
--     (Promise.all) so insertion order is not guaranteed.
--   • user_id FK → auth.users is present on every table and enforced at
--     the DB level; RLS policies are the primary security layer.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 · Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v4() (compatibility)


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 · Custom Types / Enums
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE wallet_type      AS ENUM ('cash', 'bank', 'ewallet', 'investment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE category_type    AS ENUM ('income', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recurrence_freq  AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE investment_type  AS ENUM ('stock', 'crypto', 'fund', 'gold', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 · Shared Trigger Function: update_updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 · Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 3.1 wallets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id         TEXT          NOT NULL,
  user_id    UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT          NOT NULL,
  type       wallet_type   NOT NULL DEFAULT 'cash',
  balance    NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT wallets_pkey         PRIMARY KEY (id),
  CONSTRAINT wallets_name_nonempty CHECK (trim(name) <> ''),
  CONSTRAINT wallets_balance_nn   CHECK (balance >= 0)
);

COMMENT ON TABLE wallets IS
  'User cash / bank / e-wallet / investment accounts. '
  'Balance is kept in sync by the application layer on every transaction mutation.';


-- ── 3.2 categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT          NOT NULL,
  user_id    UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT          NOT NULL,
  type       category_type NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT categories_pkey         PRIMARY KEY (id),
  CONSTRAINT categories_name_nonempty CHECK (trim(name) <> '')
);

COMMENT ON TABLE categories IS
  'Income / expense categories owned per user. '
  'Default rows are inserted by the seed_default_categories trigger on signup.';


-- ── 3.3 transactions ────────────────────────────────────────────────────────
--
-- "categoryId" stores the category the transaction belongs to.
-- For transfer transactions the application stores an empty string ('')
-- rather than NULL, so no FK constraint is created on this column.
--
-- "walletId"           – source wallet for income / expense / transfer.
-- "transferToWalletId" – destination wallet; only set when type = 'transfer'.
--
-- FK from "walletId" / "transferToWalletId" → wallets is omitted because
-- the app inserts wallets and transactions in a single Promise.all, making
-- insertion order non-deterministic.
--
CREATE TABLE IF NOT EXISTS transactions (
  id                    TEXT             NOT NULL,
  user_id               UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                  transaction_type NOT NULL,
  amount                NUMERIC(15,2)    NOT NULL,
  "categoryId"          TEXT             NOT NULL DEFAULT '',
  "walletId"            TEXT             NOT NULL,
  note                  TEXT             NOT NULL DEFAULT '',
  date                  DATE             NOT NULL,
  "transferToWalletId"  TEXT,
  "isRecurring"         BOOLEAN          NOT NULL DEFAULT FALSE,
  recurrence            recurrence_freq,
  "nextRunDate"         DATE,
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT transactions_pkey                 PRIMARY KEY (id),
  CONSTRAINT transactions_amount_positive      CHECK (amount > 0),
  CONSTRAINT transactions_recurring_needs_freq CHECK (
    "isRecurring" = FALSE OR recurrence IS NOT NULL
  ),
  CONSTRAINT transactions_transfer_needs_dest  CHECK (
    type <> 'transfer' OR "transferToWalletId" IS NOT NULL
  ),
  CONSTRAINT transactions_transfer_wallets_differ CHECK (
    type <> 'transfer' OR "walletId" <> "transferToWalletId"
  )
);

COMMENT ON TABLE  transactions              IS 'All financial movements: income, expense, and wallet-to-wallet transfers.';
COMMENT ON COLUMN transactions."categoryId" IS 'Empty string for transfer transactions; UUID/slug for income and expense.';


-- ── 3.4 debts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts (
  id                TEXT          NOT NULL,
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT          NOT NULL,
  "totalAmount"     NUMERIC(15,2) NOT NULL,
  "remainingAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,
  "interestRate"    NUMERIC(5,2),          -- annual rate in %
  "minimumPayment"  NUMERIC(15,2),
  "dueDate"         DATE,
  "loanTermMonths"  SMALLINT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT debts_pkey                   PRIMARY KEY (id),
  CONSTRAINT debts_name_nonempty          CHECK (trim(name) <> ''),
  CONSTRAINT debts_total_positive         CHECK ("totalAmount" > 0),
  CONSTRAINT debts_remaining_nonneg       CHECK ("remainingAmount" >= 0),
  CONSTRAINT debts_remaining_lte_total    CHECK ("remainingAmount" <= "totalAmount"),
  CONSTRAINT debts_interest_nonneg        CHECK ("interestRate" IS NULL OR "interestRate" >= 0),
  CONSTRAINT debts_minimum_payment_nonneg CHECK ("minimumPayment" IS NULL OR "minimumPayment" >= 0),
  CONSTRAINT debts_loan_term_positive     CHECK ("loanTermMonths" IS NULL OR "loanTermMonths" > 0)
);

COMMENT ON COLUMN debts."interestRate" IS 'Annual interest rate expressed as a percentage (e.g. 8.5 = 8.5%).';


-- ── 3.5 goals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id              TEXT          NOT NULL,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,
  "targetAmount"  NUMERIC(15,2) NOT NULL,
  "currentAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT goals_pkey              PRIMARY KEY (id),
  CONSTRAINT goals_name_nonempty     CHECK (trim(name) <> ''),
  CONSTRAINT goals_target_positive   CHECK ("targetAmount" > 0),
  CONSTRAINT goals_current_nonneg    CHECK ("currentAmount" >= 0)
);


-- ── 3.6 budgets ─────────────────────────────────────────────────────────────
--
-- "categoryId" references a category but the FK is omitted for the same
-- reason as transactions: wallets, categories, and budgets are seeded in
-- a single Promise.all by the application.
--
-- month format: 'YYYY-MM' (e.g. '2026-06')
-- "warningThreshold"  – % of limitAmount at which a warning is shown (e.g. 75)
-- "criticalThreshold" – % of limitAmount at which a critical alert fires (e.g. 90)
--
CREATE TABLE IF NOT EXISTS budgets (
  id                   TEXT          NOT NULL,
  user_id              UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "categoryId"         TEXT          NOT NULL,
  month                TEXT          NOT NULL,
  "limitAmount"        NUMERIC(15,2) NOT NULL,
  "rolloverAmount"     NUMERIC(15,2) NOT NULL DEFAULT 0,
  "warningThreshold"   NUMERIC(5,2),
  "criticalThreshold"  NUMERIC(5,2),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT budgets_pkey                     PRIMARY KEY (id),
  CONSTRAINT budgets_month_format             CHECK (month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT budgets_limit_positive           CHECK ("limitAmount" > 0),
  CONSTRAINT budgets_rollover_nonneg          CHECK ("rolloverAmount" >= 0),
  CONSTRAINT budgets_warning_range            CHECK ("warningThreshold"  IS NULL OR "warningThreshold"  BETWEEN 0 AND 100),
  CONSTRAINT budgets_critical_range           CHECK ("criticalThreshold" IS NULL OR "criticalThreshold" BETWEEN 0 AND 100),
  CONSTRAINT budgets_unique_category_month    UNIQUE (user_id, "categoryId", month)
);

COMMENT ON COLUMN budgets."warningThreshold"  IS 'Spending % of limitAmount that triggers a warning badge (e.g. 75.00).';
COMMENT ON COLUMN budgets."criticalThreshold" IS 'Spending % of limitAmount that triggers a critical badge (e.g. 90.00).';


-- ── 3.7 investments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investments (
  id               TEXT            NOT NULL,
  user_id          UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT            NOT NULL,
  type             investment_type NOT NULL,
  symbol           TEXT,
  "investedAmount" NUMERIC(15,2)   NOT NULL,
  "currentValue"   NUMERIC(15,2)   NOT NULL DEFAULT 0,
  "purchaseDate"   DATE,
  notes            TEXT,
  quantity         NUMERIC(18,8),
  "averageCost"    NUMERIC(15,2),
  "currentPrice"   NUMERIC(15,2),
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT investments_pkey              PRIMARY KEY (id),
  CONSTRAINT investments_name_nonempty     CHECK (trim(name) <> ''),
  CONSTRAINT investments_invested_positive CHECK ("investedAmount" > 0),
  CONSTRAINT investments_value_nonneg      CHECK ("currentValue" >= 0),
  CONSTRAINT investments_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT investments_avg_cost_nonneg   CHECK ("averageCost"   IS NULL OR "averageCost"   >= 0),
  CONSTRAINT investments_price_nonneg      CHECK ("currentPrice"  IS NULL OR "currentPrice"  >= 0)
);

COMMENT ON COLUMN investments.symbol IS 'Ticker / trading symbol (e.g. FPT, BTC, VNM). Optional free-text.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 · Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- wallets ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallets_user_id
  ON wallets (user_id);

-- categories ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_categories_user_id
  ON categories (user_id);

CREATE INDEX IF NOT EXISTS idx_categories_user_type
  ON categories (user_id, type);

-- transactions ────────────────────────────────────────────────────────────────
-- Primary access pattern: all transactions for a user, ordered by date desc.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type
  ON transactions (user_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet
  ON transactions (user_id, "walletId");

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions (user_id, "categoryId");

CREATE INDEX IF NOT EXISTS idx_transactions_recurring
  ON transactions (user_id, "isRecurring", "nextRunDate")
  WHERE "isRecurring" = TRUE;

-- debts ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_debts_user_id
  ON debts (user_id);

CREATE INDEX IF NOT EXISTS idx_debts_due_date
  ON debts (user_id, "dueDate")
  WHERE "dueDate" IS NOT NULL;

-- goals ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_user_id
  ON goals (user_id);

-- budgets ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_budgets_user_month
  ON budgets (user_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_budgets_user_category
  ON budgets (user_id, "categoryId");

-- investments ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_investments_user_id
  ON investments (user_id);

CREATE INDEX IF NOT EXISTS idx_investments_user_type
  ON investments (user_id, type);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 · updated_at Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and recreate each trigger so re-running the file is safe.

DROP TRIGGER IF EXISTS trg_wallets_updated_at      ON wallets;
DROP TRIGGER IF EXISTS trg_categories_updated_at   ON categories;
DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
DROP TRIGGER IF EXISTS trg_debts_updated_at        ON debts;
DROP TRIGGER IF EXISTS trg_goals_updated_at        ON goals;
DROP TRIGGER IF EXISTS trg_budgets_updated_at      ON budgets;
DROP TRIGGER IF EXISTS trg_investments_updated_at  ON investments;

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_debts_updated_at
  BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_investments_updated_at
  BEFORE UPDATE ON investments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 · Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments  ENABLE ROW LEVEL SECURITY;

-- Drop policies before (re)creating so the file is idempotent.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('wallets','categories','transactions','debts','goals','budgets','investments')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- wallets ─────────────────────────────────────────────────────────────────────
CREATE POLICY "wallets_select" ON wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "wallets_insert" ON wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wallets_update" ON wallets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "wallets_delete" ON wallets
  FOR DELETE USING (auth.uid() = user_id);

-- categories ──────────────────────────────────────────────────────────────────
CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "categories_insert" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "categories_delete" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- transactions ────────────────────────────────────────────────────────────────
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- debts ───────────────────────────────────────────────────────────────────────
CREATE POLICY "debts_select" ON debts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "debts_insert" ON debts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "debts_update" ON debts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "debts_delete" ON debts
  FOR DELETE USING (auth.uid() = user_id);

-- goals ───────────────────────────────────────────────────────────────────────
CREATE POLICY "goals_select" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "goals_insert" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goals_update" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "goals_delete" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- budgets ─────────────────────────────────────────────────────────────────────
CREATE POLICY "budgets_select" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "budgets_insert" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budgets_update" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "budgets_delete" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- investments ─────────────────────────────────────────────────────────────────
CREATE POLICY "investments_select" ON investments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "investments_insert" ON investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "investments_update" ON investments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "investments_delete" ON investments
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 · Seed Default Categories on Signup
-- ─────────────────────────────────────────────────────────────────────────────
--
-- When a new user is created in auth.users, 10 default categories are
-- automatically inserted (5 income + 5 expense).
--
-- IDs use gen_random_uuid() so they are globally unique and do not collide
-- with the demo data's slug IDs ("salary", "food", etc.) that the app inserts
-- via initFinanceDemoData() on the first page load.
--
-- SECURITY DEFINER is required because the trigger runs as the postgres role,
-- not as the user (who does not yet have a JWT when auth.users is written to).
--

CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.categories (id, user_id, name, type) VALUES
    -- ── Income ───────────────────────────────────────────────────────────
    (gen_random_uuid()::text, NEW.id, 'Lương',          'income'),
    (gen_random_uuid()::text, NEW.id, 'Thưởng',         'income'),
    (gen_random_uuid()::text, NEW.id, 'Freelance',       'income'),
    (gen_random_uuid()::text, NEW.id, 'Đầu tư',         'income'),
    (gen_random_uuid()::text, NEW.id, 'Thu nhập khác',  'income'),
    -- ── Expense ──────────────────────────────────────────────────────────
    (gen_random_uuid()::text, NEW.id, 'Ăn uống',        'expense'),
    (gen_random_uuid()::text, NEW.id, 'Nhà ở',          'expense'),
    (gen_random_uuid()::text, NEW.id, 'Di chuyển',      'expense'),
    (gen_random_uuid()::text, NEW.id, 'Mua sắm',        'expense'),
    (gen_random_uuid()::text, NEW.id, 'Sức khỏe',       'expense'),
    (gen_random_uuid()::text, NEW.id, 'Giáo dục',       'expense'),
    (gen_random_uuid()::text, NEW.id, 'Giải trí',       'expense'),
    (gen_random_uuid()::text, NEW.id, 'Hóa đơn & phí', 'expense'),
    (gen_random_uuid()::text, NEW.id, 'Tiết kiệm',      'expense'),
    (gen_random_uuid()::text, NEW.id, 'Khác',           'expense');
  RETURN NEW;
END;
$$;

-- Remove the trigger if it already exists so this file is idempotent.
DROP TRIGGER IF EXISTS trg_seed_categories_on_signup ON auth.users;

CREATE TRIGGER trg_seed_categories_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_categories();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 · Realtime
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Enable Postgres publication so the Supabase Realtime service can broadcast
-- row-level changes to the browser. RealtimeProvider.tsx subscribes to these.
--
-- Note: 'supabase_realtime' publication is created automatically by Supabase;
-- the ALTER command simply adds the required tables to it.
--

ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE debts;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE investments;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9 · Schema Summary
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Tables (7):
--   wallets      – id TEXT PK · user_id · name · type · balance · timestamps
--   categories   – id TEXT PK · user_id · name · type · timestamps
--   transactions – id TEXT PK · user_id · type · amount · categoryId ·
--                  walletId · note · date · transferToWalletId ·
--                  isRecurring · recurrence · nextRunDate · timestamps
--   debts        – id TEXT PK · user_id · name · totalAmount ·
--                  remainingAmount · interestRate · minimumPayment ·
--                  dueDate · loanTermMonths · timestamps
--   goals        – id TEXT PK · user_id · name · targetAmount ·
--                  currentAmount · timestamps
--   budgets      – id TEXT PK · user_id · categoryId · month ·
--                  limitAmount · rolloverAmount · warningThreshold ·
--                  criticalThreshold · timestamps
--   investments  – id TEXT PK · user_id · name · type · symbol ·
--                  investedAmount · currentValue · purchaseDate ·
--                  notes · quantity · averageCost · currentPrice · timestamps
--
-- Indexes (14): user_id on all tables + hot access patterns (date, month, type)
--
-- RLS policies (28): SELECT / INSERT / UPDATE / DELETE per table,
--                    all gated on auth.uid() = user_id
--
-- Triggers (8):  7 × update_updated_at (one per table)
--                1 × seed_default_categories (on auth.users INSERT)
--
-- Realtime:      All 7 tables added to supabase_realtime publication
--
-- ─────────────────────────────────────────────────────────────────────────────
