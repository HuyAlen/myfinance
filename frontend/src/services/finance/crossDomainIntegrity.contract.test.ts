import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const savings = readFileSync(
  path.resolve(__dirname, "../../components/savings/SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const investments = readFileSync(
  path.resolve(__dirname, "../../components/investments/InvestmentsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const budgets = readFileSync(
  path.resolve(__dirname, "../../components/budgets/BudgetsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const transactions = readFileSync(
  path.resolve(__dirname, "../../components/transactions/TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const storage = readFileSync(
  path.resolve(__dirname, "financeStorage.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const databaseTypes = readFileSync(
  path.resolve(__dirname, "../../lib/database.types.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const budgetCloneSql = readFileSync(
  path.resolve(
    __dirname,
    "../../../supabase/cross-domain-integrity-1-budget-clone-atomic.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const normalizedStorage = storage.replace(/\s+/g, " ");

describe("CROSS-DOMAIN-INTEGRITY-1 ownership and reconciliation contracts", () => {
  it("keeps Savings money movement owned by Savings Engine and makes its mirrors read-only in Transactions", () => {
    expect(savings).toContain("createSavingAccount");
    expect(savings).toContain("createSavingMovement");
    expect(savings).toContain("deleteSavingAccount");
    expect(savings).toContain(
      '["savings", "saving_transactions", "wallets"]',
    );

    expect(transactions).toContain("isSavingsManagedTransaction");
    expect(transactions).toContain("const savingsManagedCount =");
    expect(transactions).toContain("if (isSavingsManagedTransaction(t))");
    expect(transactions).toContain("const savingsManagedTransaction =");

    expect(storage).toContain("SAVINGS_MANAGED_TRANSACTION_ERROR");
    expect(
      storage.match(/isSavingsManagedFinanceTransaction\(/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
  });

  it("centralizes Forex reads/mutations and uses canonical after-fee capital for derived state", () => {
    expect(investments).toContain("getForexAccounts()");
    expect(investments).toContain("getForexCashTransactions()");
    expect(investments).toContain("await addForexCashTransaction(transaction)");
    expect(investments).toContain("await updateForexCashTransaction(transaction)");
    expect(investments).toContain(
      "await deleteForexCashTransaction(transaction.id)",
    );
    expect(investments).toContain("const netCashFlow = getForexNetCapital(related);");
    expect(investments).toContain("getForexAssetValue(accounts, transactions)");
    expect(investments).toContain("Tổng nạp trừ tổng rút và phí");
    expect(investments).toContain(
      '["investments", "forex_accounts", "forex_cash_transactions", "wallets"]',
    );
    expect(investments).not.toContain('from("forex_accounts")');
    expect(investments).not.toContain('from("forex_cash_transactions")');
  });

  it("keeps Budgets transaction-derived and moves previous-month clone to one atomic server boundary", () => {
    expect(budgets).toContain(
      'useRealtimeTable(["budgets", "transactions", "categories"], reloadData)',
    );
    expect(budgets).toContain("computeSmartBudget(transactions, categories, budgets)");
    expect(budgets).toContain("clonePreviousMonthBudgets(activeMonth)");
    expect(budgets).not.toContain("for (const item of cloneItems)");
    expect(budgets).not.toContain("await addBudget(clonedBudget)");
    expect(budgets).not.toContain('from("saving_transactions")');
    expect(budgets).not.toContain('from("forex_cash_transactions")');

    expect(normalizedStorage).toContain(
      'supabase.rpc( "clone_previous_month_budgets_atomic"',
    );
    expect(storage).toContain("data.verified !== true");
    expect(storage).toContain("data.target_month !== targetMonth");
  });

  it("defines the budget clone as an authenticated, serialized Postgres transaction that rolls back on any SQL error", () => {
    const normalized = budgetCloneSql.replace(/\s+/g, " ").toLowerCase();

    expect(normalized).toContain("begin;");
    expect(normalized).toContain("commit;");
    expect(normalized).toContain(
      "create or replace function public.clone_previous_month_budgets_atomic",
    );
    expect(normalized).toContain("security invoker");
    expect(normalized).toContain(
      "lock table public.budgets in share row exclusive mode",
    );
    expect(normalized).toContain("source_budget.user_id = v_user_id");
    expect(normalized).toContain("source_budget.month = v_source_month");
    expect(normalized).toContain("and not exists (");
    expect(normalized).toContain("v_new_id := gen_random_uuid()");
    expect(normalized).toContain("insert into public.budgets");
    expect(normalized).toContain("'verified', true");
    expect(normalized).toContain(
      "revoke all on function public.clone_previous_month_budgets_atomic(text) from public, anon",
    );
    expect(normalized).toContain(
      "grant execute on function public.clone_previous_month_budgets_atomic(text) to authenticated",
    );
  });

  it("keeps generated database types aligned with the new atomic budget RPC", () => {
    expect(databaseTypes).toContain("clone_previous_month_budgets_atomic:");
    expect(databaseTypes).toContain("Args: { p_target_month: string }");
  });
});
