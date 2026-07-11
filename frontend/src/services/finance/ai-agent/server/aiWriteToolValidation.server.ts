import type { AIFinanceToolContext } from "../tools/aiToolTypes";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  maybeSingle: () => QueryBuilder;
};

type QueryClient = {
  from: (table: string) => QueryBuilder;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as QueryClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export type WriteValidationResult = {
  normalizedArguments: Record<string, unknown>;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
};

export async function validateWriteToolRequest(input: {
  context: AIFinanceToolContext;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<WriteValidationResult> {
  const client = clientOf(input.context);

  switch (input.toolName) {
    case "create_budget": {
      const categoryId = String(input.arguments.categoryId ?? "");
      const month = String(input.arguments.month ?? "");
      const limitAmount = Number(input.arguments.limitAmount ?? 0);

      const { data: categoryData, error: categoryError } = await client
        .from("categories")
        .select("id,name,type")
        .eq("id", categoryId)
        .eq("user_id", input.context.userId)
        .maybeSingle();

      if (categoryError) {
        throw new Error(categoryError.message);
      }

      const category = asRecord(categoryData);

      if (!category) {
        throw new Error("CATEGORY_NOT_FOUND");
      }

      if (category.type !== "expense") {
        throw new Error("CATEGORY_MUST_BE_EXPENSE");
      }

      const { data: existingData, error: existingError } = await client
        .from("budgets")
        .select("id,categoryId,month,limitAmount")
        .eq("categoryId", categoryId)
        .eq("month", month)
        .eq("user_id", input.context.userId)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (existingData) {
        throw new Error("BUDGET_ALREADY_EXISTS");
      }

      return {
        normalizedArguments: {
          categoryId,
          month,
          limitAmount,
        },
        oldValue: null,
        newValue: {
          categoryId,
          categoryName: category.name ?? "Không xác định",
          month,
          limitAmount,
        },
      };
    }

    case "update_budget": {
      const budgetId = String(input.arguments.budgetId ?? "");
      const limitAmount = Number(input.arguments.limitAmount ?? 0);

      const { data, error } = await client
        .from("budgets")
        .select("id,categoryId,month,limitAmount")
        .eq("id", budgetId)
        .eq("user_id", input.context.userId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const budget = asRecord(data);

      if (!budget) {
        throw new Error("BUDGET_NOT_FOUND");
      }

      return {
        normalizedArguments: {
          budgetId,
          limitAmount,
        },
        oldValue: {
          budgetId,
          limitAmount: budget.limitAmount ?? null,
          month: budget.month ?? null,
          categoryId: budget.categoryId ?? null,
        },
        newValue: {
          budgetId,
          limitAmount,
          month: budget.month ?? null,
          categoryId: budget.categoryId ?? null,
        },
      };
    }

    case "create_goal": {
      const name = String(input.arguments.name ?? "").trim();
      const targetAmount = Number(input.arguments.targetAmount ?? 0);
      const currentAmount = Number(input.arguments.currentAmount ?? 0);

      const { data, error } = await client
        .from("goals")
        .select("id,name,targetAmount,currentAmount")
        .eq("name", name)
        .eq("user_id", input.context.userId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        throw new Error("GOAL_ALREADY_EXISTS");
      }

      if (currentAmount > targetAmount) {
        throw new Error("CURRENT_AMOUNT_EXCEEDS_TARGET");
      }

      return {
        normalizedArguments: {
          name,
          targetAmount,
          currentAmount,
        },
        oldValue: null,
        newValue: {
          name,
          targetAmount,
          currentAmount,
        },
      };
    }

    default:
      throw new Error(`Unsupported write tool: ${input.toolName}`);
  }
}
