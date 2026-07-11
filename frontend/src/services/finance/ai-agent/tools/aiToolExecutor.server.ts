import { buildPendingActionPreview } from "../server/aiPendingActionPreview.server";
import { createPendingAction } from "../server/aiPendingActionRepository.server";
import { validateWriteToolRequest } from "../server/aiWriteToolValidation.server";
import { getAIFinanceTool } from "./aiToolRegistry.server";
import type {
  AIFinanceExecutedToolCall,
  AIFinanceToolCall,
  AIFinanceToolContext,
} from "./aiToolTypes";

function parseArguments(argumentsJson: string): unknown {
  if (!argumentsJson.trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("Tool arguments are not valid JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Validated tool arguments must be an object.");
  }

  return value as Record<string, unknown>;
}

export async function executeAIFinanceToolCall(
  context: AIFinanceToolContext,
  call: AIFinanceToolCall,
  options?: {
    conversationId?: string;
  },
): Promise<AIFinanceExecutedToolCall> {
  const registration = getAIFinanceTool(call.name);

  if (!registration) {
    return {
      callId: call.callId,
      name: call.name,
      result: {
        ok: false,
        error: `Unknown tool: ${call.name}`,
      },
    };
  }

  try {
    const parsed = parseArguments(call.argumentsJson);
    const validatedArgs = registration.validate(parsed);

    if (registration.mode === "write") {
      const argumentsRecord = asRecord(validatedArgs);

      const validation = await validateWriteToolRequest({
        context,
        toolName: registration.name,
        arguments: argumentsRecord,
      });

      const preview = await buildPendingActionPreview({
        context,
        toolName: registration.name,
        arguments: validation.normalizedArguments,
      });

      const pendingAction = await createPendingAction({
        context,
        conversationId: options?.conversationId,
        toolName: registration.name,
        arguments: validation.normalizedArguments,
        preview,
        oldValue: validation.oldValue,
        newValue: validation.newValue,
      });

      return {
        callId: call.callId,
        name: call.name,
        result: {
          ok: true,
          data: {
            kind: "confirmation_required",
            pendingAction: {
              id: pendingAction.id,
              toolName: pendingAction.tool_name,
              preview: pendingAction.preview,
              status: pendingAction.status,
              expiresAt: pendingAction.expires_at,
            },
          },
        },
      };
    }

    const result = await registration.execute(context, validatedArgs);

    return {
      callId: call.callId,
      name: call.name,
      result,
    };
  } catch (error) {
    return {
      callId: call.callId,
      name: call.name,
      result: {
        ok: false,
        error:
          error instanceof Error ? error.message : "Tool execution failed.",
      },
    };
  }
}
