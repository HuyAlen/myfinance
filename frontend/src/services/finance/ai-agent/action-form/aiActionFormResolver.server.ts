import { randomUUID } from "node:crypto";

import { getAIFinanceTool } from "../tools/aiToolRegistry.server";
import { getAIActionFormSchema } from "./aiActionFormRegistry.server";
import type { AIActionFormMetadata } from "./aiActionFormTypes";

function hasValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  return true;
}

export function getMissingWriteArguments(
  toolName: string,
  values: Record<string, unknown>,
) {
  const tool = getAIFinanceTool(toolName);
  if (!tool || tool.mode !== "write") return [];

  return tool.definition.parameters.required.filter(
    (field) => !hasValue(values[field]),
  );
}

export function buildAIActionFormMetadata(input: {
  toolName: string;
  initialValues?: Record<string, unknown>;
  source?: AIActionFormMetadata["source"];
}): AIActionFormMetadata | null {
  const schema = getAIActionFormSchema(input.toolName);
  if (!schema) return null;

  const initialValues = Object.fromEntries(
    schema.fields
      .map((field) => [
        field.name,
        input.initialValues?.[field.name] ?? field.defaultValue,
      ])
      .filter(([, value]) => value !== undefined),
  );

  return {
    id: randomUUID(),
    toolName: input.toolName,
    schema,
    initialValues,
    missingFields: getMissingWriteArguments(input.toolName, initialValues),
    source: input.source ?? "planner",
  };
}
