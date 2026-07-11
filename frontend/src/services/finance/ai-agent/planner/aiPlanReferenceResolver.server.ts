import type { AIFinancePlanStepResult } from "./aiPlanTypes";

const REFERENCE_PATTERN = /^\{\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\}\}$/;

function readPath(value: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current = value;

  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function resolveValue(
  value: unknown,
  results: Map<string, AIFinancePlanStepResult>,
): unknown {
  if (typeof value === "string") {
    const match = value.match(REFERENCE_PATTERN);

    if (!match) return value;

    const [, stepId, path] = match;
    const result = results.get(stepId);

    if (!result) {
      throw new Error(`Reference step not found: ${stepId}`);
    }

    const resolved = readPath(result.output, path);

    if (resolved === undefined) {
      throw new Error(`Reference path not found: ${value}`);
    }

    return resolved;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, results));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [key, resolveValue(nestedValue, results)],
      ),
    );
  }

  return value;
}

export function resolvePlanStepArguments(
  argumentsValue: Record<string, unknown>,
  results: Map<string, AIFinancePlanStepResult>,
) {
  return resolveValue(argumentsValue, results) as Record<string, unknown>;
}
