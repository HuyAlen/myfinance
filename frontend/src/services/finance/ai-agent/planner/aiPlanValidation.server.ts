import { getAIFinanceTool } from "../tools/aiToolRegistry.server";
import type {
  AIFinanceExecutionPlan,
  AIFinancePlanStep,
  AIFinancePlanStepMode,
} from "./aiPlanTypes";

const MAX_PLAN_STEPS = 8;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Planner output must be an object.");
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asMode(value: unknown): AIFinancePlanStepMode {
  if (value === "read" || value === "write") {
    return value;
  }

  throw new Error("Plan step mode must be read or write.");
}

function normalizeStep(value: unknown, index: number): AIFinancePlanStep {
  const input = asObject(value);
  const id = asString(input.id, `steps[${index}].id`);
  const toolName = asString(input.toolName, `steps[${index}].toolName`);
  const reason = asString(input.reason, `steps[${index}].reason`);
  const mode = asMode(input.mode);
  const argumentsValue = asObject(input.arguments ?? {});
  const dependsOn = asStringArray(input.dependsOn);

  const registration = getAIFinanceTool(toolName);

  if (!registration) {
    throw new Error(`Unknown tool in plan: ${toolName}`);
  }

  if (registration.mode !== mode) {
    throw new Error(
      `Tool mode mismatch for ${toolName}: expected ${registration.mode}.`,
    );
  }

  return {
    id,
    toolName,
    reason,
    mode,
    arguments: argumentsValue,
    dependsOn,
  };
}

function assertUniqueStepIds(steps: AIFinancePlanStep[]) {
  const ids = new Set<string>();

  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new Error(`Duplicate plan step id: ${step.id}`);
    }

    ids.add(step.id);
  }
}

function assertDependenciesExist(steps: AIFinancePlanStep[]) {
  const ids = new Set(steps.map((step) => step.id));

  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Unknown dependency ${dependency} in step ${step.id}.`);
      }
    }
  }
}

function assertNoCycles(steps: AIFinancePlanStep[]) {
  const graph = new Map(steps.map((step) => [step.id, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular plan dependency detected at ${id}.`);
    }

    visiting.add(id);

    for (const dependency of graph.get(id) ?? []) {
      visit(dependency);
    }

    visiting.delete(id);
    visited.add(id);
  }

  for (const step of steps) {
    visit(step.id);
  }
}

function assertReadBeforeWrite(steps: AIFinancePlanStep[]) {
  let writeSeen = false;

  for (const step of steps) {
    if (step.mode === "write") {
      writeSeen = true;
      continue;
    }

    if (writeSeen) {
      throw new Error(
        "Read steps must appear before write steps in the execution plan.",
      );
    }
  }
}

export function validateAIFinanceExecutionPlan(
  value: unknown,
): AIFinanceExecutionPlan {
  const input = asObject(value);
  const objective = asString(input.objective, "objective");

  if (!Array.isArray(input.steps)) {
    throw new Error("steps must be an array.");
  }

  if (input.steps.length === 0) {
    throw new Error("Plan must contain at least one step.");
  }

  if (input.steps.length > MAX_PLAN_STEPS) {
    throw new Error(`Plan cannot exceed ${MAX_PLAN_STEPS} steps.`);
  }

  const steps = input.steps.map(normalizeStep);

  assertUniqueStepIds(steps);
  assertDependenciesExist(steps);
  assertNoCycles(steps);
  assertReadBeforeWrite(steps);

  return {
    objective,
    steps,
  };
}
