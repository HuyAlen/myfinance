import { getAIFinanceTool } from "../tools/aiToolRegistry.server";
import type { AIFinanceExecutionPlan, AIFinancePlanStep } from "./aiPlanTypes";

const MAX_PLAN_STEPS = 20;
const STEP_ID_PATTERN = /^step_[1-9][0-9]*$/;
const REFERENCE_PATTERN = /\{\{(step_[1-9][0-9]*)\.data(?:\.[^{}\s]+)+\}\}/g;

export class AIFinancePlanValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid AI finance execution plan: ${issues.join(" | ")}`);
    this.name = "AIFinancePlanValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringsOf(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function normalizeToolArguments(
  tool: NonNullable<ReturnType<typeof getAIFinanceTool>>,
  args: Record<string, unknown>,
) {
  const allowedKeys = new Set(
    Object.keys(tool.definition.parameters.properties ?? {}),
  );

  return Object.fromEntries(
    Object.entries(args).filter(([key, value]) => {
      if (!allowedKeys.has(key)) return false;

      // Missing write values must remain missing so the executor can render
      // the interactive action form. Do not preserve null/undefined/empty
      // placeholders merely because a field is required by the final tool.
      if (tool.mode === "write") {
        return value !== undefined && value !== null && value !== "";
      }

      return value !== undefined && value !== null;
    }),
  );
}

function collectReferences(value: unknown, output = new Set<string>()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(REFERENCE_PATTERN)) output.add(match[1]);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, output));
    return output;
  }
  if (isRecord(value))
    Object.values(value).forEach((item) => collectReferences(item, output));
  return output;
}

function detectCycle(steps: AIFinancePlanStep[]) {
  const graph = new Map(steps.map((step) => [step.id, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(stepId: string): boolean {
    if (visiting.has(stepId)) return true;
    if (visited.has(stepId)) return false;
    visiting.add(stepId);
    for (const dependency of graph.get(stepId) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  }

  return steps.some((step) => visit(step.id));
}

export function validateAIFinanceExecutionPlan(
  value: unknown,
): AIFinanceExecutionPlan {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new AIFinancePlanValidationError(["Plan must be an object."]);
  }

  const objective =
    typeof value.objective === "string" ? value.objective.trim() : "";
  if (!objective) issues.push("objective is required.");
  if (objective.length > 500) issues.push("objective is too long.");

  if (!Array.isArray(value.steps)) {
    throw new AIFinancePlanValidationError([
      ...issues,
      "steps must be an array.",
    ]);
  }
  if (value.steps.length > MAX_PLAN_STEPS)
    issues.push(`steps cannot exceed ${MAX_PLAN_STEPS}.`);

  const parsedSteps: AIFinancePlanStep[] = [];
  const ids = new Set<string>();

  value.steps.forEach((rawStep, index) => {
    const prefix = `steps[${index}]`;
    if (!isRecord(rawStep)) {
      issues.push(`${prefix} must be an object.`);
      return;
    }

    const id = typeof rawStep.id === "string" ? rawStep.id.trim() : "";
    const toolName =
      typeof rawStep.toolName === "string" ? rawStep.toolName.trim() : "";
    const reason =
      typeof rawStep.reason === "string" ? rawStep.reason.trim() : "";
    const mode = rawStep.mode;
    const args = rawStep.arguments;
    const dependsOn = stringsOf(rawStep.dependsOn);

    if (!STEP_ID_PATTERN.test(id))
      issues.push(`${prefix}.id must match step_<number>.`);
    else if (ids.has(id)) issues.push(`${prefix}.id duplicates ${id}.`);
    else ids.add(id);

    if (!toolName) issues.push(`${prefix}.toolName is required.`);
    if (!reason) issues.push(`${prefix}.reason is required.`);
    if (mode !== "read" && mode !== "write")
      issues.push(`${prefix}.mode must be read or write.`);
    if (!isRecord(args)) issues.push(`${prefix}.arguments must be an object.`);
    if (!dependsOn) issues.push(`${prefix}.dependsOn must be a string array.`);

    if (
      id &&
      toolName &&
      reason &&
      (mode === "read" || mode === "write") &&
      isRecord(args) &&
      dependsOn
    ) {
      parsedSteps.push({
        id,
        toolName,
        reason,
        mode,
        arguments: args,
        dependsOn,
      });
    }
  });

  const stepIndex = new Map(parsedSteps.map((step, index) => [step.id, index]));

  for (const step of parsedSteps) {
    const tool = getAIFinanceTool(step.toolName);
    if (!tool) {
      issues.push(`${step.id} uses unknown tool ${step.toolName}.`);
      continue;
    }

    if (tool.mode !== step.mode) {
      issues.push(
        `${step.id} mode ${step.mode} does not match ${step.toolName} mode ${tool.mode}.`,
      );
    }

    const normalizedArguments = normalizeToolArguments(tool, step.arguments);
    step.arguments = normalizedArguments;

    // AI-3.5.5.1B — Deferred Write Validation
    //
    // Read tools remain strict because their arguments are immediately used.
    // Write tools are intentionally NOT business-validated at plan time. A
    // planner may emit partial values (or placeholders such as 0) solely to
    // identify the intended action. The executor/action-form pipeline owns
    // required-field checks and business validation after the user completes
    // the form and before a Pending Action is created.
    if (tool.mode === "read") {
      try {
        tool.validate(normalizedArguments);
      } catch (error) {
        issues.push(
          `${step.id} arguments are invalid: ${error instanceof Error ? error.message : "validation failed"}.`,
        );
      }
    }

    const currentIndex = stepIndex.get(step.id) ?? -1;
    for (const dependency of step.dependsOn) {
      const dependencyIndex = stepIndex.get(dependency);
      if (dependencyIndex === undefined)
        issues.push(`${step.id} depends on missing step ${dependency}.`);
      else if (dependencyIndex >= currentIndex)
        issues.push(
          `${step.id} must depend only on an earlier step (${dependency}).`,
        );
    }

    for (const reference of collectReferences(step.arguments)) {
      const referenceIndex = stepIndex.get(reference);
      if (referenceIndex === undefined)
        issues.push(`${step.id} references missing step ${reference}.`);
      else if (!step.dependsOn.includes(reference))
        issues.push(
          `${step.id} references ${reference} but does not declare it in dependsOn.`,
        );
      else if (referenceIndex >= currentIndex)
        issues.push(`${step.id} references non-earlier step ${reference}.`);
    }
  }

  const firstWriteIndex = parsedSteps.findIndex(
    (step) => step.mode === "write",
  );
  if (
    firstWriteIndex >= 0 &&
    parsedSteps.slice(firstWriteIndex + 1).some((step) => step.mode === "read")
  ) {
    issues.push("All read steps must appear before write steps.");
  }
  if (detectCycle(parsedSteps))
    issues.push("Plan dependencies contain a cycle.");
  if (issues.length > 0) throw new AIFinancePlanValidationError(issues);

  return { objective, steps: parsedSteps };
}
