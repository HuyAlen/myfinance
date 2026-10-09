-- MYFINANCE-PRODUCTION-DATA-AUDIT-1 / 02 INTEGRITY
-- READ ONLY. Run only after 01 confirms required tables/columns exist.
-- SQL Editor (privileged) may bypass RLS: export ONLY this aggregate result.
-- No user identifiers, transaction amounts, account numbers, or row samples.
-- Findings do not mutate, repair, or reconcile wallet balances.
WITH findings(check_id, domain, priority, issue_count, expectation) AS (
  -- Core ledger: wallet ownership, ordinary categories, transfer semantics.
  SELECT 'TXN_SOURCE_WALLET_MISSING', 'transactions', 'P0', count(*)::bigint,
         'All transactions reference an existing source wallet'
  FROM public.transactions t
  LEFT JOIN public.wallets w ON w.id = t."walletId"
  WHERE w.id IS NULL

  UNION ALL
  SELECT 'TXN_SOURCE_WALLET_WRONG_OWNER', 'transactions', 'P0', count(*)::bigint,
         'Source wallet and transaction have the same finance owner'
  FROM public.transactions t
  JOIN public.wallets w ON w.id = t."walletId"
  WHERE w.user_id IS DISTINCT FROM t.user_id

  UNION ALL
  SELECT 'TXN_DEST_WALLET_MISSING', 'transactions', 'P0', count(*)::bigint,
         'Non-null destination wallet references an existing wallet'
  FROM public.transactions t
  LEFT JOIN public.wallets w ON w.id = t."transferToWalletId"
  WHERE t."transferToWalletId" IS NOT NULL AND w.id IS NULL

  UNION ALL
  SELECT 'TXN_DEST_WALLET_WRONG_OWNER', 'transactions', 'P0', count(*)::bigint,
         'Destination wallet and transaction have the same finance owner'
  FROM public.transactions t
  JOIN public.wallets w ON w.id = t."transferToWalletId"
  WHERE w.user_id IS DISTINCT FROM t.user_id

  UNION ALL
  SELECT 'TXN_SELF_TRANSFER', 'transactions', 'P0', count(*)::bigint,
         'Wallet-to-wallet transfers do not point to the source wallet'
  FROM public.transactions t
  WHERE t.type::text = 'transfer'
    AND t."transferToWalletId" = t."walletId"

  UNION ALL
  SELECT 'TXN_TRANSFER_MISSING_DEST', 'transactions', 'P0', count(*)::bigint,
         'Ordinary transfers have a destination; managed transfers are exempt'
  FROM public.transactions t
  WHERE t.type::text = 'transfer'
    AND t."transferToWalletId" IS NULL
    AND COALESCE(t.transfer_reference_type, '') NOT IN ('saving', 'investment', 'debt')

  UNION ALL
  SELECT 'TXN_NONPOSITIVE_AMOUNT', 'transactions', 'P0', count(*)::bigint,
         'All transactions have positive amounts'
  FROM public.transactions t
  WHERE t.amount <= 0

  UNION ALL
  SELECT 'TXN_CATEGORY_WRONG_OWNER', 'transactions', 'P0', count(*)::bigint,
         'A referenced category belongs to the same finance owner'
  FROM public.transactions t
  JOIN public.categories c ON c.id = t."categoryId"
  WHERE t."categoryId" <> '' AND c.user_id IS DISTINCT FROM t.user_id

  UNION ALL
  SELECT 'TXN_CATEGORY_MISSING', 'transactions', 'P1', count(*)::bigint,
         'Assigned category IDs resolve; blank category is separately reviewed'
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t."categoryId"
  WHERE t.type::text IN ('income', 'expense')
    AND t."categoryId" <> '' AND c.id IS NULL

  UNION ALL
  SELECT 'TXN_CATEGORY_TYPE_MISMATCH', 'transactions', 'P1', count(*)::bigint,
         'Ordinary income and expense category types agree with transaction type'
  FROM public.transactions t
  JOIN public.categories c ON c.id = t."categoryId" AND c.user_id = t.user_id
  WHERE t.type::text IN ('income', 'expense')
    AND c.type::text IS DISTINCT FROM t.type::text

  UNION ALL
  SELECT 'TXN_UNCATEGORIZED', 'transactions', 'INFO', count(*)::bigint,
         'Uncategorized ordinary transactions need optional review'
  FROM public.transactions t
  WHERE t.type::text IN ('income', 'expense')
    AND COALESCE(t."categoryId", '') = ''

  -- Wallet and category owner isolation.
  UNION ALL
  SELECT 'CATEGORY_DEFAULT_WALLET_WRONG_OWNER', 'categories', 'P0', count(*)::bigint,
         'Configured default wallet belongs to the category owner'
  FROM public.categories c
  JOIN public.wallets w ON w.id = c.default_wallet_id
  WHERE w.user_id IS DISTINCT FROM c.user_id

  UNION ALL
  SELECT 'CATEGORY_DEFAULT_WALLET_MISSING', 'categories', 'P1', count(*)::bigint,
         'Non-null category default wallet exists'
  FROM public.categories c
  LEFT JOIN public.wallets w ON w.id = c.default_wallet_id
  WHERE c.default_wallet_id IS NOT NULL AND w.id IS NULL

  UNION ALL
  SELECT 'WALLET_NEGATIVE_BALANCE', 'wallets', 'P0', count(*)::bigint,
         'Wallet balance is nonnegative (not reconstructed from historical flow)'
  FROM public.wallets w
  WHERE w.balance < 0

  -- Budgets and goals.
  UNION ALL
  SELECT 'BUDGET_CATEGORY_MISSING', 'budgets', 'P0', count(*)::bigint,
         'Budget category reference exists'
  FROM public.budgets b
  LEFT JOIN public.categories c ON c.id = b."categoryId"
  WHERE c.id IS NULL

  UNION ALL
  SELECT 'BUDGET_CATEGORY_WRONG_OWNER', 'budgets', 'P0', count(*)::bigint,
         'Budget category and budget have the same finance owner'
  FROM public.budgets b
  JOIN public.categories c ON c.id = b."categoryId"
  WHERE c.user_id IS DISTINCT FROM b.user_id

  UNION ALL
  SELECT 'BUDGET_DUPLICATE_PERIOD_CATEGORY', 'budgets', 'P0', count(*)::bigint,
         'At most one budget per finance owner, category, and month'
  FROM (
    SELECT b.user_id, b."categoryId", b.month
    FROM public.budgets b
    GROUP BY b.user_id, b."categoryId", b.month
    HAVING count(*) > 1
  ) duplicates

  UNION ALL
  SELECT 'BUDGET_INVALID_MONTH', 'budgets', 'P1', count(*)::bigint,
         'Budget month uses a valid YYYY-MM calendar month'
  FROM public.budgets b
  WHERE b.month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'

  UNION ALL
  SELECT 'GOAL_SAVING_CATEGORY_MISSING', 'goals', 'P1', count(*)::bigint,
         'Goal saving category references exist for the same finance owner'
  FROM public.goals g
  CROSS JOIN LATERAL unnest(g.saving_category_ids) AS category_ref(category_id)
  LEFT JOIN public.categories c
    ON c.id = category_ref.category_id AND c.user_id = g.user_id
  WHERE c.id IS NULL

  -- Investment principal transfers use transactions.transfer_reference as the
  -- investment ID. Snapshot principal can also have a legal manual baseline.
  UNION ALL
  SELECT 'INVESTMENT_CAPITAL_REF_MISSING', 'investments', 'P0', count(*)::bigint,
         'Capital movement investment reference resolves to an existing investment'
  FROM public.transactions t
  LEFT JOIN public.investments i ON i.id = t.transfer_reference
  WHERE t.transfer_reference_type = 'investment' AND i.id IS NULL

  UNION ALL
  SELECT 'INVESTMENT_CAPITAL_REF_WRONG_OWNER', 'investments', 'P0', count(*)::bigint,
         'Capital movement investment owner matches transaction finance owner'
  FROM public.transactions t
  JOIN public.investments i ON i.id = t.transfer_reference
  WHERE t.transfer_reference_type = 'investment'
    AND i.user_id IS DISTINCT FROM t.user_id

  UNION ALL
  SELECT 'INVESTMENT_CAPITAL_DIRECTION_SUSPECT', 'investments', 'P1', count(*)::bigint,
         'Investment capital transfers record a wallet/investment direction pair'
  FROM public.transactions t
  WHERE t.transfer_reference_type = 'investment'
    AND (
      t.type::text <> 'transfer'
      OR (t.source_type, t.destination_type) NOT IN
          (('wallet', 'investment'), ('investment', 'wallet'))
      OR t.source_type IS NULL OR t.destination_type IS NULL
    )

  UNION ALL
  SELECT 'INVESTMENT_NEGATIVE_POSITION', 'investments', 'P0', count(*)::bigint,
         'Investment principal and marked current value are nonnegative'
  FROM public.investments i
  WHERE i."investedAmount" < 0 OR i."currentValue" < 0

  -- Savings: do not infer current balances from incomplete historic movements.
  UNION ALL
  SELECT 'SAVINGS_WALLET_MISSING', 'savings', 'P0', count(*)::bigint,
         'Non-null savings funding wallet exists'
  FROM public.savings s
  LEFT JOIN public.wallets w ON w.id = s.wallet_id
  WHERE s.wallet_id IS NOT NULL AND w.id IS NULL

  UNION ALL
  SELECT 'SAVINGS_WALLET_WRONG_OWNER', 'savings', 'P0', count(*)::bigint,
         'Savings funding wallet and savings account have same owner'
  FROM public.savings s
  JOIN public.wallets w ON w.id = s.wallet_id
  WHERE w.user_id IS DISTINCT FROM s.user_id

  UNION ALL
  SELECT 'SAVINGS_MOVEMENT_ACCOUNT_MISSING', 'savings', 'P0', count(*)::bigint,
         'Every savings movement references an existing savings account'
  FROM public.saving_transactions st
  LEFT JOIN public.savings s ON s.id = st.saving_id
  WHERE s.id IS NULL

  UNION ALL
  SELECT 'SAVINGS_MOVEMENT_WRONG_OWNER', 'savings', 'P0', count(*)::bigint,
         'Savings movement and parent savings account have same owner'
  FROM public.saving_transactions st
  JOIN public.savings s ON s.id = st.saving_id
  WHERE st.user_id IS DISTINCT FROM s.user_id

  UNION ALL
  SELECT 'SAVINGS_MOVEMENT_WALLET_MISSING', 'savings', 'P0', count(*)::bigint,
         'Non-null savings movement wallet exists'
  FROM public.saving_transactions st
  LEFT JOIN public.wallets w ON w.id = st.wallet_id
  WHERE st.wallet_id IS NOT NULL AND w.id IS NULL

  UNION ALL
  SELECT 'SAVINGS_MOVEMENT_WALLET_WRONG_OWNER', 'savings', 'P0', count(*)::bigint,
         'Savings movement wallet and movement have same finance owner'
  FROM public.saving_transactions st
  JOIN public.wallets w ON w.id = st.wallet_id
  WHERE w.user_id IS DISTINCT FROM st.user_id

  UNION ALL
  SELECT 'SAVINGS_NEGATIVE_BALANCE', 'savings', 'P0', count(*)::bigint,
         'Savings balance is nonnegative'
  FROM public.savings s
  WHERE s.balance < 0

  -- Forex: wallet owner, account owner, and snapshot lineage.
  UNION ALL
  SELECT 'FOREX_CASH_ACCOUNT_MISSING', 'forex', 'P0', count(*)::bigint,
         'Forex cash movement references an existing forex account'
  FROM public.forex_cash_transactions f
  LEFT JOIN public.forex_accounts a ON a.id = f.forex_account_id
  WHERE a.id IS NULL

  UNION ALL
  SELECT 'FOREX_CASH_ACCOUNT_WRONG_OWNER', 'forex', 'P0', count(*)::bigint,
         'Forex movement and forex account have same owner'
  FROM public.forex_cash_transactions f
  JOIN public.forex_accounts a ON a.id = f.forex_account_id
  WHERE f.user_id IS DISTINCT FROM a.user_id

  UNION ALL
  SELECT 'FOREX_CASH_WALLET_MISSING', 'forex', 'P0', count(*)::bigint,
         'Non-null forex movement wallet exists'
  FROM public.forex_cash_transactions f
  LEFT JOIN public.wallets w ON w.id = f.wallet_id
  WHERE f.wallet_id IS NOT NULL AND w.id IS NULL

  UNION ALL
  SELECT 'FOREX_CASH_WALLET_WRONG_OWNER', 'forex', 'P0', count(*)::bigint,
         'Forex movement and funding wallet have same finance owner'
  FROM public.forex_cash_transactions f
  JOIN public.wallets w ON w.id = f.wallet_id
  WHERE f.user_id IS DISTINCT FROM w.user_id

  UNION ALL
  SELECT 'FOREX_CASH_WALLET_UNLINKED', 'forex', 'P1', count(*)::bigint,
         'Legacy forex movements without wallet links need manual review'
  FROM public.forex_cash_transactions f
  WHERE f.wallet_id IS NULL

  UNION ALL
  SELECT 'FOREX_CASH_INVALID_AMOUNT_OR_FEE', 'forex', 'P0', count(*)::bigint,
         'Forex cash movements have positive amounts and nonnegative fees'
  FROM public.forex_cash_transactions f
  WHERE f.amount <= 0 OR f.fee < 0

  UNION ALL
  SELECT 'FOREX_SNAPSHOT_ACCOUNT_MISSING', 'forex', 'P0', count(*)::bigint,
         'Forex equity snapshot has an existing account'
  FROM public.forex_balance_snapshots s
  LEFT JOIN public.forex_accounts a ON a.id = s.forex_account_id
  WHERE a.id IS NULL

  UNION ALL
  SELECT 'FOREX_SNAPSHOT_ACCOUNT_WRONG_OWNER', 'forex', 'P0', count(*)::bigint,
         'Forex snapshot and referenced forex account have same owner'
  FROM public.forex_balance_snapshots s
  JOIN public.forex_accounts a ON a.id = s.forex_account_id
  WHERE s.user_id IS DISTINCT FROM a.user_id

  UNION ALL
  SELECT 'FOREX_SNAPSHOT_SOURCE_WRONG_ACCOUNT', 'forex', 'P0', count(*)::bigint,
         'Linked snapshot source movement belongs to same account and owner'
  FROM public.forex_balance_snapshots s
  JOIN public.forex_cash_transactions f ON f.id = s.source_transaction_id
  WHERE f.forex_account_id IS DISTINCT FROM s.forex_account_id
     OR f.user_id IS DISTINCT FROM s.user_id

  UNION ALL
  SELECT 'FOREX_SNAPSHOT_SOURCE_MISSING', 'forex', 'P1', count(*)::bigint,
         'Non-null snapshot source movement resolves; deleted source may be legal legacy'
  FROM public.forex_balance_snapshots s
  LEFT JOIN public.forex_cash_transactions f ON f.id = s.source_transaction_id
  WHERE s.source_transaction_id IS NOT NULL AND f.id IS NULL

  UNION ALL
  SELECT 'FOREX_SNAPSHOT_NEGATIVE_BALANCE', 'forex', 'P0', count(*)::bigint,
         'Forex balance snapshots must be nonnegative'
  FROM public.forex_balance_snapshots s
  WHERE s.balance < 0

  -- Snapshots are historical records; compare their own internal equations only.
  UNION ALL
  SELECT 'NET_WORTH_SNAPSHOT_ASSET_EQUATION', 'net-worth', 'P0', count(*)::bigint,
         'Stored total assets match the sum of stored asset components'
  FROM public.net_worth_snapshots n
  WHERE abs(n.total_assets -
      (n.cash_and_wallets + n.savings + n.investments + n.forex)) > 0.02

  UNION ALL
  SELECT 'NET_WORTH_SNAPSHOT_NET_EQUATION', 'net-worth', 'P0', count(*)::bigint,
         'Stored net worth equals stored total assets less stored debt'
  FROM public.net_worth_snapshots n
  WHERE abs(n.net_worth - (n.total_assets - n.total_debt)) > 0.02

  UNION ALL
  SELECT 'NET_WORTH_DUPLICATE_OWNER_MONTH', 'net-worth', 'P0', count(*)::bigint,
         'At most one net worth snapshot per owner and month'
  FROM (
    SELECT n.user_id, n.snapshot_month
    FROM public.net_worth_snapshots n
    GROUP BY n.user_id, n.snapshot_month
    HAVING count(*) > 1
  ) duplicates

  -- Workspaces: multi-membership is valid, invalid active preference is not.
  UNION ALL
  SELECT 'HOUSEHOLD_OWNER_MEMBERSHIP_MISSING', 'household', 'P0', count(*)::bigint,
         'Every existing household has an owner membership'
  FROM public.households h
  WHERE NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = h.id
      AND hm.user_id = h.owner_user_id
      AND hm.role = 'owner'
  )

  UNION ALL
  SELECT 'ACTIVE_WORKSPACE_MEMBERSHIP_INVALID', 'household', 'P0', count(*)::bigint,
         'Non-null active workspace belongs to the user membership set'
  FROM public.finance_workspace_preferences p
  WHERE p.active_household_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = p.user_id
        AND hm.household_id = p.active_household_id
    )

  UNION ALL
  SELECT 'HOUSEHOLD_MEMBER_UNEXPECTED_ROLE', 'household', 'P0', count(*)::bigint,
         'Household member role is owner, member, or viewer'
  FROM public.household_members hm
  WHERE hm.role NOT IN ('owner', 'member', 'viewer')

  -- Review and rule references are allowed to be actor/member-attributed.
  UNION ALL
  SELECT 'REVIEW_ACK_TRANSACTION_MISSING', 'review', 'P0', count(*)::bigint,
         'Review acknowledgment references an existing transaction'
  FROM public.transaction_review_acknowledgements a
  LEFT JOIN public.transactions t ON t.id = a.transaction_id
  WHERE t.id IS NULL

  UNION ALL
  SELECT 'REVIEW_ACK_TRANSACTION_WRONG_OWNER', 'review', 'P0', count(*)::bigint,
         'Review acknowledgment and transaction share finance owner'
  FROM public.transaction_review_acknowledgements a
  JOIN public.transactions t ON t.id = a.transaction_id
  WHERE a.user_id IS DISTINCT FROM t.user_id

  UNION ALL
  SELECT 'TXN_RULE_REF_WRONG_OWNER', 'rules', 'P0', count(*)::bigint,
         'Every referenced rule wallet/category belongs to the rule owner'
  FROM public.transaction_rules r
  LEFT JOIN public.wallets w1 ON w1.id = r.wallet_id
  LEFT JOIN public.wallets w2 ON w2.id = r.action_wallet_id
  LEFT JOIN public.categories c ON c.id = r.action_category_id
  WHERE (w1.id IS NOT NULL AND w1.user_id IS DISTINCT FROM r.user_id)
     OR (w2.id IS NOT NULL AND w2.user_id IS DISTINCT FROM r.user_id)
     OR (c.id IS NOT NULL AND c.user_id IS DISTINCT FROM r.user_id)

  UNION ALL
  SELECT 'TXN_RULE_REF_MISSING', 'rules', 'P1', count(*)::bigint,
         'Non-null rule wallet/category references resolve'
  FROM public.transaction_rules r
  LEFT JOIN public.wallets w1 ON w1.id = r.wallet_id
  LEFT JOIN public.wallets w2 ON w2.id = r.action_wallet_id
  LEFT JOIN public.categories c ON c.id = r.action_category_id
  WHERE (r.wallet_id IS NOT NULL AND w1.id IS NULL)
     OR (r.action_wallet_id IS NOT NULL AND w2.id IS NULL)
     OR (r.action_category_id IS NOT NULL AND c.id IS NULL)

  -- Reconciliation receipts are not a running balance reconstruction.
  UNION ALL
  SELECT 'RECONCILIATION_WALLET_WRONG_OWNER', 'reconciliation', 'P0', count(*)::bigint,
         'Reconciliation receipt wallet and finance owner agree'
  FROM public.wallet_reconciliations r
  JOIN public.wallets w ON w.id = r.wallet_id
  WHERE w.user_id IS DISTINCT FROM r.user_id

  UNION ALL
  SELECT 'RECONCILIATION_WALLET_MISSING', 'reconciliation', 'P0', count(*)::bigint,
         'Reconciliation receipt references an existing wallet'
  FROM public.wallet_reconciliations r
  LEFT JOIN public.wallets w ON w.id = r.wallet_id
  WHERE w.id IS NULL

  UNION ALL
  SELECT 'WALLETS_WITHOUT_RECONCILIATION', 'reconciliation', 'INFO', count(*)::bigint,
         'Spendable wallets without any reconciliation receipt (coverage only)'
  FROM public.wallets w
  WHERE w.type::text IN ('cash', 'bank', 'ewallet')
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_reconciliations r
      WHERE r.wallet_id = w.id AND r.user_id = w.user_id
    )

  UNION ALL
  SELECT 'RECONCILIATION_STALE_90D', 'reconciliation', 'INFO', count(*)::bigint,
         'Spendable wallets with reconciliation history but none in last 90 days'
  FROM public.wallets w
  WHERE w.type::text IN ('cash', 'bank', 'ewallet')
    AND EXISTS (
      SELECT 1 FROM public.wallet_reconciliations r
      WHERE r.wallet_id = w.id AND r.user_id = w.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_reconciliations r
      WHERE r.wallet_id = w.id AND r.user_id = w.user_id
        AND r.reconciled_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    )

  UNION ALL
  SELECT 'FINANCE_AUDIT_EXISTING_HOUSEHOLD_OWNER_MISMATCH', 'audit', 'P1', count(*)::bigint,
         'Historical audit owner matches existing household owner (deleted households exempt)'
  FROM public.finance_audit_log l
  JOIN public.households h ON h.id = l.household_id
  WHERE l.finance_owner_user_id IS DISTINCT FROM h.owner_user_id
),
scored AS (
  SELECT check_id, domain, priority, issue_count, expectation,
         CASE WHEN priority = 'INFO' THEN 'INFO'
              WHEN issue_count = 0 THEN 'PASS'
              WHEN priority = 'P0' THEN 'FAIL'
              ELSE 'WARN' END AS status
  FROM findings
)
SELECT check_id, domain, priority, status, issue_count, expectation,
       count(*) FILTER (WHERE status = 'FAIL') OVER () AS failed_checks,
       count(*) FILTER (WHERE status = 'WARN') OVER () AS warning_checks,
       CURRENT_TIMESTAMP AS checked_at
FROM scored
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1
                     WHEN 'INFO' THEN 2 ELSE 3 END,
         domain, check_id;
