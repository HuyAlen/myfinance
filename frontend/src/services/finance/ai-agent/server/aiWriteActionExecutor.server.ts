import { randomUUID } from "node:crypto";

import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { recordAIActionAudit } from "./aiActionAuditRepository.server";
import {
  getPendingAction,
  updatePendingAction,
} from "./aiPendingActionRepository.server";

type FinanceMutationQuery = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}> & {
  insert: (value: Record<string, unknown>) => FinanceMutationQuery;
  update: (value: Record<string, unknown>) => FinanceMutationQuery;
  eq: (column: string, value: unknown) => FinanceMutationQuery;
  select: (columns: string) => FinanceMutationQuery;
  single: () => FinanceMutationQuery;
};

type FinanceMutationClient = {
  from: (table: string) => FinanceMutationQuery;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as FinanceMutationClient;
}

async function executeCreateBudget(
  context: AIFinanceToolContext,
  args: Record<string, unknown>,
) {
  const client = clientOf(context);

  const { data, error } = await client
    .from("budgets")
    .insert({
      id: randomUUID(),
      user_id: context.userId,
      categoryId: String(args.categoryId),
      month: String(args.month),
      limitAmount: Number(args.limitAmount),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function executeUpdateBudget(
  context: AIFinanceToolContext,
  args: Record<string, unknown>,
) {
  const client = clientOf(context);

  const { data, error } = await client
    .from("budgets")
    .update({
      limitAmount: Number(args.limitAmount),
    })
    .eq("id", String(args.budgetId))
    .eq("user_id", context.userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function executeCreateGoal(
  context: AIFinanceToolContext,
  args: Record<string, unknown>,
) {
  const client = clientOf(context);

  const { data, error } = await client
    .from("goals")
    .insert({
      id: randomUUID(),
      user_id: context.userId,
      name: String(args.name),
      targetAmount: Number(args.targetAmount),
      currentAmount: Number(args.currentAmount ?? 0),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function asResultRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { value };
}

export async function confirmAndExecutePendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
}) {
  const action = await getPendingAction(input);

  if (!action) {
    throw new Error("PENDING_ACTION_NOT_FOUND");
  }

  if (action.status === "completed") {
    return action;
  }

  if (action.status === "executing" || action.status === "confirmed") {
    throw new Error("PENDING_ACTION_IN_PROGRESS");
  }

  if (action.status !== "pending") {
    throw new Error(`PENDING_ACTION_${action.status.toUpperCase()}`);
  }

  if (new Date(action.expires_at).getTime() <= Date.now()) {
    const expired = await updatePendingAction({
      context: input.context,
      actionId: input.actionId,
      values: {
        status: "expired",
      },
    });

    await recordAIActionAudit({
      context: input.context,
      pendingActionId: action.id,
      conversationId: action.conversation_id,
      toolName: action.tool_name,
      status: "expired",
      oldValue: action.old_value,
      newValue: action.new_value,
    });

    throw new Error(`PENDING_ACTION_${expired.status.toUpperCase()}`);
  }

  await updatePendingAction({
    context: input.context,
    actionId: input.actionId,
    values: {
      status: "executing",
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.context.userId,
    },
  });

  try {
    let result: unknown;

    switch (action.tool_name) {
      case "create_budget":
        result = await executeCreateBudget(input.context, action.arguments);
        break;

      case "update_budget":
        result = await executeUpdateBudget(input.context, action.arguments);
        break;

      case "create_goal":
        result = await executeCreateGoal(input.context, action.arguments);
        break;

      default:
        throw new Error(`Unsupported write tool: ${action.tool_name}`);
    }

    const resultRecord = asResultRecord(result);

    const completed = await updatePendingAction({
      context: input.context,
      actionId: input.actionId,
      values: {
        status: "completed",
        result: resultRecord,
        executed_at: new Date().toISOString(),
      },
    });

    await recordAIActionAudit({
      context: input.context,
      pendingActionId: action.id,
      conversationId: action.conversation_id,
      toolName: action.tool_name,
      status: "completed",
      oldValue: action.old_value,
      newValue: action.new_value,
      result: resultRecord,
    });

    return completed;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Write action failed.";

    await updatePendingAction({
      context: input.context,
      actionId: input.actionId,
      values: {
        status: "failed",
        error_message: message,
      },
    });

    await recordAIActionAudit({
      context: input.context,
      pendingActionId: action.id,
      conversationId: action.conversation_id,
      toolName: action.tool_name,
      status: "failed",
      oldValue: action.old_value,
      newValue: action.new_value,
      errorMessage: message,
    });

    throw error;
  }
}

export async function cancelPendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
}) {
  const action = await getPendingAction(input);

  if (!action) {
    throw new Error("PENDING_ACTION_NOT_FOUND");
  }

  if (action.status === "cancelled") {
    return action;
  }

  if (action.status !== "pending") {
    throw new Error(`PENDING_ACTION_${action.status.toUpperCase()}`);
  }

  const cancelled = await updatePendingAction({
    context: input.context,
    actionId: input.actionId,
    values: {
      status: "cancelled",
    },
  });

  await recordAIActionAudit({
    context: input.context,
    pendingActionId: action.id,
    conversationId: action.conversation_id,
    toolName: action.tool_name,
    status: "cancelled",
    oldValue: action.old_value,
    newValue: action.new_value,
  });

  return cancelled;
}
