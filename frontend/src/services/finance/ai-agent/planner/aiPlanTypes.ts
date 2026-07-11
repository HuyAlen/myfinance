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
};

export type AIFinancePlannerUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

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
};
