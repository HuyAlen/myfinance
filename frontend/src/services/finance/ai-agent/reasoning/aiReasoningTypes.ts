import type {
  AIFinanceAnalysisOperation,
  AIFinanceCapability,
} from "../context/aiFinanceCapabilities";

export type AIFinanceReasoningEvidence = {
  stepId: string;
  toolName: string;
  label: string;
  value?: string | number | boolean | null;
  unit?: string;
};

export type AIFinanceReasoningFinding = {
  code: string;
  title: string;
  summary: string;
  severity: "info" | "positive" | "warning" | "critical";
  evidence: AIFinanceReasoningEvidence[];
};

export type AIFinanceNormalizedStepResult = {
  stepId: string;
  toolName: string;
  status: "success" | "empty" | "confirmation_required" | "failed" | "skipped";
  data: unknown;
  recordCount?: number;
  error?: string;
};

export type AIFinancePostToolReasoning = {
  status: "success" | "partial" | "empty" | "failed";
  capabilities: AIFinanceCapability[];
  operations: AIFinanceAnalysisOperation[];
  findings: AIFinanceReasoningFinding[];
  normalizedResults: AIFinanceNormalizedStepResult[];
  successfulSteps: number;
  failedSteps: number;
  emptySteps: number;
  confirmationRequired: boolean;
};
