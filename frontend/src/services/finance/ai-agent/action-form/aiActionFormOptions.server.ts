import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { getAIActionFormSchema } from "./aiActionFormRegistry.server";
import type { AIActionFormOption } from "./aiActionFormTypes";

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

type QueryBuilder = PromiseLike<QueryResponse> & {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
};

type QueryClient = {
  from: (table: string) => QueryBuilder;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as QueryClient;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export async function loadAIActionFormOptions(input: {
  context: AIFinanceToolContext;
  toolName: string;
}) {
  const schema = getAIActionFormSchema(input.toolName);
  if (!schema) throw new Error("ACTION_FORM_NOT_SUPPORTED");

  const options: Record<string, AIActionFormOption[]> = {};
  const client = clientOf(input.context);

  for (const field of schema.fields) {
    if (field.entity === "expense_category") {
      const { data, error } = await client
        .from("categories")
        .select("id,name,type")
        .eq("user_id", input.context.userId)
        .eq("type", "expense")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);

      options[field.name] = records(data).map((item) => ({
        value: String(item.id ?? ""),
        label: String(item.name ?? "Không xác định"),
      }));
    }

    if (field.entity === "budget") {
      const { data, error } = await client
        .from("budgets")
        .select("id,categoryId,month,limitAmount")
        .eq("user_id", input.context.userId)
        .order("month", { ascending: false });

      if (error) throw new Error(error.message);

      options[field.name] = records(data).map((item) => ({
        value: String(item.id ?? ""),
        label: `${String(item.month ?? "")} · ${new Intl.NumberFormat("vi-VN").format(Number(item.limitAmount ?? 0))} đ`,
        description: String(item.categoryId ?? ""),
      }));
    }
  }

  return { schema, options };
}
