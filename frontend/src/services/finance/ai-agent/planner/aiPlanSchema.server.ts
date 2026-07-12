import { listAIFinanceToolRegistrations } from "../tools/aiToolRegistry.server";

export const AI_FINANCE_PLAN_SCHEMA_NAME = "myfinance_execution_plan";

function strictArgumentsSchema(
  tool: ReturnType<typeof listAIFinanceToolRegistrations>[number],
) {
  const parameters = tool.definition.parameters;
  const required = new Set(parameters.required);
  const properties = Object.fromEntries(
    Object.entries(parameters.properties).map(([key, schema]) => [
      key,
      required.has(key) ? schema : { anyOf: [schema, { type: "null" }] },
    ]),
  );

  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function stepSchemaForTool(
  tool: ReturnType<typeof listAIFinanceToolRegistrations>[number],
) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "toolName", "reason", "mode", "arguments", "dependsOn"],
    properties: {
      id: {
        type: "string",
        pattern: "^step_[1-9][0-9]*$",
        description: "Stable unique step id such as step_1.",
      },
      toolName: {
        type: "string",
        enum: [tool.name],
      },
      reason: {
        type: "string",
        minLength: 1,
        maxLength: 500,
      },
      mode: {
        type: "string",
        enum: [tool.mode],
      },
      arguments: strictArgumentsSchema(tool),
      dependsOn: {
        type: "array",
        maxItems: 20,
        items: {
          type: "string",
          pattern: "^step_[1-9][0-9]*$",
        },
      },
    },
  } as const;
}

export function buildAIFinancePlanJsonSchema() {
  const tools = listAIFinanceToolRegistrations();

  return {
    type: "object",
    additionalProperties: false,
    required: ["objective", "steps"],
    properties: {
      objective: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description: "Concise objective for the execution plan.",
      },
      steps: {
        type: "array",
        maxItems: 20,
        items: {
          anyOf: tools.map(stepSchemaForTool),
        },
      },
    },
  } as const;
}
