import type { AIFinanceToolContext } from "../tools/aiToolTypes";

type LookupQuery = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}> & {
  select: (columns: string) => LookupQuery;
  eq: (column: string, value: unknown) => LookupQuery;
  maybeSingle: () => LookupQuery;
};

type LookupClient = {
  from: (table: string) => LookupQuery;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as LookupClient;
}

export async function buildPendingActionPreview(input: {
  context: AIFinanceToolContext;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  const client = clientOf(input.context);

  switch (input.toolName) {
    case "create_budget": {
      const { data } = await client
        .from("categories")
        .select("id,name")
        .eq("id", String(input.arguments.categoryId))
        .eq("user_id", input.context.userId)
        .maybeSingle();

      const category =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null;

      return {
        title: "Tạo ngân sách",
        fields: {
          categoryId: input.arguments.categoryId,
          categoryName: category?.name ?? "Không xác định",
          month: input.arguments.month,
          limitAmount: input.arguments.limitAmount,
        },
      };
    }

    case "update_budget": {
      const { data } = await client
        .from("budgets")
        .select("*")
        .eq("id", String(input.arguments.budgetId))
        .eq("user_id", input.context.userId)
        .maybeSingle();

      const budget =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null;

      return {
        title: "Cập nhật ngân sách",
        fields: {
          budgetId: input.arguments.budgetId,
          oldLimitAmount: budget?.limitAmount ?? null,
          newLimitAmount: input.arguments.limitAmount,
        },
      };
    }

    case "create_goal":
      return {
        title: "Tạo mục tiêu tài chính",
        fields: {
          name: input.arguments.name,
          targetAmount: input.arguments.targetAmount,
          currentAmount: input.arguments.currentAmount ?? 0,
        },
      };

    default:
      return {
        title: input.toolName,
        fields: input.arguments,
      };
  }
}
