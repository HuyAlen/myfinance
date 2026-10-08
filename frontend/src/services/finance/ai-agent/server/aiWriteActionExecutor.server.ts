import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { recordAIActionAudit } from "./aiActionAuditRepository.server";
import {
  getPendingAction,
  updatePendingAction,
  updatePendingActionIfStatus,
  type PendingActionRecord,
} from "./aiPendingActionRepository.server";

type AuditStatus = "completed" | "failed" | "expired" | "cancelled";

type AtomicExecutionOutcome =
  | "completed"
  | "cancelled"
  | "expired"
  | "failed"
  | "forbidden"
  | "in_progress"
  | "not_found";

type AtomicExecutionReceipt = {
  outcome: AtomicExecutionOutcome;
  action: PendingActionRecord | null;
  error_code?: string;
};

type AtomicExecutionQuery = PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

type AtomicExecutionClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => AtomicExecutionQuery;
};

function atomicClientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as AtomicExecutionClient;
}

function errorMessageOf(error: unknown, fallback = "Write action failed.") {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAtomicExecutionReceipt(
  value: unknown,
): AtomicExecutionReceipt | null {
  if (!isRecord(value) || typeof value.outcome !== "string") return null;

  const allowedOutcomes: AtomicExecutionOutcome[] = [
    "completed",
    "cancelled",
    "expired",
    "failed",
    "forbidden",
    "in_progress",
    "not_found",
  ];

  if (!allowedOutcomes.includes(value.outcome as AtomicExecutionOutcome)) {
    return null;
  }

  return {
    outcome: value.outcome as AtomicExecutionOutcome,
    action: isRecord(value.action)
      ? (value.action as unknown as PendingActionRecord)
      : null,
    error_code:
      typeof value.error_code === "string" ? value.error_code : undefined,
  };
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
  // AI-PENDING-ACTION-ATOMIC-EXECUTION-1:
  // PostgreSQL owns the row lock, finance mutation, completion receipt and AI
  // audit in one transaction. There are no finance table writes in this process.
  const { data, error } = await atomicClientOf(input.context).rpc(
    "execute_ai_pending_action_atomic",
    {
      p_action_id: input.actionId,
    },
  );

  if (error) {
    if (error.code === "MPA01") {
      throw new Error("UNAUTHORIZED");
    }
    throw new Error(error.message);
  }

  const receipt = parseAtomicExecutionReceipt(data);

  if (!receipt) {
    throw new Error("PENDING_ACTION_INVALID_RECEIPT");
  }

  switch (receipt.outcome) {
    case "completed":
      if (!receipt.action) {
        throw new Error("PENDING_ACTION_INVALID_RECEIPT");
      }
      return receipt.action;

    case "not_found":
      throw new Error("PENDING_ACTION_NOT_FOUND");

    case "expired":
      throw new Error("PENDING_ACTION_EXPIRED");

    case "cancelled":
      throw new Error("PENDING_ACTION_CANCELLED");

    case "failed":
      throw new Error("PENDING_ACTION_FAILED");

    case "forbidden":
      throw new Error("PENDING_ACTION_FORBIDDEN");

    case "in_progress":
      throw new Error("PENDING_ACTION_IN_PROGRESS");
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

  const cancelled = await updatePendingActionIfStatus({
    context: input.context,
    actionId: input.actionId,
    expectedStatus: "pending",
    values: {
      status: "cancelled",
    },
  });

  if (!cancelled) {
    const current = await getPendingAction(input);
    if (current?.status === "cancelled") return current;
    throw new Error("PENDING_ACTION_IN_PROGRESS");
  }

  await recordAuditBestEffort({
    context: input.context,
    action: cancelled,
    status: "cancelled",
  });

  return cancelled;
}