function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object.");
  }

  return value as Record<string, unknown>;
}

export function parseEmptyArgs(value: unknown): Record<string, never> {
  const input = asObject(value);

  if (Object.keys(input).length > 0) {
    throw new Error("This tool does not accept arguments.");
  }

  return {};
}

export function parseOptionalMonthArgs(value: unknown): {
  month?: string;
} {
  const input = asObject(value);
  const month = input.month;

  if (month === undefined || month === null || month === "") {
    return {};
  }

  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month must use YYYY-MM format.");
  }

  return { month };
}

export function parseOptionalLimitArgs(value: unknown): {
  limit: number;
} {
  const input = asObject(value);
  const raw = input.limit;

  if (raw === undefined || raw === null) {
    return { limit: 10 };
  }

  const limit = Number(raw);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("limit must be an integer between 1 and 50.");
  }

  return { limit };
}

export type SearchTransactionsDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

export type SearchTransactionsArgs = {
  datePreset?: SearchTransactionsDatePreset;
  from?: string;
  to?: string;
  type?: "income" | "expense";
  categoryId?: string;
  walletId?: string;
  query?: string;
  queryTerms?: string[];
  minAmount?: number;
  maxAmount?: number;
  limit: number;
};

function optionalString(
  input: Record<string, unknown>,
  key: string,
  options?: {
    maxLength?: number;
  },
) {
  const value = input[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  if (options?.maxLength && normalized.length > options.maxLength) {
    throw new Error(`${key} must not exceed ${options.maxLength} characters.`);
  }

  return normalized;
}

function optionalStringArray(
  input: Record<string, unknown>,
  key: string,
  options?: {
    maxItems?: number;
    maxItemLength?: number;
  },
) {
  const value = input[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings.`);
  }

  const maxItems = options?.maxItems ?? 20;
  const maxItemLength = options?.maxItemLength ?? 100;

  if (value.length < 1 || value.length > maxItems) {
    throw new Error(`${key} must contain between 1 and ${maxItems} items.`);
  }

  const normalized = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`${key} must contain only strings.`);
    }

    const term = item.trim();

    if (!term || term.length > maxItemLength) {
      throw new Error(
        `${key} items must be non-empty and at most ${maxItemLength} characters.`,
      );
    }

    return term;
  });

  return [...new Set(normalized)];
}

function optionalAmount(input: Record<string, unknown>, key: string) {
  const value = input[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }

  return amount;
}

function optionalDate(input: Record<string, unknown>, key: string) {
  const value = optionalString(input, key);

  if (!value) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw new Error(`${key} must use ISO date format YYYY-MM-DD.`);
  }

  return value;
}

export function parseSearchTransactionsArgs(
  value: unknown,
): SearchTransactionsArgs {
  const input = asObject(value);
  const allowedKeys = new Set([
    "datePreset",
    "from",
    "to",
    "type",
    "categoryId",
    "walletId",
    "query",
    "queryTerms",
    "minAmount",
    "maxAmount",
    "limit",
  ]);

  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported search_transactions argument: ${key}.`);
    }
  }

  const rawDatePreset = optionalString(input, "datePreset");
  const datePresets = new Set<SearchTransactionsDatePreset>([
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
  ]);

  if (
    rawDatePreset &&
    !datePresets.has(rawDatePreset as SearchTransactionsDatePreset)
  ) {
    throw new Error("datePreset is not supported.");
  }

  const datePreset = rawDatePreset as SearchTransactionsDatePreset | undefined;
  const from = optionalDate(input, "from");
  const to = optionalDate(input, "to");

  if (datePreset && (from || to)) {
    throw new Error(
      "Use either datePreset or explicit from/to dates, not both.",
    );
  }
  const rawType = optionalString(input, "type");
  const categoryId = optionalString(input, "categoryId", { maxLength: 200 });
  const walletId = optionalString(input, "walletId", { maxLength: 200 });
  const query = optionalString(input, "query", { maxLength: 200 });
  const queryTerms = optionalStringArray(input, "queryTerms", {
    maxItems: 20,
    maxItemLength: 100,
  });
  const minAmount = optionalAmount(input, "minAmount");
  const maxAmount = optionalAmount(input, "maxAmount");

  if (rawType && rawType !== "income" && rawType !== "expense") {
    throw new Error('type must be either "income" or "expense".');
  }

  if (from && to && from > to) {
    throw new Error("from must be earlier than or equal to to.");
  }

  if (
    minAmount !== undefined &&
    maxAmount !== undefined &&
    minAmount > maxAmount
  ) {
    throw new Error("minAmount must be less than or equal to maxAmount.");
  }

  const rawLimit = input.limit;
  const limit =
    rawLimit === undefined || rawLimit === null ? 50 : Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit must be an integer between 1 and 200.");
  }

  return {
    datePreset,
    from,
    to,
    type: rawType as "income" | "expense" | undefined,
    categoryId,
    walletId,
    query,
    queryTerms,
    minAmount,
    maxAmount,
    limit,
  };
}
