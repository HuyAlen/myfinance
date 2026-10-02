export type DebtPaydownStrategy = "avalanche" | "snowball";

export type DebtPaydownInputDebt = {
  id: string;
  name: string;
  remainingAmount: number;
  interestRate?: number | null;
  minimumPayment?: number | null;
};

export type DebtPaydownPriorityItem = {
  id: string;
  name: string;
  remainingAmount: number;
  interestRate: number | null;
  minimumPayment: number;
};

export type DebtPaydownPlanStatus =
  | "paid"
  | "ready"
  | "unfunded"
  | "capped";

export type DebtPaydownPlan = {
  strategy: DebtPaydownStrategy;
  status: DebtPaydownPlanStatus;
  activeDebtCount: number;
  startingBalance: number;
  baseMinimumPayment: number;
  extraMonthlyPayment: number;
  monthlyPayment: number;
  payoffMonths: number | null;
  totalInterest: number | null;
  totalPaid: number | null;
  firstTargetId: string | null;
  firstTargetName: string | null;
  priority: DebtPaydownPriorityItem[];
  missingInterestRateCount: number;
  missingMinimumPaymentCount: number;
  simulationMonthCap: number;
};

export type DebtPaydownImpact = {
  monthsSaved: number | null;
  interestSaved: number | null;
};

type SimulationDebt = DebtPaydownPriorityItem & {
  balance: number;
};

const DEFAULT_SIMULATION_MONTH_CAP = 600;
const MONEY_EPSILON = 0.5;

function finiteNonNegative(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return numberValue;
}

function normalizedMoney(value: unknown): number {
  return Math.max(0, Math.round(finiteNonNegative(value) ?? 0));
}

function normalizedRate(value: unknown): number | null {
  const parsed = finiteNonNegative(value);
  return parsed === null ? null : parsed;
}

function toPriorityItem(debt: DebtPaydownInputDebt): DebtPaydownPriorityItem {
  return {
    id: debt.id,
    name: debt.name,
    remainingAmount: normalizedMoney(debt.remainingAmount),
    interestRate: normalizedRate(debt.interestRate),
    minimumPayment: normalizedMoney(debt.minimumPayment),
  };
}

export function sortDebtPaydownPriority(
  debts: DebtPaydownInputDebt[],
  strategy: DebtPaydownStrategy,
): DebtPaydownPriorityItem[] {
  const active = debts
    .map(toPriorityItem)
    .filter((debt) => debt.remainingAmount > 0);

  return active.sort((a, b) => {
    if (strategy === "snowball") {
      if (a.remainingAmount !== b.remainingAmount) {
        return a.remainingAmount - b.remainingAmount;
      }
      const rateA = a.interestRate ?? -1;
      const rateB = b.interestRate ?? -1;
      if (rateA !== rateB) return rateB - rateA;
      return a.name.localeCompare(b.name, "vi");
    }

    const rateA = a.interestRate ?? -1;
    const rateB = b.interestRate ?? -1;
    if (rateA !== rateB) return rateB - rateA;
    if (a.remainingAmount !== b.remainingAmount) {
      return b.remainingAmount - a.remainingAmount;
    }
    return a.name.localeCompare(b.name, "vi");
  });
}

function sortSimulationDebts(
  debts: SimulationDebt[],
  strategy: DebtPaydownStrategy,
): SimulationDebt[] {
  return [...debts]
    .filter((debt) => debt.balance > MONEY_EPSILON)
    .sort((a, b) => {
      if (strategy === "snowball") {
        if (a.balance !== b.balance) return a.balance - b.balance;
        const rateA = a.interestRate ?? -1;
        const rateB = b.interestRate ?? -1;
        if (rateA !== rateB) return rateB - rateA;
        return a.name.localeCompare(b.name, "vi");
      }

      const rateA = a.interestRate ?? -1;
      const rateB = b.interestRate ?? -1;
      if (rateA !== rateB) return rateB - rateA;
      if (a.balance !== b.balance) return b.balance - a.balance;
      return a.name.localeCompare(b.name, "vi");
    });
}

