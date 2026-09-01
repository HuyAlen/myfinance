import { formatYearMonthInTimeZone, isValidYearMonth } from "@/src/lib/date/calendarDate";
import type { Category, Transaction } from "@/src/types/finance";
import { getRealExpenseTransactions } from "@/src/services/finance/financeCalculations";

const FINANCE_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_LOOKBACK_MONTHS = 6;
const DEFAULT_MINIMUM_MONTHS = 3;

export type StableEmergencyExpenseBaseline = {
  monthlyExpense: number;
  completedMonthCount: number;
  monthKeys: string[];
  isReliable: boolean;
};

export type EmergencyCoverageSnapshot = StableEmergencyExpenseBaseline & {
  emergencyFundBalance: number;
  coverageMonths: number | null;
  minimumMonths: number;
  minimumTargetAmount: number;
  minimumGap: number;
};

function currentFinanceMonth() {
  return formatYearMonthInTimeZone(new Date(), FINANCE_TIMEZONE);
}

function safeMonthKey(value: string) {
  const monthKey = value.slice(0, 7);
  return isValidYearMonth(monthKey) ? monthKey : null;
}

/**
 * Stable emergency-expense denominator.
 *
 * Rules:
 * - use canonical real-expense semantics;
 * - exclude the in-progress current/as-of month entirely;
 * - average up to the N most recent COMPLETED months that actually have
 *   observed real-expense data;
 * - missing months are not fabricated as zero-spend months;
 * - no completed observed month means "not enough evidence", not a healthy
 *   zero-expense assumption.
 */
export function calculateStableEmergencyExpenseBaseline(input: {
  transactions: Transaction[];
  categories?: Category[];
  asOfMonth?: string;
  lookbackMonths?: number;
}): StableEmergencyExpenseBaseline {
  const categories = input.categories ?? [];
  const requestedAsOfMonth = input.asOfMonth ?? currentFinanceMonth();
  const asOfMonth = isValidYearMonth(requestedAsOfMonth)
    ? requestedAsOfMonth
    : currentFinanceMonth();
  const lookbackMonths = Math.max(
    1,
    Math.min(24, Math.trunc(input.lookbackMonths ?? DEFAULT_LOOKBACK_MONTHS)),
  );

  const expenseByMonth = new Map<string, number>();
  for (const transaction of getRealExpenseTransactions(
    input.transactions,
    categories,
  )) {
    const monthKey = safeMonthKey(transaction.date);
    if (!monthKey || monthKey >= asOfMonth) continue;

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    expenseByMonth.set(monthKey, (expenseByMonth.get(monthKey) ?? 0) + amount);
  }

  const monthKeys = [...expenseByMonth.keys()]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, lookbackMonths);
  const totalExpense = monthKeys.reduce(
    (sum, monthKey) => sum + (expenseByMonth.get(monthKey) ?? 0),
    0,
  );
  const monthlyExpense =
    monthKeys.length > 0 ? totalExpense / monthKeys.length : 0;
  const isReliable = monthKeys.length > 0 && monthlyExpense > 0;

  return {
    monthlyExpense,
    completedMonthCount: monthKeys.length,
    monthKeys,
    isReliable,
  };
}

export function calculateEmergencyCoverageSnapshot(input: {
  emergencyFundBalance: number;
  transactions: Transaction[];
  categories?: Category[];
  asOfMonth?: string;
  lookbackMonths?: number;
  minimumMonths?: number;
}): EmergencyCoverageSnapshot {
  const baseline = calculateStableEmergencyExpenseBaseline(input);
  const emergencyFundBalance = Math.max(
    0,
    Number.isFinite(input.emergencyFundBalance) ? input.emergencyFundBalance : 0,
  );
  const minimumMonths = Math.max(
    1,
    input.minimumMonths ?? DEFAULT_MINIMUM_MONTHS,
  );
  const minimumTargetAmount = baseline.monthlyExpense * minimumMonths;

  return {
    ...baseline,
    emergencyFundBalance,
    coverageMonths: baseline.isReliable
      ? emergencyFundBalance / baseline.monthlyExpense
      : null,
    minimumMonths,
    minimumTargetAmount,
    minimumGap: baseline.isReliable
      ? Math.max(0, minimumTargetAmount - emergencyFundBalance)
      : 0,
  };
}
