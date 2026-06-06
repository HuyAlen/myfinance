# Supabase Setup & RLS Checklist

## 1. Required Environment Variables

Set in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable                        | Source                                                                   | Scope                              |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard → Settings → API → Project URL                        | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Project API Keys → `anon` `public` | Production + Preview + Development |

> **After adding variables in Vercel, trigger a new deployment.**

---

## 2. Database Schema Migration

Each table needs a `user_id` column linked to `auth.users`. Run the following SQL in **Supabase Dashboard → SQL Editor**:

```sql
-- Add user_id to every table
ALTER TABLE wallets      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE categories   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE debts        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE goals        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE budgets      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE investments  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Make user_id NOT NULL after backfilling (skip if tables are empty)
-- ALTER TABLE wallets      ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE categories   ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE debts        ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE goals        ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE budgets      ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE investments  ALTER COLUMN user_id SET NOT NULL;
```

---

## 3. Enable Row Level Security

```sql
ALTER TABLE wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments  ENABLE ROW LEVEL SECURITY;
```

---

## 4. RLS Policies

Run for **each table** (replace `wallets` with the table name):

```sql
-- SELECT: user sees only their own rows
CREATE POLICY "wallets_select" ON wallets
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: user can only insert rows for themselves
CREATE POLICY "wallets_insert" ON wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: user can only update their own rows
CREATE POLICY "wallets_update" ON wallets
  FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: user can only delete their own rows
CREATE POLICY "wallets_delete" ON wallets
  FOR DELETE USING (auth.uid() = user_id);
```

Repeat for: `categories`, `transactions`, `debts`, `goals`, `budgets`, `investments`.

### Quick bulk script

```sql
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallets','categories','transactions','debts','goals','budgets','investments']
  LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() = user_id)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() = user_id)', t || '_delete', t);
  END LOOP;
END
$$;
```

---

## 5. RLS Verification Checklist

After applying the migration:

- [ ] `wallets` table has `user_id` column (UUID, references `auth.users`)
- [ ] `categories` table has `user_id` column
- [ ] `transactions` table has `user_id` column
- [ ] `debts` table has `user_id` column
- [ ] `goals` table has `user_id` column
- [ ] `budgets` table has `user_id` column
- [ ] `investments` table has `user_id` column
- [ ] RLS is **enabled** on all 7 tables
- [ ] 4 policies exist per table (select / insert / update / delete)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in Vercel
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in Vercel
- [ ] New Vercel deployment triggered after setting env vars
- [ ] Browser DevTools → Console shows no `[supabase]` errors on page load
- [ ] Creating a wallet saves successfully (no red error banner)
- [ ] Refreshing the page retains the new wallet

---

## 6. Auth Configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: Add `https://your-app.vercel.app/**`

This ensures password-reset emails redirect to the correct production domain.

---

## 7. Common Error Messages & Fixes

| Error in console                                            | Cause                                                     | Fix                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Missing environment variable(s): NEXT_PUBLIC_SUPABASE_URL` | Env var not set in Vercel                                 | Add to Vercel dashboard, redeploy                                             |
| `new row violates row-level security policy`                | RLS blocks insert because `user_id` missing or mismatched | Run schema migration, check auth session                                      |
| `column user_id of relation ... does not exist`             | DB column not added yet                                   | Run `ALTER TABLE` migration above                                             |
| `JWT expired`                                               | Auth token expired, session not refreshed                 | Supabase client auto-refreshes; ensure `onAuthStateChange` listener is active |
| `permission denied for table ...`                           | RLS enabled but no policy grants access                   | Create the 4 policies per table                                               |
