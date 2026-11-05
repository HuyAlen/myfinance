import type { Transaction } from "@/src/types/finance";
import {
  reconcileRecurringOccurrence,
  toRecurringScheduleInputs,
  type RecurringMoneySchedule,
} from "@/src/lib/recurring/recurringMoney";
import {
  expandRecurringScheduleOccurrences,
} from "@/src/lib/dashboard/dashboardIntelligence";
import type { RecurringMonthView } from "@/src/lib/recurring/recurringMonthView";

/**
 * RECURRING-SUMMARY-CARDS-POLISH-P2
 *
 * Monthly plans must come from the persisted recurrence ANCHOR, never the
 * "next unpaid" date used by the remainder-only cash-flow forecast. Otherwise
 * paying a bill makes its estimated amount disappear from the comparison.
 *
 * Both actual and variance are read-only, matched from existing transactions;
 * variance only compares already-recorded occurrences (not unpaid bills).
 */
export type RecurringMonthSummary = {
  totalCount: number;
  recordedCount: number;
  pendingCount: number;
  recordedIncomeCount: number;
  recordedExpenseCount: number;
  estimatedIncome: number;
  estimatedExpense: number;
  actualIncome: number;
  actualExpense: number;
  recordedEstimatedIncome: number;
  recordedEstimatedExpense: number;
  incomeDifference: number;
  expenseDifference: number;
};

export function buildRecurringMonthSummary(input: {
  viewMonth: RecurringMonthView;
  schedules: RecurringMoneySchedule[];
  transactions: Transaction[];
}): RecurringMonthSummary {
  const { viewMonth, schedules, transactions } = input;
  const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));

  // Validation + duplicate-category exclusion is centralized by P1.
  const plannedInputs = toRecurringScheduleInputs(schedules).map((schedule) => ({
    ...schedule,
    nextRunDate: schedulesById.get(schedule.id)?.nextRunDate ?? schedule.nextRunDate,
  }));
  const firstOfMonth = new Date(viewMonth.year, viewMonth.month - 1, 1);
  const plannedOccurrences = expandRecurringScheduleOccurrences(
    plannedInputs, firstOfMonth, viewMonth.horizonDays,
  ).filter((occurrence) =>
    occurrence.date.getFullYear() === viewMonth.year &&
    occurrence.date.getMonth() + 1 === viewMonth.month,
  );

  const result: RecurringMonthSummary = {
    totalCount: 0,
    recordedCount: 0,
    pendingCount: 0,
    recordedIncomeCount: 0,
    recordedExpenseCount: 0,
    estimatedIncome: 0,
    estimatedExpense: 0,
    actualIncome: 0,
    actualExpense: 0,
    recordedEstimatedIncome: 0,
    recordedEstimatedExpense: 0,
    incomeDifference: 0,
    expenseDifference: 0,
  };
  const usedTransactionIds = new Set<string>();
  const amountByTransactionId = new Map(transactions.map((transaction) =>
    [transaction.id, Math.abs(Number(transaction.amount) || 0)],
  ));

  for (const occurrence of plannedOccurrences) {
    const schedule = schedulesById.get(occurrence.scheduleId);
    if (!schedule) continue;
    const dueDate = `${occurrence.date.getFullYear()}-${String(occurrence.date.getMonth() + 1).padStart(2, "0")}-${String(occurrence.date.getDate()).padStart(2, "0")}`;
    const reconciliation = reconcileRecurringOccurrence({
      schedule, schedules, transactions, dueDate,
    });
    // Never assign ambiguous matching to a schedule or count it twice.
    if (reconciliation.status === "ambiguous") continue;

    const isExpense = occurrence.type === "expense";
    result.totalCount += 1;
    if (isExpense) result.estimatedExpense += occurrence.amount;
    else result.estimatedIncome += occurrence.amount;

    const uniqueIds = reconciliation.transactionIds.filter((id) => !usedTransactionIds.has(id));
    if (reconciliation.status !== "recorded" || uniqueIds.length === 0) {
      result.pendingCount += 1;
      continue;
    }

    let actualAmount = 0;
    for (const id of uniqueIds) {
      usedTransactionIds.add(id);
      actualAmount += amountByTransactionId.get(id) ?? 0;
    }
    result.recordedCount += 1;
    if (isExpense) {
      result.recordedExpenseCount += 1;
      result.actualExpense += actualAmount;
      result.recordedEstimatedExpense += occurrence.amount;
    } else {
      result.recordedIncomeCount += 1;
      result.actualIncome += actualAmount;
      result.recordedEstimatedIncome += occurrence.amount;
    }
  }
  result.expenseDifference = result.actualExpense - result.recordedEstimatedExpense;
  result.incomeDifference = result.actualIncome - result.recordedEstimatedIncome;
  return result;
}