export function buildDebtPaydownPlan(input: {
  debts: DebtPaydownInputDebt[];
  strategy: DebtPaydownStrategy;
  extraMonthlyPayment?: number;
  simulationMonthCap?: number;
}): DebtPaydownPlan {
  const priority = sortDebtPaydownPriority(input.debts, input.strategy);
  const extraMonthlyPayment = normalizedMoney(input.extraMonthlyPayment);
  const simulationMonthCap = Math.max(
    1,
    Math.floor(
      finiteNonNegative(input.simulationMonthCap) ??
        DEFAULT_SIMULATION_MONTH_CAP,
    ),
  );
  const baseMinimumPayment = priority.reduce(
    (sum, debt) => sum + debt.minimumPayment,
    0,
  );
  const monthlyPayment = baseMinimumPayment + extraMonthlyPayment;
  const startingBalance = priority.reduce(
    (sum, debt) => sum + debt.remainingAmount,
    0,
  );
  const missingInterestRateCount = priority.filter(
    (debt) => debt.interestRate === null,
  ).length;
  const missingMinimumPaymentCount = priority.filter(
    (debt) => debt.minimumPayment <= 0,
  ).length;
  const firstTarget = priority[0] ?? null;

  const base = {
    strategy: input.strategy,
    activeDebtCount: priority.length,
    startingBalance,
    baseMinimumPayment,
    extraMonthlyPayment,
    monthlyPayment,
    firstTargetId: firstTarget?.id ?? null,
    firstTargetName: firstTarget?.name ?? null,
    priority,
    missingInterestRateCount,
    missingMinimumPaymentCount,
    simulationMonthCap,
  } as const;

  if (priority.length === 0) {
    return {
      ...base,
      status: "paid",
      payoffMonths: 0,
      totalInterest: 0,
      totalPaid: 0,
    };
  }

  if (monthlyPayment <= 0) {
    return {
      ...base,
      status: "unfunded",
      payoffMonths: null,
      totalInterest: null,
      totalPaid: null,
    };
  }

  const working: SimulationDebt[] = priority.map((debt) => ({
    ...debt,
    balance: debt.remainingAmount,
  }));

  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= simulationMonthCap; month += 1) {
    for (const debt of working) {
      if (debt.balance <= MONEY_EPSILON) continue;
      const monthlyRate = (debt.interestRate ?? 0) / 1200;
      const interest = Math.max(0, Math.round(debt.balance * monthlyRate));
      debt.balance += interest;
      totalInterest += interest;
    }

    let budget = monthlyPayment;

    for (const debt of working) {
      if (budget <= 0 || debt.balance <= MONEY_EPSILON) continue;
      const minimumDue = Math.min(debt.minimumPayment, debt.balance, budget);
      if (minimumDue <= 0) continue;
      debt.balance -= minimumDue;
      budget -= minimumDue;
      totalPaid += minimumDue;
    }

    for (const debt of sortSimulationDebts(working, input.strategy)) {
      if (budget <= 0) break;
      if (debt.balance <= MONEY_EPSILON) continue;
      const acceleratedPayment = Math.min(debt.balance, budget);
      debt.balance -= acceleratedPayment;
      budget -= acceleratedPayment;
      totalPaid += acceleratedPayment;
    }

    const remaining = working.reduce(
      (sum, debt) => sum + Math.max(0, debt.balance),
      0,
    );
    if (remaining <= MONEY_EPSILON) {
      return {
        ...base,
        status: "ready",
        payoffMonths: month,
        totalInterest: Math.round(totalInterest),
        totalPaid: Math.round(totalPaid),
      };
    }
  }

  return {
    ...base,
    status: "capped",
    payoffMonths: null,
    totalInterest: null,
    totalPaid: null,
  };
}

export function getDebtPaydownImpact(
  baseline: DebtPaydownPlan,
  scenario: DebtPaydownPlan,
): DebtPaydownImpact {
  const monthsSaved =
    baseline.payoffMonths !== null && scenario.payoffMonths !== null
      ? Math.max(0, baseline.payoffMonths - scenario.payoffMonths)
      : null;
  const interestSaved =
    baseline.totalInterest !== null && scenario.totalInterest !== null
      ? Math.max(0, baseline.totalInterest - scenario.totalInterest)
      : null;

  return { monthsSaved, interestSaved };
}

export function formatDebtPayoffDuration(months: number | null): string {
  if (months === null) return "Chưa ước tính được";
  if (months <= 0) return "Đã tất toán";
  if (months < 12) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder === 0
    ? `${years} năm`
    : `${years} năm ${remainder} tháng`;
}
