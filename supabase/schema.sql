-- ============================================================
-- MyFinance — Supabase Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────

create table if not exists wallets (
  id          text primary key,
  name        text    not null,
  type        text    not null check (type in ('cash', 'bank', 'ewallet', 'investment')),
  balance     numeric not null default 0
);

create table if not exists categories (
  id    text primary key,
  name  text not null,
  type  text not null check (type in ('income', 'expense'))
);

create table if not exists transactions (
  id           text primary key,
  type         text    not null check (type in ('income', 'expense')),
  amount       numeric not null check (amount > 0),
  "categoryId" text    not null,
  "walletId"   text    not null,
  note         text    not null default '',
  date         text    not null
);

create table if not exists debts (
  id                text primary key,
  name              text    not null,
  "totalAmount"     numeric not null check ("totalAmount" >= 0),
  "remainingAmount" numeric not null check ("remainingAmount" >= 0)
);

create table if not exists goals (
  id              text primary key,
  name            text    not null,
  "targetAmount"  numeric not null check ("targetAmount" > 0),
  "currentAmount" numeric not null default 0 check ("currentAmount" >= 0)
);

create table if not exists budgets (
  id            text primary key,
  "categoryId"  text    not null,
  month         text    not null,
  "limitAmount" numeric not null check ("limitAmount" > 0)
);

create table if not exists investments (
  id               text primary key,
  name             text    not null,
  type             text    not null check (type in ('stock', 'crypto', 'fund', 'gold', 'other')),
  symbol           text,
  "investedAmount" numeric not null check ("investedAmount" >= 0),
  "currentValue"   numeric not null default 0 check ("currentValue" >= 0),
  "purchaseDate"   text,
  notes            text
);

-- ── Row Level Security ────────────────────────────────────────
-- Public access (no auth). Replace with user-scoped policies
-- once authentication is added.

alter table wallets      enable row level security;
alter table categories   enable row level security;
alter table transactions enable row level security;
alter table debts        enable row level security;
alter table goals        enable row level security;
alter table budgets      enable row level security;
alter table investments  enable row level security;

create policy "public read-write" on wallets
  for all using (true) with check (true);

create policy "public read-write" on categories
  for all using (true) with check (true);

create policy "public read-write" on transactions
  for all using (true) with check (true);

create policy "public read-write" on debts
  for all using (true) with check (true);

create policy "public read-write" on goals
  for all using (true) with check (true);

create policy "public read-write" on budgets
  for all using (true) with check (true);

create policy "public read-write" on investments
  for all using (true) with check (true);

-- ── Indexes ───────────────────────────────────────────────────
-- Speeds up the most common query patterns.

create index if not exists idx_transactions_wallet_id
  on transactions ("walletId");

create index if not exists idx_transactions_category_id
  on transactions ("categoryId");

create index if not exists idx_transactions_date
  on transactions (date desc);

create index if not exists idx_budgets_category_month
  on budgets ("categoryId", month);

create index if not exists idx_investments_type
  on investments (type);
