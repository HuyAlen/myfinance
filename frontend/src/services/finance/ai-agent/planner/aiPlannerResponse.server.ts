import type { AIFinancePlannerResult } from "./aiPlanTypes";

export function toAIFinancePlannerResponse(result: AIFinancePlannerResult) {
  return {
    answer: result.answer,
    agentMode: "dynamic_planner" as const,
    plan: {
      objective: result.plan.objective,
      steps: result.plan.steps.map((step) => ({
        id: step.id,
        toolName: step.toolName,
        mode: step.mode,
        reason: step.reason,
        dependsOn: step.dependsOn,
      })),
    },
    planResults: result.steps.map((step) => ({
      stepId: step.stepId,
      toolName: step.toolName,
      mode: step.mode,
      status: step.status,
      reason: step.reason,
      error: step.error,
    })),
    pendingActions: result.pendingActions,
    usage: {
      planner: result.plannerUsage,
      synthesis: result.synthesisUsage,
    },
  };
}
