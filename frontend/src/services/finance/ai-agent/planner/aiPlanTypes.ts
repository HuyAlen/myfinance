export type AIFinancePlanStepMode = "read" | "write";

export type AIFinancePlanStep = {
  id: string;
  toolName: string;
  reason: string;
  mode: AIFinancePlanStepMode;
  arguments: Record<string, unknown>;
  dependsOn: string[];
};

export type AIFinanceExecutionPlan = {
  objective: string;
  steps: AIFinancePlanStep[];
};

export type AIFinancePlanStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "confirmation_required"
  | "skipped"
  | "failed";

export type AIFinancePlanStepResult = {
  stepId: string;
  toolName: string;
  mode: AIFinancePlanStepMode;
  status: AIFinancePlanStepStatus;
  reason: string;
  arguments: Record<string, unknown>;
  output?: unknown;
  error?: string;
  durationMs?: number;
};

export type AIFinancePlannerUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AIPlannerDebugStatus =
  | "success"
  | "retry_success"
  | "recovered"
  | "fallback"
  | "failed";

export type AIPlannerDebugToolStatus =
  | "planned"
  | "running"
  | "success"
  | "confirmation_required"
  | "failed"
  | "skipped";

export type AIPlannerDebugTool = {
  stepId: string;
  toolName: string;
  mode: AIFinancePlanStepMode;
  reason?: string;
  status: AIPlannerDebugToolStatus;
  argumentKeys: string[];
  durationMs?: number;
  error?: string;
};

export type AIPlannerDebugTiming = {
  totalMs: number;
  planningMs?: number;
  validationMs?: number;
  executionMs?: number;
  synthesisMs?: number;
};

export type AIPlannerDebugMetadata = {
  enabled: true;
  plannerStatus: AIPlannerDebugStatus;
  intent?: string;
  model?: string;
  plannerAttempt: number;
  selectedTools: AIPlannerDebugTool[];
  timing: AIPlannerDebugTiming;
  validationErrors: string[];
  retryErrors: string[];
  fallbackReason?: string;
};

import type { AIFinancePostToolReasoning } from "../reasoning/aiReasoningTypes";

export type AIFinancePlannerResult = {
  answer: string;
  plan: AIFinanceExecutionPlan;
  steps: AIFinancePlanStepResult[];
  pendingActions: Array<{
    id: string;
    toolName: string;
    preview: Record<string, unknown>;
    status: string;
    expiresAt: string;
  }>;
  plannerUsage?: AIFinancePlannerUsage;
  synthesisUsage?: AIFinancePlannerUsage;
  reasoning?: AIFinancePostToolReasoning;
  debug?: AIPlannerDebugMetadata;
};
