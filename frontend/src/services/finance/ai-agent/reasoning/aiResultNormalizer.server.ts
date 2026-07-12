import type { AIFinancePlanStepResult } from "../planner/aiPlanTypes";
import type { AIFinanceNormalizedStepResult } from "./aiReasoningTypes";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function countRecords(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  const record = asRecord(data);
  if (!record) return undefined;

  for (const key of [
    "wallets",
    "transactions",
    "budgets",
    "goals",
    "debts",
    "investments",
  ]) {
    if (Array.isArray(record[key])) return record[key].length;
  }

  if (typeof record.count === "number") return record.count;
  return undefined;
}

function isEmptyData(data: unknown) {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  const record = asRecord(data);
  if (!record) return false;
  const count = countRecords(record);
  if (typeof count === "number") return count === 0;
  return Object.keys(record).length === 0;
}

export function normalizeAIFinanceStepResults(
  steps: AIFinancePlanStepResult[],
): AIFinanceNormalizedStepResult[] {
  return steps.map((step) => {
    const envelope = asRecord(step.output);
    const data = envelope && "data" in envelope ? envelope.data : step.output;

    if (step.status === "confirmation_required") {
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: "confirmation_required",
        data,
        recordCount: countRecords(data),
      };
    }

    if (step.status === "failed") {
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: "failed",
        data: null,
        error: step.error ?? "Tool execution failed.",
      };
    }

    if (step.status === "skipped") {
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: "skipped",
        data: null,
        error: step.error,
      };
    }

    return {
      stepId: step.stepId,
      toolName: step.toolName,
      status: isEmptyData(data) ? "empty" : "success",
      data,
      recordCount: countRecords(data),
    };
  });
}
