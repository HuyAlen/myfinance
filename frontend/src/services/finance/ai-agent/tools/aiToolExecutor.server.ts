import { buildAIActionFormMetadata } from "../action-form/aiActionFormResolver.server";
import { buildPendingActionPreview } from "../server/aiPendingActionPreview.server";
import { createPendingAction } from "../server/aiPendingActionRepository.server";
import { validateWriteToolRequest } from "../server/aiWriteToolValidation.server";
import { getAIFinanceTool } from "./aiToolRegistry.server";
import type {
  AIFinanceExecutedToolCall,
  AIFinanceToolCall,
  AIFinanceToolContext,
  AIFinanceToolRegistration,
} from "./aiToolTypes";

function parseArguments(argumentsJson: string): unknown {
  if (!argumentsJson.trim()) return {};

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

function hasValue(value: unknown) {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || Boolean(value.trim());
}

function missingRequiredFields(
  registration: AIFinanceToolRegistration,
  argumentsRecord: Record<string, unknown>,
) {
  return registration.definition.parameters.required.filter(
    (field) => !hasValue(argumentsRecord[field]),
  );
}

function validationFieldFromError(input: {
  error: unknown;
  registration: AIFinanceToolRegistration;
}) {
  const message = input.error instanceof Error ? input.error.message : "";
  const propertyNames = Object.keys(
    input.registration.definition.parameters.properties,
  );

  return propertyNames.find(
    (field) =>
      message === field ||
      message.startsWith(`${field} `) ||
      message.startsWith(`${field}:`) ||
      message.includes(`\"${field}\"`),
  );
}

function withoutInvalidField(
  argumentsRecord: Record<string, unknown>,
  invalidField?: string,
) {
  if (!invalidField) return { ...argumentsRecord };

  return Object.fromEntries(
    Object.entries(argumentsRecord).filter(([key]) => key !== invalidField),
  );
}

function buildDeferredWriteFormResult(input: {
  call: AIFinanceToolCall;
  registration: AIFinanceToolRegistration;
  rawArguments: Record<string, unknown>;
  validationError?: unknown;
}): AIFinanceExecutedToolCall {
  const invalidField = validationFieldFromError({
    error: input.validationError,
    registration: input.registration,
  });
  const initialValues = withoutInvalidField(input.rawArguments, invalidField);
  const form = buildAIActionFormMetadata({
    toolName: input.registration.name,
    initialValues,
    source: "planner",
  });

  if (!form) {
    throw new Error(`ACTION_FORM_NOT_SUPPORTED:${input.registration.name}`);
  }

  return {
    callId: input.call.callId,
    name: input.call.name,
    result: {
      ok: true,
      data: {
        kind: "action_form_required",
        actionForm: form,
        deferredValidation: input.validationError
          ? {
              field: invalidField,
              message:
                input.validationError instanceof Error
                  ? input.validationError.message
                  : "Write arguments require user review.",
            }
          : undefined,
      },
    },
  };
}

export async function executeAIFinanceToolCall(
  context: AIFinanceToolContext,
  call: AIFinanceToolCall,
  options?: { conversationId?: string },
): Promise<AIFinanceExecutedToolCall> {
  const registration = getAIFinanceTool(call.name);

  if (!registration) {
    return {
      callId: call.callId,
      name: call.name,
      result: { ok: false, error: `Unknown tool: ${call.name}` },
    };
  }

  try {
    const parsed = parseArguments(call.argumentsJson);
    const rawArguments = asRecord(parsed);

    if (registration.mode === "write") {
      const missingFields = missingRequiredFields(registration, rawArguments);

      if (missingFields.length > 0) {
        return buildDeferredWriteFormResult({
          call,
          registration,
          rawArguments,
        });
      }

      let validatedArgs: unknown;

      try {
        validatedArgs = registration.validate(parsed);
      } catch (validationError) {
        // AI-3.5.5.1C:
        // Planner-originated write arguments may contain placeholders such as
        // limitAmount: 0. Do not fail the tool execution here. Remove the
        // invalid field when it can be identified and let the interactive form
        // collect a valid value. The prepare API remains the strict validation
        // boundary before a Pending Action is created.
        return buildDeferredWriteFormResult({
          call,
          registration,
          rawArguments,
          validationError,
        });
      }

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

    const validatedArgs = registration.validate(parsed);

    return {
      callId: call.callId,
      name: call.name,
      result: await registration.execute(context, validatedArgs),
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
