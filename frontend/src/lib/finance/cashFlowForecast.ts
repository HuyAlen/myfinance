export const DEFAULT_CASH_FLOW_FORECAST_CHECKPOINTS = [7, 30, 90] as const;

export type CashFlowForecastEvent = {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: string | Date;
  title?: string;
};

export type CashFlowForecastDay = {
  date: string;
  scheduledIncome: number;
  scheduledExpense: number;
  netScheduled: number;
  projectedBalance: number;
  eventCount: number;
};

export type CashFlowForecastCheckpoint = {
  days: number;
  date: string;
  projectedBalance: number;
  scheduledIncome: number;
  scheduledExpense: number;
  netScheduled: number;
};

export type CashFlowForecast = {
  startDate: string;
  horizonDays: number;
  startingBalance: number;
  eventCount: number;
  scheduledIncome: number;
  scheduledExpense: number;
  netScheduled: number;
  checkpoints: CashFlowForecastCheckpoint[];
  dailyPath: CashFlowForecastDay[];
  lowPointBalance: number;
  lowPointDate: string;
  firstNegativeDate: string | null;
  daysUntilNegative: number | null;
};

function startOfLocalDay(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const local = new Date(year, month - 1, day);
    local.setHours(0, 0, 0, 0);
    if (
      local.getFullYear() !== year ||
      local.getMonth() !== month - 1 ||
      local.getDate() !== day
    ) {
      return null;
    }
    return local;
  }

  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarOrdinal(date: Date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

function normalizedPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/**
 * CASHFLOW-FORECAST-1
 *
 * Pure, evidence-backed scheduled cash forecast. This helper never fetches,
 * mutates, or invents finance state. Callers pass the current spendable Wallet
 * balance plus dated cash events they can actually prove from canonical domain
 * data (today: valid recurring occurrences).
 *
 * Events on the same calendar day are aggregated before the running balance is
 * evaluated. Their intra-day ordering is unknown, so processing one expense
 * before an income on the same day would fabricate a temporary negative balance.
 */
export function buildCashFlowForecast(input: {
  startingBalance: number;
  events: readonly CashFlowForecastEvent[];
  today: string | Date;
  horizonDays?: number;
  checkpointDays?: readonly number[];
}): CashFlowForecast {
  const today = startOfLocalDay(input.today);
  const horizonDays = normalizedPositiveInteger(input.horizonDays, 90);
  const rawStartingBalance = Number(input.startingBalance);
  const startingBalance = Number.isFinite(rawStartingBalance)
    ? rawStartingBalance
    : 0;

  if (!today) {
    return {
      startDate: "",
      horizonDays,
      startingBalance,
      eventCount: 0,
      scheduledIncome: 0,
      scheduledExpense: 0,
      netScheduled: 0,
      checkpoints: [],
      dailyPath: [],
      lowPointBalance: startingBalance,
      lowPointDate: "",
      firstNegativeDate: null,
      daysUntilNegative: null,
    };
  }

  const startOrdinal = calendarOrdinal(today);
  const endOrdinal = startOrdinal + horizonDays;
  const startDate = localDayKey(today);

  const checkpointDays = [
    ...new Set(
      (input.checkpointDays ?? DEFAULT_CASH_FLOW_FORECAST_CHECKPOINTS)
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value >= 0 &&
            Math.floor(value) === value &&
            value <= horizonDays,
        ),
    ),
  ].sort((a, b) => a - b);

  type DailyBucket = {
    date: string;
    ordinal: number;
    scheduledIncome: number;
    scheduledExpense: number;
    eventCount: number;
  };

  const dailyBuckets = new Map<string, DailyBucket>();
  let eventCount = 0;

  for (const event of input.events) {
    const date = startOfLocalDay(event.date);
    const amount = Math.abs(Number(event.amount));
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;

    const ordinal = calendarOrdinal(date);
    if (ordinal < startOrdinal || ordinal > endOrdinal) continue;

    const dateKey = localDayKey(date);
    const bucket = dailyBuckets.get(dateKey) ?? {
      date: dateKey,
      ordinal,
      scheduledIncome: 0,
      scheduledExpense: 0,
      eventCount: 0,
    };

    if (event.type === "income") bucket.scheduledIncome += amount;
    else bucket.scheduledExpense += amount;
    bucket.eventCount += 1;
    eventCount += 1;
    dailyBuckets.set(dateKey, bucket);
  }

  const orderedBuckets = [...dailyBuckets.values()].sort(
    (a, b) => a.ordinal - b.ordinal,
  );

  let runningBalance = startingBalance;
  let scheduledIncome = 0;
  let scheduledExpense = 0;
  let lowPointBalance = startingBalance;
  let lowPointDate = startDate;
  let firstNegativeDate: string | null = startingBalance < 0 ? startDate : null;
  let daysUntilNegative: number | null = startingBalance < 0 ? 0 : null;
  const dailyPath: CashFlowForecastDay[] = [];

  for (const bucket of orderedBuckets) {
    scheduledIncome += bucket.scheduledIncome;
    scheduledExpense += bucket.scheduledExpense;
    const netScheduled = bucket.scheduledIncome - bucket.scheduledExpense;
    runningBalance += netScheduled;

    if (runningBalance < lowPointBalance) {
      lowPointBalance = runningBalance;
      lowPointDate = bucket.date;
    }
    if (firstNegativeDate === null && runningBalance < 0) {
      firstNegativeDate = bucket.date;
      daysUntilNegative = bucket.ordinal - startOrdinal;
    }

    dailyPath.push({
      date: bucket.date,
      scheduledIncome: bucket.scheduledIncome,
      scheduledExpense: bucket.scheduledExpense,
      netScheduled,
      projectedBalance: runningBalance,
      eventCount: bucket.eventCount,
    });
  }

  const checkpoints = checkpointDays.map((days) => {
    const checkpoint = new Date(today);
    checkpoint.setDate(checkpoint.getDate() + days);
    const checkpointOrdinal = startOrdinal + days;

    let checkpointIncome = 0;
    let checkpointExpense = 0;
    let projectedBalance = startingBalance;

    for (const bucket of orderedBuckets) {
      if (bucket.ordinal > checkpointOrdinal) break;
      checkpointIncome += bucket.scheduledIncome;
      checkpointExpense += bucket.scheduledExpense;
      projectedBalance += bucket.scheduledIncome - bucket.scheduledExpense;
    }

    return {
      days,
      date: localDayKey(checkpoint),
      projectedBalance,
      scheduledIncome: checkpointIncome,
      scheduledExpense: checkpointExpense,
      netScheduled: checkpointIncome - checkpointExpense,
    };
  });

  return {
    startDate,
    horizonDays,
    startingBalance,
    eventCount,
    scheduledIncome,
    scheduledExpense,
    netScheduled: scheduledIncome - scheduledExpense,
    checkpoints,
    dailyPath,
    lowPointBalance,
    lowPointDate,
    firstNegativeDate,
    daysUntilNegative,
  };
}