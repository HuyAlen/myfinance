import type {
  AIFinanceToolContext,
  AIFinanceToolRegistration,
  AIFinanceToolResult,
} from "../aiToolTypes";

type CreateBudgetArgs = {
  categoryId: string;
  month: string;
  limitAmount: number;
};

type UpdateBudgetArgs = {
  budgetId: string;
  limitAmount: number;
};

type CreateGoalArgs = {
  name: string;
  targetAmount: number;
  currentAmount: number;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object.");
  }

  return value as Record<string, unknown>;
}

function requiredString(
  input: Record<string, unknown>,
  key: string,
  maxLength = 200,
) {
  const value = input[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new Error(`${key} is too long.`);
  }

  return normalized;
}

function positiveNumber(
  input: Record<string, unknown>,
  key: string,
  allowZero = false,
) {
  const value = Number(input[key]);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a valid number.`);
  }

  if (allowZero ? value < 0 : value <= 0) {
    throw new Error(
      allowZero
        ? `${key} must be zero or greater.`
        : `${key} must be greater than zero.`,
    );
  }

  return Math.round(value);
}

function parseCreateBudgetArgs(value: unknown): CreateBudgetArgs {
  const input = asObject(value);
  const month = requiredString(input, "month", 7);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month must use YYYY-MM format.");
  }

  return {
    categoryId: requiredString(input, "categoryId", 100),
    month,
    limitAmount: positiveNumber(input, "limitAmount"),
  };
}

function parseUpdateBudgetArgs(value: unknown): UpdateBudgetArgs {
  const input = asObject(value);

  return {
    budgetId: requiredString(input, "budgetId", 100),
    limitAmount: positiveNumber(input, "limitAmount"),
  };
}

function parseCreateGoalArgs(value: unknown): CreateGoalArgs {
  const input = asObject(value);

  return {
    name: requiredString(input, "name", 120),
    targetAmount: positiveNumber(input, "targetAmount"),
    currentAmount:
      input.currentAmount === undefined
        ? 0
        : positiveNumber(input, "currentAmount", true),
  };
}

function notExecutableYet(): Promise<AIFinanceToolResult> {
  return Promise.resolve({
    ok: false,
    error:
      "Write tools must be converted to a pending action before execution.",
  });
}

export const createBudgetTool: AIFinanceToolRegistration<CreateBudgetArgs> = {
  name: "create_budget",
  mode: "write",
  description:
    "Prepare a new monthly budget. Requires explicit user confirmation before execution.",
  semantic: {
    capabilities: ["write_action", "budget_status"],
    returns: [
      "confirmation_required",
      "pendingAction.id",
      "pendingAction.preview",
    ],
    useWhen: [
      "The user explicitly asks to create or add a monthly budget and supplies or resolves category, month, and amount.",
    ],
    doNotUseWhen: [
      "The user only asks to view, analyze, recommend, or explain a budget.",
    ],
    examples: [
      "Tạo ngân sách ăn uống 5 triệu tháng này",
      "Thêm budget đi lại 1 triệu",
    ],
    priority: 85,
  },
  definition: {
    type: "function",
    name: "create_budget",
    description:
      "Prepare a new budget for a category and month. This action requires explicit confirmation.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        categoryId: {
          type: "string",
          description: "Existing expense category ID.",
        },
        month: {
          type: "string",
          description: "Budget month in YYYY-MM format.",
        },
        limitAmount: {
          type: "number",
          description: "Budget limit in VND.",
        },
      },
      required: ["categoryId", "month", "limitAmount"],
      additionalProperties: false,
    },
  },
  validate: parseCreateBudgetArgs,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute: async (_context: AIFinanceToolContext) => notExecutableYet(),
};

export const updateBudgetTool: AIFinanceToolRegistration<UpdateBudgetArgs> = {
  name: "update_budget",
  mode: "write",
  description:
    "Prepare an update to an existing budget limit. Requires confirmation.",
  semantic: {
    capabilities: ["write_action", "budget_status"],
    returns: [
      "confirmation_required",
      "pendingAction.id",
      "pendingAction.preview",
    ],
    useWhen: [
      "The user explicitly asks to change an existing budget limit and the target budget can be resolved safely.",
    ],
    doNotUseWhen: [
      "The user asks for budget status, advice, or a hypothetical recommendation without requesting a change.",
    ],
    examples: [
      "Tăng ngân sách ăn uống lên 6 triệu",
      "Đổi budget đi lại thành 2 triệu",
    ],
    priority: 90,
  },
  definition: {
    type: "function",
    name: "update_budget",
    description:
      "Prepare an update to an existing budget limit. This action requires explicit confirmation.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        budgetId: {
          type: "string",
          description: "Existing budget ID.",
        },
        limitAmount: {
          type: "number",
          description: "New budget limit in VND.",
        },
      },
      required: ["budgetId", "limitAmount"],
      additionalProperties: false,
    },
  },
  validate: parseUpdateBudgetArgs,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute: async (_context: AIFinanceToolContext) => notExecutableYet(),
};

export const createGoalTool: AIFinanceToolRegistration<CreateGoalArgs> = {
  name: "create_goal",
  mode: "write",
  description:
    "Prepare a new financial goal. Requires explicit user confirmation.",
  semantic: {
    capabilities: ["write_action", "goal_progress"],
    returns: [
      "confirmation_required",
      "pendingAction.id",
      "pendingAction.preview",
    ],
    useWhen: [
      "The user explicitly asks to create a financial goal and provides a name and target amount.",
    ],
    doNotUseWhen: [
      "The user asks to inspect, forecast, or discuss an existing goal without requesting creation.",
    ],
    examples: [
      "Tạo mục tiêu mua xe 500 triệu",
      "Thêm goal quỹ khẩn cấp 100 triệu",
    ],
    priority: 85,
  },
  definition: {
    type: "function",
    name: "create_goal",
    description:
      "Prepare a new financial goal. This action requires explicit confirmation.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Goal name.",
        },
        targetAmount: {
          type: "number",
          description: "Target amount in VND.",
        },
        currentAmount: {
          type: "number",
          description: "Optional current saved amount in VND.",
        },
      },
      required: ["name", "targetAmount"],
      additionalProperties: false,
    },
  },
  validate: parseCreateGoalArgs,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute: async (_context: AIFinanceToolContext) => notExecutableYet(),
};

export const financeWriteTools = [
  createBudgetTool,
  updateBudgetTool,
  createGoalTool,
] as const;
