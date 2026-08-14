/**
 * UI-DASH-2 Budget Attention Layer.
 *
 * A small, pure derivation on top of the canonical budget engine
 * (`calculateBudgetSpendingCollection` in financeCalculations.ts) — this
 * module does not compute spend/limit/status itself. It only classifies
 * the canonical per-budget results into the compact summary the Dashboard
 * needs: how many budgets are over/near/healthy, and which item(s) are the
 * highest priority to show.
 *
 * No React/Supabase dependency, no new query — callers pass in whatever
 * `budgets`/`categories`/`transactions` they already have in state.
 */
import {
  calculateBudgetSpendingCollection,
  getCategoryPlanningGroup,
  type BudgetSpending,
} from "@/src/services/finance/financeCalculations";
import type { Budget, Category, Transaction } from "@/src/types/finance";

export type DashboardBudgetWorstOffender = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  /** "over" when this is an actual over-budget item; "near" when nothing
   * is over budget but this is a closest-to-the-limit warning item (see
   * the priority chain on `selectWorstOffender` below). */
  status: "over" | "near";
  spent: number;
  limit: number;
  overAmount: number;
  usagePercent: number;
};

export type DashboardBudgetAttention = {
  /** Budgets in the evaluated (already period-scoped) collection — the
   * denominator for "N/M ngân sách". Does not include budgets outside the
   * collection the caller passed in. */
  totalBudgets: number;
  /** Canonical status === "over" (spent > limit). Always equal to
   * `overBudgetItems.length` — derived FROM that array (not a separate
   * filter) so the count and the rendered list can never disagree. */
  overBudgetCount: number;
  /** Canonical status === "near" (spent >= 85% of limit) — the engine's
   * own warning threshold, not a value invented here. */
  warningCount: number;
  /** Everything else in the collection (status "on-track", "no-spend", or
   * the "no-budget" edge case of a configured 0-limit budget with
   * spending) — not currently a problem worth surfacing as a count of
   * its own. */
  healthyCount: number;
  /** ALL over-budget items (not just one), ranked controllable (variable
   * planning-group) first — since those are the ones a user can actually
   * act on — then by largest absolute overAmount, mirroring the existing
   * worst-offender rule already used by generateDashboardActions in
   * financeCalculations.ts for its own over-budget advisor action. Empty
   * when nothing is over budget. No cap — every over-budget item in the
   * evaluated collection is included. */
  overBudgetItems: DashboardBudgetWorstOffender[];
  /** The single highest-usagePercent "near" (>=85% of limit) item,
   * computed independent of over-budget state. Consumers must only
   * display this when `overBudgetItems` is empty — when real over-budget
   * problems exist, they take exclusive precedence over the near-limit
   * summary (see DashboardPage's Budget Attention render branch). */
  topWarning: DashboardBudgetWorstOffender | null;
  /** Backward-compatible single-item view: the highest-priority item
   * overall, following the same priority chain as before this patch —
   * (1) the top-ranked over-budget item, else (2) the top near-limit
   * item, else (3) null. Equivalent to
   * `overBudgetItems[0] ?? topWarning ?? null`. Prefer `overBudgetItems`
   * for rendering every over-budget item; this field remains for callers
   * that only need the single most urgent item. */
  worstOffender: DashboardBudgetWorstOffender | null;
};

function resolveCategoryName(
  spending: BudgetSpending,
  categoriesById: Map<string, Category>,
): string {
  return categoriesById.get(spending.categoryId)?.name ?? "Khác";
}

function toWorstOffender(
  spending: BudgetSpending,
  status: "over" | "near",
  categoriesById: Map<string, Category>,
): DashboardBudgetWorstOffender {
  return {
    budgetId: spending.budgetId,
    categoryId: spending.categoryId,
    categoryName: resolveCategoryName(spending, categoriesById),
    status,
    spent: spending.spent,
    limit: spending.limit,
    overAmount: spending.overAmount,
    usagePercent: spending.usagePercent,
  };
}

/** ALL over-budget items, ranked controllable-first then by largest
 * absolute overAmount. Same comparator this module has always used to
 * pick the single worst offender — now applied to the whole list rather
 * than to select just one. */
function rankOverBudgetItems(
  spendings: BudgetSpending[],
  categoriesById: Map<string, Category>,
): DashboardBudgetWorstOffender[] {
  return spendings
    .filter((spending) => spending.status === "over")
    .map((spending) => ({
      spending,
      isControllable:
        getCategoryPlanningGroup(categoriesById.get(spending.categoryId)) ===
        "variable",
    }))
    .sort((a, b) => {
      if (a.isControllable !== b.isControllable) {
        return a.isControllable ? -1 : 1;
      }
      return b.spending.overAmount - a.spending.overAmount;
    })
    .map(({ spending }) => toWorstOffender(spending, "over", categoriesById));
}

/** The single highest-usagePercent "near" item, or null when none exist.
 * Computed independent of over-budget state — the caller decides whether
 * it is actually appropriate to display (see `topWarning`'s doc comment
 * on DashboardBudgetAttention). */
function selectTopWarning(
  spendings: BudgetSpending[],
  categoriesById: Map<string, Category>,
): DashboardBudgetWorstOffender | null {
  const nearCandidates = spendings
    .filter((spending) => spending.status === "near")
    .sort((a, b) => b.usagePercent - a.usagePercent);

  if (nearCandidates.length > 0) {
    return toWorstOffender(nearCandidates[0], "near", categoriesById);
  }

  return null;
}

/**
 * Builds the Budget Attention summary from an already period-scoped
 * budget collection (the caller is responsible for selecting the
 * budgets relevant to the active Dashboard period — see DashboardPage's
 * `budgetAttentionMonthBudgets`, which mirrors `monthlyPulse`'s own
 * month-key filtering so the two cards never drift onto different budget
 * sets for the same selected period).
 */
export function buildDashboardBudgetAttention(input: {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
}): DashboardBudgetAttention {
  const spendings = calculateBudgetSpendingCollection({
    budgets: input.budgets,
    transactions: input.transactions,
    categories: input.categories,
  });

  const totalBudgets = spendings.length;
  const warningCount = spendings.filter(
    (spending) => spending.status === "near",
  ).length;

  const categoriesById = new Map(
    input.categories.map((category) => [category.id, category]),
  );

  const overBudgetItems = rankOverBudgetItems(spendings, categoriesById);
  const overBudgetCount = overBudgetItems.length;
  const healthyCount = totalBudgets - overBudgetCount - warningCount;
  const topWarning = selectTopWarning(spendings, categoriesById);

  return {
    totalBudgets,
    overBudgetCount,
    warningCount,
    healthyCount,
    overBudgetItems,
    topWarning,
    worstOffender: overBudgetItems[0] ?? topWarning ?? null,
  };
}
