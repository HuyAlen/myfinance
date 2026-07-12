import { randomUUID } from "node:crypto";

import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { recordAIActionAudit } from "./aiActionAuditRepository.server";
import {
  getPendingAction,
  updatePendingAction,
  type PendingActionRecord,
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

type AuditStatus = "completed" | "failed" | "expired" | "cancelled";

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as FinanceMutationClient;
}

function errorMessageOf(error: unknown, fallback = "Write action failed.") {
  return error instanceof Error ? error.message : fallback;
}

function hasExecutionEvidence(action: PendingActionRecord) {
  return Boolean(action.executed_at || action.result);
}

async function recordAuditBestEffort(input: {
  context: AIFinanceToolContext;
  action: PendingActionRecord;
  status: AuditStatus;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  try {
    await recordAIActionAudit({
      context: input.context,
      pendingActionId: input.action.id,
      conversationId: input.action.conversation_id,
      toolName: input.action.tool_name,
      status: input.status,
      oldValue: input.action.old_value,
      newValue: input.action.new_value,
      result: input.result ?? null,
      errorMessage: input.errorMessage ?? null,
    });
  } catch (auditError) {
    console.error("[AI_ACTION_AUDIT_FAILED]", {
      pendingActionId: input.action.id,
      toolName: input.action.tool_name,
      status: input.status,
      error: errorMessageOf(auditError, "Unknown audit error."),
    });
  }
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

async function reconcilePreviouslyExecutedAction(input: {
  context: AIFinanceToolContext;
  action: PendingActionRecord;
}) {
  if (!hasExecutionEvidence(input.action)) return null;

  if (input.action.status === "completed") {
    return input.action;
  }

  const completed = await updatePendingAction({
    context: input.context,
    actionId: input.action.id,
    values: {
      status: "completed",
      error_message: null,
      executed_at: input.action.executed_at ?? new Date().toISOString(),
    },
  });

  await recordAuditBestEffort({
    context: input.context,
    action: completed,
    status: "completed",
    result: completed.result,
  });

  return completed;
}

export async function confirmAndExecutePendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
}) {
  const action = await getPendingAction(input);

  if (!action) {
    throw new Error("PENDING_ACTION_NOT_FOUND");
  }

  const reconciled = await reconcilePreviouslyExecutedAction({
    context: input.context,
    action,
  });

  if (reconciled) {
    return reconciled;
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

    await recordAuditBestEffort({
      context: input.context,
      action: expired,
      status: "expired",
    });

    throw new Error(`PENDING_ACTION_${expired.status.toUpperCase()}`);
  }

  const executing = await updatePendingAction({
    context: input.context,
    actionId: input.actionId,
    values: {
      status: "executing",
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.context.userId,
      error_message: null,
    },
  });

  let result: unknown;

  try {
    switch (executing.tool_name) {
      case "create_budget":
        result = await executeCreateBudget(input.context, executing.arguments);
        break;

      case "update_budget":
        result = await executeUpdateBudget(input.context, executing.arguments);
        break;

      case "create_goal":
        result = await executeCreateGoal(input.context, executing.arguments);
        break;

      default:
        throw new Error(`Unsupported write tool: ${executing.tool_name}`);
    }
  } catch (error) {
    const message = errorMessageOf(error);

    const failed = await updatePendingAction({
      context: input.context,
      actionId: input.actionId,
      values: {
        status: "failed",
        error_message: message,
      },
    });

    await recordAuditBestEffort({
      context: input.context,
      action: failed,
      status: "failed",
      errorMessage: message,
    });

    throw error;
  }

  const resultRecord = asResultRecord(result);

  const completed = await updatePendingAction({
    context: input.context,
    actionId: input.actionId,
    values: {
      status: "completed",
      result: resultRecord,
      error_message: null,
      executed_at: new Date().toISOString(),
    },
  });

  await recordAuditBestEffort({
    context: input.context,
    action: completed,
    status: "completed",
    result: resultRecord,
  });

  return completed;
}

export async function cancelPendingAction(input: {
  context: AIFinanceToolContext;
  actionId: string;
}) {
  const action = await getPendingAction(input);

  if (!action) {
    throw new Error("PENDING_ACTION_NOT_FOUND");
  }

  const reconciled = await reconcilePreviouslyExecutedAction({
    context: input.context,
    action,
  });

  if (reconciled) {
    return reconciled;
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

  await recordAuditBestEffort({
    context: input.context,
    action: cancelled,
    status: "cancelled",
  });

  return cancelled;
}
