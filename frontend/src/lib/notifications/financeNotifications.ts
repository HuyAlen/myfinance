/**
 * NOTIF-CORRECTNESS-1 — canonical, pure finance-notification rule engine.
 *
 * Pure, framework-free: no React, no Next.js, no Supabase. Extracted out of
 * Header.tsx's `buildNotifications` because that function had drifted from
 * the canonical `financeCalculations.ts` engine in four confirmed ways:
 *
 *   1. Budget severity was re-derived locally from the ALREADY-ROUNDED
 *      `usagePercent` with hardcoded 80%/100% cutoffs, instead of consuming
 *      `calculateBudgetSpending`'s own `status`/`isOverBudget` fields
 *      (computed from raw, unrounded spent/limit). A budget at e.g. 99.7%
 *      spent (genuinely under limit) rounds to "100%" and would have been
 *      misreported as "Vượt ngân sách" (exceeded) purely from rounding.
 *      The canonical threshold is also 85% for "near" (matching Budgets
 *      page, Dashboard's Budget Attention layer, and
 *      `deriveBudgetSpendingStatus`), not the 80% Header had invented.
 *   2. "Current month" was computed via `new Date().toISOString().slice(0,
 *      7)` — a UTC conversion. For any user in a timezone behind UTC, the
 *      hours before local midnight are already the next UTC day, so this
 *      could silently resolve to the WRONG month right at a month
 *      boundary (matching a nonexistent/irrelevant budget instead of the
 *      user's real current one). `DateFilterProvider.tsx`'s own
 *      `getDefaultMonth()` already establishes the correct, local-timezone
 *      pattern (`getFullYear()`/`getMonth()`) for this exact concept —
 *      `getCurrentLocalMonthKey` below mirrors it.
 *   3. Goal milestones read the raw `goal.currentAmount` field directly,
 *      ignoring linked-saving contributions
 *      (`getGoalLinkedSavingAmount`) that `calculateGoalFundingSnapshot`
 *      already accounts for everywhere else a goal's real progress is
 *      shown (Dashboard). A goal genuinely at 100% via linked savings
 *      could fail to fire "hoàn thành", or fire "sắp đạt" prematurely.
 *   4. The negative-cash-flow check summed `type === "expense"`
 *      transactions directly, without excluding saving/investment-
 *      planning-group-tagged expense rows the way the canonical
 *      `getTotalExpense`/`isRealExpenseTransaction` do everywhere else —
 *      inflating "expense" and risking a false "Dòng tiền âm tháng này"
 *      alert that Dashboard/Reports would not agree with for the same
 *      data.
 *
 * Debt-risk notifications are the one type that already used its sole
 * source of truth (`Debt.remainingAmount`/`totalAmount` are plain stored
 * fields — no separate canonical transactions-derived calculation exists
 * to drift from), so that rule is carried over unchanged.
 */
