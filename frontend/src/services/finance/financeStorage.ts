import { supabase } from "@/src/lib/supabase";

import {
  demoBudgets,
  demoCategories,
  demoDebts,
  demoGoals,
  demoInvestments,
  demoTransactions,
  demoWallets,
} from "@/src/data/demoFinanceData";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

// ─── Readers ─────────────────────────────────────────────────────────────────

export async function getWallets(): Promise<Wallet[]> {
  const { data } = await supabase.from("wallets").select("*");
  return (data ?? []) as Wallet[];
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("*");
  return (data ?? []) as Category[];
}

export async function getTransactions(): Promise<Transaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });
  return (data ?? []) as Transaction[];
}

export async function getDebts(): Promise<Debt[]> {
  const { data } = await supabase.from("debts").select("*");
  return (data ?? []) as Debt[];
}

export async function getGoals(): Promise<Goal[]> {
  const { data } = await supabase.from("goals").select("*");
  return (data ?? []) as Goal[];
}

export async function getBudgets(): Promise<Budget[]> {
  const { data } = await supabase.from("budgets").select("*");
  return (data ?? []) as Budget[];
}

export async function getInvestments(): Promise<Investment[]> {
  const { data } = await supabase.from("investments").select("*");
  return (data ?? []) as Investment[];
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

export async function initFinanceDemoData() {
  const { data } = await supabase.from("wallets").select("id").limit(1);
  if (data && data.length > 0) return;

  await Promise.all([
    supabase
      .from("wallets")
      .upsert(demoWallets, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("categories")
      .upsert(demoCategories, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("transactions")
      .upsert(demoTransactions, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("debts")
      .upsert(demoDebts, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("goals")
      .upsert(demoGoals, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("budgets")
      .upsert(demoBudgets, { onConflict: "id", ignoreDuplicates: true }),
    supabase
      .from("investments")
      .upsert(demoInvestments, { onConflict: "id", ignoreDuplicates: true }),
  ]);
}

export async function resetFinanceDemoData() {
  await Promise.all([
    supabase.from("transactions").delete().neq("id", ""),
    supabase.from("budgets").delete().neq("id", ""),
    supabase.from("goals").delete().neq("id", ""),
    supabase.from("debts").delete().neq("id", ""),
    supabase.from("investments").delete().neq("id", ""),
    supabase.from("categories").delete().neq("id", ""),
    supabase.from("wallets").delete().neq("id", ""),
  ]);

  await Promise.all([
    supabase.from("wallets").insert(demoWallets),
    supabase.from("categories").insert(demoCategories),
    supabase.from("transactions").insert(demoTransactions),
    supabase.from("debts").insert(demoDebts),
    supabase.from("goals").insert(demoGoals),
    supabase.from("budgets").insert(demoBudgets),
    supabase.from("investments").insert(demoInvestments),
  ]);
}

export async function clearAllData() {
  await Promise.all([
    supabase.from("transactions").delete().neq("id", ""),
    supabase.from("budgets").delete().neq("id", ""),
    supabase.from("goals").delete().neq("id", ""),
    supabase.from("debts").delete().neq("id", ""),
    supabase.from("investments").delete().neq("id", ""),
    supabase.from("categories").delete().neq("id", ""),
    supabase.from("wallets").delete().neq("id", ""),
  ]);
}

export async function importAllData(data: {
  wallets?: Wallet[];
  categories?: Category[];
  transactions?: Transaction[];
  debts?: Debt[];
  goals?: Goal[];
  budgets?: Budget[];
  investments?: Investment[];
}) {
  await clearAllData();

  const inserts: PromiseLike<unknown>[] = [];

  if (data.wallets?.length)
    inserts.push(supabase.from("wallets").insert(data.wallets));
  if (data.categories?.length)
    inserts.push(supabase.from("categories").insert(data.categories));
  if (data.transactions?.length)
    inserts.push(supabase.from("transactions").insert(data.transactions));
  if (data.debts?.length)
    inserts.push(supabase.from("debts").insert(data.debts));
  if (data.goals?.length)
    inserts.push(supabase.from("goals").insert(data.goals));
  if (data.budgets?.length)
    inserts.push(supabase.from("budgets").insert(data.budgets));
  if (data.investments?.length)
    inserts.push(supabase.from("investments").insert(data.investments));

  await Promise.all(inserts);
}

// ─── Transaction CRUD + Wallet Balance Sync ───────────────────────────────────

/**
 * Compute the signed delta a transaction applies to its source wallet.
 * Transfers are handled separately (negative on source, positive on destination).
 */
function walletDelta(tx: Transaction): number {
  if (tx.type === "income") return tx.amount;
  if (tx.type === "expense") return -tx.amount;
  return -tx.amount; // transfer: source loses amount
}

export async function addTransaction(transaction: Transaction) {
  if (transaction.type === "transfer") {
    // Fetch both wallets in one round-trip
    const walletsToUpdate = [
      transaction.walletId,
      transaction.transferToWalletId,
    ].filter(Boolean) as string[];
    const { data: walletData } = await supabase
      .from("wallets")
      .select("*")
      .in("id", walletsToUpdate);

    const wallets = (walletData ?? []) as Wallet[];
    const updates = wallets.map((w) => {
      const delta =
        w.id === transaction.walletId
          ? -transaction.amount
          : transaction.amount;
      return supabase
        .from("wallets")
        .update({ balance: w.balance + delta })
        .eq("id", w.id);
    });
    await Promise.all(updates);
    await supabase.from("transactions").insert(transaction);
    return;
  }

  // Income / Expense
  const { data: walletData } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", transaction.walletId)
    .limit(1);

  const wallet = walletData?.[0] as Wallet | undefined;
  if (wallet) {
    await supabase
      .from("wallets")
      .update({ balance: wallet.balance + walletDelta(transaction) })
      .eq("id", wallet.id);
  }
  await supabase.from("transactions").insert(transaction);
}

export async function updateTransaction(updatedTransaction: Transaction) {
  const { data: oldData } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", updatedTransaction.id)
    .limit(1);

  const oldTransaction = oldData?.[0] as Transaction | undefined;

  if (oldTransaction) {
    // Collect every unique wallet ID touched by old + new transaction
    const allIds = [
      oldTransaction.walletId,
      oldTransaction.transferToWalletId,
      updatedTransaction.walletId,
      updatedTransaction.transferToWalletId,
    ].filter((id): id is string => !!id);
    const uniqueIds = [...new Set(allIds)];

    const { data: walletData } = await supabase
      .from("wallets")
      .select("*")
      .in("id", uniqueIds);

    // Build a balance map and compute net changes in memory
    const balanceMap = new Map<string, number>(
      ((walletData ?? []) as Wallet[]).map((w) => [w.id, w.balance]),
    );

    // Reverse old transaction effects
    const reverseEffect = (tx: Transaction, sign: -1 | 1) => {
      const srcBal = balanceMap.get(tx.walletId);
      if (srcBal !== undefined) {
        balanceMap.set(tx.walletId, srcBal + walletDelta(tx) * sign);
      }
      if (tx.type === "transfer" && tx.transferToWalletId) {
        const dstBal = balanceMap.get(tx.transferToWalletId);
        if (dstBal !== undefined) {
          // transfer destination received +amount; to reverse, subtract
          balanceMap.set(tx.transferToWalletId, dstBal - tx.amount * sign);
        }
      }
    };

    reverseEffect(oldTransaction, -1); // undo old
    reverseEffect(updatedTransaction, 1); // apply new

    // Persist updated balances
    await Promise.all(
      [...balanceMap.entries()].map(([id, balance]) =>
        supabase.from("wallets").update({ balance }).eq("id", id),
      ),
    );
  }

  await supabase
    .from("transactions")
    .update(updatedTransaction)
    .eq("id", updatedTransaction.id);
}

export async function deleteTransaction(transactionId: string) {
  const { data: transactionData } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .limit(1);

  const transaction = transactionData?.[0] as Transaction | undefined;

  if (transaction) {
    if (transaction.type === "transfer") {
      // Reverse both legs of the transfer
      const walletsToUpdate = [
        transaction.walletId,
        transaction.transferToWalletId,
      ].filter(Boolean) as string[];
      const { data: walletData } = await supabase
        .from("wallets")
        .select("*")
        .in("id", walletsToUpdate);

      const wallets = (walletData ?? []) as Wallet[];
      const updates = wallets.map((w) => {
        // Source lost amount; restore it. Destination gained amount; remove it.
        const delta =
          w.id === transaction.walletId
            ? transaction.amount
            : -transaction.amount;
        return supabase
          .from("wallets")
          .update({ balance: w.balance + delta })
          .eq("id", w.id);
      });
      await Promise.all(updates);
    } else {
      const { data: walletData } = await supabase
        .from("wallets")
        .select("*")
        .eq("id", transaction.walletId)
        .limit(1);

      const wallet = walletData?.[0] as Wallet | undefined;
      if (wallet) {
        // Reverse the effect: undo walletDelta
        await supabase
          .from("wallets")
          .update({ balance: wallet.balance - walletDelta(transaction) })
          .eq("id", wallet.id);
      }
    }
  }

  await supabase.from("transactions").delete().eq("id", transactionId);
}

// ─── Wallet CRUD ──────────────────────────────────────────────────────────────

export async function addWallet(wallet: Wallet) {
  await supabase.from("wallets").insert(wallet);
}

export async function updateWallet(updatedWallet: Wallet) {
  await supabase
    .from("wallets")
    .update(updatedWallet)
    .eq("id", updatedWallet.id);
}

export async function deleteWallet(walletId: string) {
  await supabase.from("wallets").delete().eq("id", walletId);
}

// ─── Category CRUD ────────────────────────────────────────────────────────────

export async function addCategory(category: Category) {
  await supabase.from("categories").insert(category);
}

export async function updateCategory(updatedCategory: Category) {
  await supabase
    .from("categories")
    .update(updatedCategory)
    .eq("id", updatedCategory.id);
}

export async function deleteCategory(categoryId: string) {
  await supabase.from("categories").delete().eq("id", categoryId);
}

// ─── Budget CRUD ──────────────────────────────────────────────────────────────

export async function addBudget(budget: Budget) {
  await supabase.from("budgets").insert(budget);
}

export async function updateBudget(updatedBudget: Budget) {
  await supabase
    .from("budgets")
    .update(updatedBudget)
    .eq("id", updatedBudget.id);
}

export async function deleteBudget(budgetId: string) {
  await supabase.from("budgets").delete().eq("id", budgetId);
}

// ─── Goal CRUD ────────────────────────────────────────────────────────────────

export async function addGoal(goal: Goal) {
  await supabase.from("goals").insert(goal);
}

export async function updateGoal(updatedGoal: Goal) {
  await supabase.from("goals").update(updatedGoal).eq("id", updatedGoal.id);
}

export async function deleteGoal(goalId: string) {
  await supabase.from("goals").delete().eq("id", goalId);
}

// ─── Debt CRUD ────────────────────────────────────────────────────────────────

export async function addDebt(debt: Debt) {
  await supabase.from("debts").insert(debt);
}

export async function updateDebt(updatedDebt: Debt) {
  await supabase.from("debts").update(updatedDebt).eq("id", updatedDebt.id);
}

export async function deleteDebt(debtId: string) {
  await supabase.from("debts").delete().eq("id", debtId);
}

// ─── Investment CRUD ──────────────────────────────────────────────────────────

export async function addInvestment(investment: Investment) {
  await supabase.from("investments").insert(investment);
}

export async function updateInvestment(updatedInvestment: Investment) {
  await supabase
    .from("investments")
    .update(updatedInvestment)
    .eq("id", updatedInvestment.id);
}

export async function deleteInvestment(investmentId: string) {
  await supabase.from("investments").delete().eq("id", investmentId);
}
