import { supabase } from "@/src/lib/supabase";

import { buildDemoFinanceData } from "@/src/data/demoFinanceData";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const ERR_NO_AUTH = "Không có phiên đăng nhập. Vui lòng đăng nhập lại.";

// ─── Readers ─────────────────────────────────────────────────────────────────

export async function getWallets(): Promise<Wallet[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getWallets:", error.message);
  return (data ?? []) as Wallet[];
}

export async function getCategories(): Promise<Category[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getCategories:", error.message);
  return (data ?? []) as Category[];
}

export async function getTransactions(): Promise<Transaction[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) console.error("[financeStorage] getTransactions:", error.message);
  return (data ?? []) as Transaction[];
}

export async function getDebts(): Promise<Debt[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getDebts:", error.message);
  return (data ?? []) as Debt[];
}

export async function getGoals(): Promise<Goal[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getGoals:", error.message);
  return (data ?? []) as Goal[];
}

export async function getBudgets(): Promise<Budget[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getBudgets:", error.message);
  return (data ?? []) as Budget[];
}

export async function getInvestments(): Promise<Investment[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getInvestments:", error.message);
  return (data ?? []) as Investment[];
}

// ─── Demo seed guard ──────────────────────────────────────────────────────────
// Key stored in localStorage per user. When set, initFinanceDemoData() is a
// no-op — ensures demo data never re-seeds after "Clear All Data".

function seedGuardKey(userId: string): string {
  return `mf-skip-auto-seed-${userId}`;
}

function isSeedBlocked(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(seedGuardKey(userId)) === "1";
}

function blockSeed(userId: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(seedGuardKey(userId), "1");
  }
}

function unblockSeed(userId: string): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(seedGuardKey(userId));
  }
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

/**
 * Seeds demo data on first login ONLY.
 * Skipped when:
 *  (a) the user already has wallets in Supabase, OR
 *  (b) the seed-guard flag is set (e.g. after "Clear All Data").
 * Safe to call on every page mount — it is a no-op in both cases above.
 */