import {
  buildBudgetsHref,
  buildDebtsHref,
  buildGoalsHref,
} from "@/src/lib/navigation/financeNavigation";
import {
  calculateBudgetSpendingCollection,
  calculateGoalFundingSnapshot,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import type {
  Budget,
  Category,
  Debt,
  Goal,
  SavingAccount,
  Transaction,
} from "@/src/types/finance";

export type FinanceNotificationTone = "warning" | "success" | "info";

export type FinanceNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: FinanceNotificationTone;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The current calendar month as "YYYY-MM", using LOCAL date components —
 * not `toISOString()`, which converts to UTC and can silently resolve to
 * the wrong month near a local midnight boundary in any timezone behind
 * UTC. `now` is injectable (defaults to the real wall clock) purely so
 * this stays a deterministic, testable pure function.
 */
export function getCurrentLocalMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function buildBudgetNotifications(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  currentMonth: string,
): FinanceNotification[] {
  const monthBudgets = budgets.filter((b) => b.month === currentMonth);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const spendings = calculateBudgetSpendingCollection({
    budgets: monthBudgets,
    transactions,
    categories,
  });

  const out: FinanceNotification[] = [];
  for (const spending of spendings) {
    const label = categoryById.get(spending.categoryId)?.name ?? "Danh mục";

    // `status` (not the raw `isOverBudget` flag) drives both branches here:
    // `deriveBudgetSpendingStatus` special-cases an invalid/zero budget
    // limit to "no-budget" BEFORE it would otherwise satisfy `spent >
    // limit`, so a misconfigured 0-limit budget can never surface as a
    // contradictory "Vượt ngân sách ... 0%" alert (usagePercent is always
    // 0 when limit <= 0). Client-side budget creation already rejects a
    // limit <= 0, so this is defense-in-depth, not a reachable path today.
    if (spending.status === "over") {
      out.push({
        id: "bover-" + spending.budgetId,
        title: "Vượt ngân sách · " + label,
        body: "Đã chi " + spending.usagePercent + "% ngân sách tháng này.",
        href: buildBudgetsHref({ budgetId: spending.budgetId }),
        tone: "warning",
      });
    } else if (spending.status === "near") {
      out.push({
        id: "bnear-" + spending.budgetId,
        title: "Gần vượt ngân sách · " + label,
        body: "Đã dùng " + spending.usagePercent + "% giới hạn tháng này.",
        href: buildBudgetsHref({ budgetId: spending.budgetId }),
        tone: "warning",
      });
    }
  }
  return out;
}

function buildGoalNotifications(
  goals: Goal[],
  transactions: Transaction[],
  savings: SavingAccount[],
) {
  const out: FinanceNotification[] = [];
  for (const g of goals) {
    if (g.targetAmount <= 0) continue;
    const effectiveCurrentAmount = calculateGoalFundingSnapshot({
      goal: g,
      transactions,
      savings,
    }).effectiveCurrentAmount;
    const progress = effectiveCurrentAmount / g.targetAmount;

    if (effectiveCurrentAmount >= g.targetAmount) {
      out.push({
        id: "gdone-" + g.id,
        title: "Mục tiêu hoàn thành · " + g.name,
        body: "Chúc mừng! Bạn đã đạt được mục tiêu này.",
        href: buildGoalsHref({ goalId: g.id }),
        tone: "success",
      });
    } else if (progress >= 0.75) {
      out.push({
        id: "gnear-" + g.id,
        title: "Sắp đạt mục tiêu · " + g.name,
        body: Math.round(progress * 100) + "% hoàn thành — gần tới đích rồi!",
        href: buildGoalsHref({ goalId: g.id }),
        tone: "success",
      });
    }
  }
  return out;
}

function buildDebtNotifications(debts: Debt[]) {
  const out: FinanceNotification[] = [];
  for (const d of debts) {
    const paidPct =
      d.totalAmount > 0 ? (1 - d.remainingAmount / d.totalAmount) * 100 : 100;
    if (paidPct < 15 && d.remainingAmount > 0) {
      out.push({
        id: "drisk-" + d.id,
        title: "Nợ chưa thanh toán · " + d.name,
        body:
          "Mới hoàn trả " + Math.round(paidPct) + "%. Cân nhắc tăng tốc trả nợ.",
        href: buildDebtsHref({ debtId: d.id }),
        tone: "warning",
      });
    }
  }
  return out;
}

function buildCashFlowNotification(
  transactions: Transaction[],
  categories: Category[],
  currentMonth: string,
): FinanceNotification[] {
  const thisMonthTx = transactions.filter((t) =>
    t.date.startsWith(currentMonth),
  );
  if (thisMonthTx.length === 0) return [];

  const income = getTotalIncome(thisMonthTx);
  const expense = getTotalExpense(thisMonthTx, categories);
  if (expense <= income) return [];

  return [
    {
      id: "cashflow",
      title: "Dòng tiền âm tháng này",
      body: "Chi tiêu vượt thu nhập. Kiểm tra lại ngân sách và các khoản chi.",
      href: "/reports",
      tone: "warning",
    },
  ];
}

/**
 * Builds every finance notification for the current period, using each
 * domain's canonical calculation (never a second, locally-reimplemented
 * copy) so this can never silently disagree with what Budgets/Goals/
 * Dashboard/Reports show for the same underlying data. Capped at 8, same
 * as before this ticket — an existing, unrelated presentation limit.
 */
export function buildFinanceNotifications(input: {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  savings?: SavingAccount[];
  debts: Debt[];
  currentMonth: string;
}): FinanceNotification[] {
  return [
    ...buildBudgetNotifications(
      input.budgets,
      input.transactions,
      input.categories,
      input.currentMonth,
    ),
    ...buildGoalNotifications(
      input.goals,
      input.transactions,
      input.savings ?? [],
    ),
    ...buildDebtNotifications(input.debts),
    ...buildCashFlowNotification(
      input.transactions,
      input.categories,
      input.currentMonth,
    ),
  ].slice(0, 8);
}