export async function initFinanceDemoData() {
  const userId = await getAuthUserId();
  if (!userId) return;

  // Respect explicit "do not auto-seed" flag set by clearAllUserData
  if (isSeedBlocked(userId)) return;

  // Check whether this user already has data
  const { data } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (data && data.length > 0) return;

  const demoData = buildDemoFinanceData(userId);

  await Promise.all([
    supabase.from("wallets").upsert(
      demoData.wallets.map((w) => ({ ...w, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("categories").upsert(
      demoData.categories.map((c) => ({ ...c, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("transactions").upsert(
      demoData.transactions.map((t) => ({ ...t, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("debts").upsert(
      demoData.debts.map((d) => ({ ...d, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("goals").upsert(
      demoData.goals.map((g) => ({ ...g, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("budgets").upsert(
      demoData.budgets.map((b) => ({ ...b, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("investments").upsert(
      demoData.investments.map((i) => ({ ...i, user_id: userId })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
  ]);
}

export async function resetFinanceDemoData(): Promise<{
  error: string | null;
}> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // Allow auto-seed to work again after an explicit reset
  unblockSeed(userId);

  const deleteErrors = await Promise.all([
    supabase.from("transactions").delete().eq("user_id", userId),
    supabase.from("budgets").delete().eq("user_id", userId),
    supabase.from("goals").delete().eq("user_id", userId),
    supabase.from("debts").delete().eq("user_id", userId),
    supabase.from("investments").delete().eq("user_id", userId),
    supabase.from("categories").delete().eq("user_id", userId),
    supabase.from("wallets").delete().eq("user_id", userId),
  ]);
  const firstDeleteErr = deleteErrors.find((r) => r.error)?.error;
  if (firstDeleteErr) {
    console.error(
      "[financeStorage] resetFinanceDemoData delete:",
      firstDeleteErr.message,
    );
    return { error: firstDeleteErr.message };
  }

  const demoData = buildDemoFinanceData(userId);

  const insertErrors = await Promise.all([
    supabase
      .from("wallets")
      .insert(demoData.wallets.map((w) => ({ ...w, user_id: userId }))),
    supabase
      .from("categories")
      .insert(demoData.categories.map((c) => ({ ...c, user_id: userId }))),
    supabase
      .from("transactions")
      .insert(demoData.transactions.map((t) => ({ ...t, user_id: userId }))),
    supabase
      .from("debts")
      .insert(demoData.debts.map((d) => ({ ...d, user_id: userId }))),
    supabase
      .from("goals")
      .insert(demoData.goals.map((g) => ({ ...g, user_id: userId }))),
    supabase
      .from("budgets")
      .insert(demoData.budgets.map((b) => ({ ...b, user_id: userId }))),
    supabase
      .from("investments")
      .insert(demoData.investments.map((i) => ({ ...i, user_id: userId }))),
  ]);
  const firstInsertErr = insertErrors.find((r) => r.error)?.error;
  if (firstInsertErr) {
    console.error(
      "[financeStorage] resetFinanceDemoData insert:",
      firstInsertErr.message,
    );
    return { error: firstInsertErr.message };
  }

  return { error: null };
}

export async function clearAllUserData(): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // Sequential deletes to respect FK dependency order:
  // child rows first, parent rows (wallets) last.
  const steps: [string, string][] = [
    ["transactions", "Giao dịch"],
    ["budgets", "Ngân sách"],
    ["goals", "Mục tiêu"],
    ["debts", "Khoản nợ"],
    ["investments", "Đầu tư"],
    ["categories", "Danh mục"],
    ["wallets", "Ví tiền"],
  ];

  for (const [table, label] of steps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table) as any)
      .delete()
      .eq("user_id", userId);
    if (error) {
      console.error(
        `[financeStorage] clearAllUserData – ${label} (${table}):`,
        error.message,
      );
      return {
        error: `Không thể xóa ${label}: ${(error as { message: string }).message}`,
      };
    }
  }

  // Prevent auto-seed from re-populating demo data on next page load
  blockSeed(userId);

  return { error: null };
}

/** @deprecated Use clearAllUserData() — kept for internal use by importAllData */
export const clearAllData = clearAllUserData;

export async function importAllData(data: {
  wallets?: Wallet[];
  categories?: Category[];
  transactions?: Transaction[];
  debts?: Debt[];
  goals?: Goal[];
  budgets?: Budget[];
  investments?: Investment[];
}): Promise<{ error: string | null }> {
  const clearResult = await clearAllUserData();
  if (clearResult.error) return clearResult;

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (
    table: string,
    rows: object[],
  ): Promise<{ error: string | null }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table) as any).insert(rows);
    return { error: (error as { message: string } | null)?.message ?? null };
  };

  const inserts: Promise<{ error: string | null }>[] = [];

  if (data.wallets?.length)
    inserts.push(
      run(
        "wallets",
        data.wallets.map((w) => ({ ...w, user_id: userId })),
      ),
    );
  if (data.categories?.length)
    inserts.push(
      run(
        "categories",
        data.categories.map((c) => ({ ...c, user_id: userId })),
      ),
    );
  if (data.transactions?.length)
    inserts.push(
      run(
        "transactions",
        data.transactions.map((t) => ({ ...t, user_id: userId })),
      ),
    );
  if (data.debts?.length)
    inserts.push(
      run(
        "debts",
        data.debts.map((d) => ({ ...d, user_id: userId })),
      ),
    );
  if (data.goals?.length)
    inserts.push(
      run(
        "goals",
        data.goals.map((g) => ({ ...g, user_id: userId })),
      ),
    );
  if (data.budgets?.length)
    inserts.push(
      run(
        "budgets",
        data.budgets.map((b) => ({ ...b, user_id: userId })),
      ),
    );
  if (data.investments?.length)
    inserts.push(
      run(
        "investments",
        data.investments.map((i) => ({ ...i, user_id: userId })),
      ),
    );

  const results = await Promise.all(inserts);
  const firstErr = results.find((r) => r.error !== null)?.error ?? null;
  if (firstErr) {
    console.error("[financeStorage] importAllData:", firstErr);
    return { error: firstErr };
  }
  return { error: null };
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

export async function addTransaction(
  transaction: Transaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const walletIds = [
    transaction.walletId,
    transaction.type === "transfer"
      ? transaction.transferToWalletId
      : undefined,
  ].filter((id): id is string => !!id);

  const uniqueWalletIds = [...new Set(walletIds)];

  const { data: walletData, error: fetchErr } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .in("id", uniqueWalletIds);

  if (fetchErr) {
    console.error(
      "[financeStorage] addTransaction – fetch wallets:",
      fetchErr.message,
    );
    return { error: fetchErr.message };
  }

  const wallets = (walletData ?? []) as Wallet[];
  const originalBalances = new Map(wallets.map((w) => [w.id, w.balance]));
  const nextBalances = new Map(originalBalances);

  if (transaction.type === "transfer") {
    if (!transaction.transferToWalletId) {
      return { error: "Vui lòng chọn ví nhận tiền." };
    }
    if (transaction.walletId === transaction.transferToWalletId) {
      return { error: "Ví chuyển và ví nhận không được trùng nhau." };
    }

    const sourceBalance = nextBalances.get(transaction.walletId);
    const targetBalance = nextBalances.get(transaction.transferToWalletId);

    if (sourceBalance === undefined || targetBalance === undefined) {
      return { error: "Không tìm thấy ví chuyển hoặc ví nhận." };
    }

    nextBalances.set(transaction.walletId, sourceBalance - transaction.amount);
    nextBalances.set(
      transaction.transferToWalletId,
      targetBalance + transaction.amount,
    );
  } else {
    const currentBalance = nextBalances.get(transaction.walletId);
    if (currentBalance !== undefined) {
      nextBalances.set(
        transaction.walletId,
        currentBalance + walletDelta(transaction),
      );
    }
  }

  // Insert the transaction first. If it fails, wallet balances remain untouched.
  const { error: txErr } = await supabase
    .from("transactions")
    .insert({ ...transaction, user_id: userId });

  if (txErr) {
    console.error("[financeStorage] addTransaction:", txErr.message);
    return { error: txErr.message };
  }

  // Then sync wallet balances. If a wallet update fails, roll the inserted
  // transaction back so transaction history and balances do not diverge.
  const changedBalances = [...nextBalances.entries()].filter(
    ([id, balance]) => originalBalances.get(id) !== balance,
  );

  const updateResults = await Promise.all(
    changedBalances.map(([id, balance]) =>
      supabase
        .from("wallets")
        .update({ balance })
        .eq("id", id)
        .eq("user_id", userId),
    ),
  );

  const walletErr = updateResults.find((r) => r.error)?.error;
  if (walletErr) {
    await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id)
      .eq("user_id", userId);

    console.error(
      "[financeStorage] addTransaction – wallet rollback:",
      walletErr.message,
    );
    return { error: walletErr.message };
  }

  return { error: null };
}

export async function updateTransaction(
  updatedTransaction: Transaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { data: oldData, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", updatedTransaction.id)
    .eq("user_id", userId)
    .limit(1);

  if (fetchErr) {
    console.error(
      "[financeStorage] updateTransaction – fetch:",
      fetchErr.message,
    );
    return { error: fetchErr.message };
  }

  const oldTransaction = oldData?.[0] as Transaction | undefined;

  if (oldTransaction) {
    const allIds = [
      oldTransaction.walletId,
      oldTransaction.transferToWalletId,
      updatedTransaction.walletId,
      updatedTransaction.transferToWalletId,
    ].filter((id): id is string => !!id);
    const uniqueIds = [...new Set(allIds)];

    const { data: walletData, error: walletFetchErr } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .in("id", uniqueIds);

    if (walletFetchErr) {
      console.error(
        "[financeStorage] updateTransaction – fetch wallets:",
        walletFetchErr.message,
      );
      return { error: walletFetchErr.message };
    }

    const balanceMap = new Map<string, number>(
      ((walletData ?? []) as Wallet[]).map((w) => [w.id, w.balance]),
    );

    const reverseEffect = (tx: Transaction, sign: -1 | 1) => {
      const srcBal = balanceMap.get(tx.walletId);
      if (srcBal !== undefined) {
        balanceMap.set(tx.walletId, srcBal + walletDelta(tx) * sign);
      }
      if (tx.type === "transfer" && tx.transferToWalletId) {
        const dstBal = balanceMap.get(tx.transferToWalletId);
        if (dstBal !== undefined) {
          balanceMap.set(tx.transferToWalletId, dstBal - tx.amount * sign);
        }
      }
    };

    reverseEffect(oldTransaction, -1);
    reverseEffect(updatedTransaction, 1);

    const updateResults = await Promise.all(
      [...balanceMap.entries()].map(([id, balance]) =>
        supabase
          .from("wallets")
          .update({ balance })
          .eq("id", id)
          .eq("user_id", userId),
      ),
    );
    const balErr = updateResults.find((r) => r.error)?.error;
    if (balErr) {
      console.error(
        "[financeStorage] updateTransaction – wallet balance:",
        balErr.message,
      );
      return { error: balErr.message };
    }
  }

  const { error: txErr } = await supabase
    .from("transactions")
    .update({ ...updatedTransaction, user_id: userId })
    .eq("id", updatedTransaction.id)
    .eq("user_id", userId);

  if (txErr) {
    console.error("[financeStorage] updateTransaction:", txErr.message);
    return { error: txErr.message };
  }
  return { error: null };
}

export async function deleteTransaction(
  transactionId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { data: transactionData, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .limit(1);

  if (fetchErr) {
    console.error(
      "[financeStorage] deleteTransaction – fetch:",
      fetchErr.message,
    );
    return { error: fetchErr.message };
  }

  const transaction = transactionData?.[0] as Transaction | undefined;

  if (transaction) {
    if (transaction.type === "transfer") {
      const walletsToUpdate = [
        transaction.walletId,
        transaction.transferToWalletId,
      ].filter(Boolean) as string[];

      const { data: walletData, error: walletFetchErr } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .in("id", walletsToUpdate);

      if (walletFetchErr) {
        console.error(
          "[financeStorage] deleteTransaction – fetch wallets:",
          walletFetchErr.message,
        );
        return { error: walletFetchErr.message };
      }

      const wallets = (walletData ?? []) as Wallet[];
      const updateResults = await Promise.all(
        wallets.map((w) => {
          const delta =
            w.id === transaction.walletId
              ? transaction.amount
              : -transaction.amount;
          return supabase
            .from("wallets")
            .update({ balance: w.balance + delta })
            .eq("id", w.id)
            .eq("user_id", userId);
        }),
      );
      const balErr = updateResults.find((r) => r.error)?.error;
      if (balErr) {
        console.error(
          "[financeStorage] deleteTransaction – wallet balance:",
          balErr.message,
        );
        return { error: balErr.message };
      }
    } else {
      const { data: walletData, error: walletFetchErr } = await supabase
        .from("wallets")
        .select("*")
        .eq("id", transaction.walletId)
        .eq("user_id", userId)
        .limit(1);

      if (walletFetchErr) {
        console.error(
          "[financeStorage] deleteTransaction – fetch wallet:",
          walletFetchErr.message,
        );
        return { error: walletFetchErr.message };
      }

      const wallet = walletData?.[0] as Wallet | undefined;
      if (wallet) {
        const { error: balErr } = await supabase
          .from("wallets")
          .update({ balance: wallet.balance - walletDelta(transaction) })
          .eq("id", wallet.id)
          .eq("user_id", userId);
        if (balErr) {
          console.error(
            "[financeStorage] deleteTransaction – balance:",
            balErr.message,
          );
          return { error: balErr.message };
        }
      }
    }
  }

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (delErr) {
    console.error("[financeStorage] deleteTransaction:", delErr.message);
    return { error: delErr.message };
  }
  return { error: null };
}

// ─── Wallet CRUD ──────────────────────────────────────────────────────────────

export async function addWallet(
  wallet: Wallet,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .insert({ ...wallet, user_id: userId });
  if (error) {
    console.error("[financeStorage] addWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateWallet(
  updatedWallet: Wallet,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .update(updatedWallet)
    .eq("id", updatedWallet.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteWallet(
  walletId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .delete()
    .eq("id", walletId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Category CRUD ────────────────────────────────────────────────────────────

export async function addCategory(
  category: Category,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .insert({ ...category, user_id: userId });
  if (error) {
    console.error("[financeStorage] addCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateCategory(
  updatedCategory: Category,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .update(updatedCategory)
    .eq("id", updatedCategory.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteCategory(
  categoryId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Budget CRUD ──────────────────────────────────────────────────────────────

export async function addBudget(
  budget: Budget,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .insert({ ...budget, user_id: userId });
  if (error) {
    console.error("[financeStorage] addBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateBudget(
  updatedBudget: Budget,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .update(updatedBudget)
    .eq("id", updatedBudget.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteBudget(
  budgetId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Goal CRUD ────────────────────────────────────────────────────────────────

export async function addGoal(goal: Goal): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .insert({ ...goal, user_id: userId });
  if (error) {
    console.error("[financeStorage] addGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateGoal(
  updatedGoal: Goal,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .update(updatedGoal)
    .eq("id", updatedGoal.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteGoal(
  goalId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Debt CRUD ────────────────────────────────────────────────────────────────

export async function addDebt(debt: Debt): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .insert({ ...debt, user_id: userId });
  if (error) {
    console.error("[financeStorage] addDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateDebt(
  updatedDebt: Debt,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .update(updatedDebt)
    .eq("id", updatedDebt.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteDebt(
  debtId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .delete()
    .eq("id", debtId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Investment CRUD ──────────────────────────────────────────────────────────

export async function addInvestment(
  investment: Investment,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .insert({ ...investment, user_id: userId });
  if (error) {
    console.error("[financeStorage] addInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateInvestment(
  updatedInvestment: Investment,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .update(updatedInvestment)
    .eq("id", updatedInvestment.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteInvestment(
  investmentId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("id", investmentId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
