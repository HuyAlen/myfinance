import { executeAIFinanceToolCall } from "../tools/aiToolExecutor.server";
import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { extractPendingActions } from "../server/aiPendingActionResponse.server";
import {
  buildAIFinancePlannerSystemPrompt,
  buildAIFinanceSynthesisSystemPrompt,
} from "./aiPlannerPrompt.server";
import {
  AIFinancePlanValidationError,
  validateAIFinanceExecutionPlan,
} from "./aiPlanValidation.server";
import {
  AI_FINANCE_PLAN_SCHEMA_NAME,
  buildAIFinancePlanJsonSchema,
} from "./aiPlanSchema.server";
import { resolvePlanStepArguments } from "./aiPlanReferenceResolver.server";
import { runAIFinancePostToolReasoning } from "../reasoning/aiPostToolReasoning.server";
import type {
  AIFinanceAnalysisOperation,
  AIFinanceCapability,
} from "../context/aiFinanceCapabilities";
import type {
  AIFinanceExecutionPlan,
  AIFinancePlannerResult,
  AIFinancePlannerUsage,
  AIFinancePlanStepResult,
  AIPlannerDebugMetadata,
  AIPlannerDebugToolStatus,
} from "./aiPlanTypes";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type OpenAIOutputTextContent = {
  type?: string;
  text?: string;
};

type OpenAIOutputMessage = {
  type?: string;
  content?: OpenAIOutputTextContent[];
};

type OpenAIResponsePayload = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: OpenAIOutputMessage[];
  incomplete_details?: {
    reason?: string;
  } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  } | null;
};

type RunPlannerInput = {
  apiKey: string;
  model: string;
  question: string;
  planningContext?: string;
  context: AIFinanceToolContext;
  conversationId?: string;
  temperature?: number;
  maxOutputTokens?: number;
  debug?: boolean;
  debugIntent?: string;
  reasoningCapabilities?: AIFinanceCapability[];
  reasoningOperations?: AIFinanceAnalysisOperation[];
};

type OpenAIResponseFormat = "text" | "json_object" | "json_schema";

function durationSince(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function sanitizeDebugError(value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "Unknown error.";

  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[REDACTED_ID]")
    .slice(0, 300);
}

function toDebugToolStatus(
  status: AIFinancePlanStepResult["status"],
): AIPlannerDebugToolStatus {
  if (status === "completed") return "success";
  if (status === "pending") return "planned";
  return status;
}

function usageOf(
  payload: OpenAIResponsePayload,
): AIFinancePlannerUsage | undefined {
  if (!payload.usage) return undefined;

  return {
    inputTokens: payload.usage.input_tokens,
    outputTokens: payload.usage.output_tokens,
    totalTokens: payload.usage.total_tokens,
  };
}

function extractOpenAIOutputText(payload: OpenAIResponsePayload) {
  const rootText = payload.output_text?.trim();

  if (rootText) {
    return rootText;
  }

  const textParts =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter(
        (content) =>
          content.type === "output_text" && typeof content.text === "string",
      )
      .map((content) => content.text?.trim() ?? "")
      .filter(Boolean) ?? [];

  return textParts.join("\n").trim();
}

async function callOpenAI(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: OpenAIResponseFormat;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
}) {
  const body: Record<string, unknown> = {
    model: input.model,
    input: [
      {
        role: "system",
        content: input.systemPrompt,
      },
      {
        role: "user",
        content: input.userPrompt,
      },
    ],
    max_output_tokens: input.maxOutputTokens ?? 1800,
  };

  if (input.responseFormat === "json_object") {
    body.text = { format: { type: "json_object" } };
  }

  if (input.responseFormat === "json_schema") {
    if (!input.jsonSchema) {
      throw new Error("jsonSchema is required for structured output.");
    }

    body.text = {
      format: {
        type: "json_schema",
        name: input.schemaName ?? "structured_output",
        strict: true,
        schema: input.jsonSchema,
      },
    };
  }

  if (!input.model.toLowerCase().startsWith("gpt-5")) {
    body.temperature = input.temperature ?? 0.2;
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as OpenAIResponsePayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `OpenAI request failed with status ${response.status}.`,
    );
  }

  if (payload.status === "incomplete") {
    const reason = payload.incomplete_details?.reason ?? "unknown reason";

    throw new Error(
      reason === "max_output_tokens"
        ? "OpenAI response was incomplete because max_output_tokens was too low."
        : `OpenAI response was incomplete: ${reason}.`,
    );
  }

  return payload;
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");

  if (start < 0) {
    throw new Error("Planner response does not contain a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("Planner returned an incomplete JSON object.");
}

function parseJsonText(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("Planner returned an empty response.");
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const jsonText = extractFirstJsonObject(withoutFence);

  try {
    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Planner returned invalid JSON: ${error.message}`
        : "Planner returned invalid JSON.",
    );
  }
}

function dependenciesCompleted(
  step: AIFinanceExecutionPlan["steps"][number],
  results: Map<string, AIFinancePlanStepResult>,
) {
  return step.dependsOn.every((dependencyId) => {
    const result = results.get(dependencyId);

    return (
      result?.status === "completed" ||
      result?.status === "confirmation_required"
    );
  });
}

async function createPlan(input: RunPlannerInput) {
  const planningStartedAt = Date.now();
  const systemPrompt = buildAIFinancePlannerSystemPrompt();
  const baseUserPrompt = input.planningContext ?? input.question;
  const retryErrors: string[] = [];
  const validationErrors: string[] = [];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const retryFeedback =
      attempt === 1 || validationErrors.length === 0
        ? ""
        : [
            "",
            "PREVIOUS PLAN VALIDATION FAILED:",
            ...validationErrors.slice(-8).map((item) => `- ${item}`),
            "Return a corrected plan that satisfies the schema and all validation rules.",
          ].join("\n");

    try {
      const payload = await callOpenAI({
        apiKey: input.apiKey,
        model: input.model,
        systemPrompt,
        userPrompt: `${baseUserPrompt}${retryFeedback}`,
        temperature: attempt === 1 ? input.temperature : 0,
        maxOutputTokens: Math.max(input.maxOutputTokens ?? 2400, 2400),
        responseFormat: "json_schema",
        jsonSchema: buildAIFinancePlanJsonSchema() as unknown as Record<
          string,
          unknown
        >,
        schemaName: AI_FINANCE_PLAN_SCHEMA_NAME,
      });

      const validationStartedAt = Date.now();

      try {
        const rawText = extractOpenAIOutputText(payload);
        const parsed = parseJsonText(rawText);
        const plan = validateAIFinanceExecutionPlan(parsed);

        return {
          plan,
          usage: usageOf(payload),
          plannerAttempt: attempt,
          plannerStatus: attempt === 1 ? "success" : "retry_success",
          planningMs: durationSince(planningStartedAt),
          validationMs: durationSince(validationStartedAt),
          retryErrors,
          validationErrors,
        } as const;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Planner returned an invalid execution plan.");

        const issues =
          error instanceof AIFinancePlanValidationError
            ? error.issues
            : [sanitizeDebugError(lastError)];

        for (const issue of issues) {
          const sanitized = sanitizeDebugError(issue);
          validationErrors.push(sanitized);
          retryErrors.push(`Attempt ${attempt}: ${sanitized}`);
        }
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Planner request failed.");
      retryErrors.push(`Attempt ${attempt}: ${sanitizeDebugError(lastError)}`);
    }
  }

  const failure =
    lastError ?? new Error("Planner could not create a valid structured plan.");
  Object.assign(failure, {
    plannerDebugFailure: {
      plannerAttempt: 2,
      planningMs: durationSince(planningStartedAt),
      retryErrors,
      validationErrors,
    },
  });
  throw failure;
}

async function executePlan(input: {
  plan: AIFinanceExecutionPlan;
  context: AIFinanceToolContext;
  conversationId?: string;
}) {
  const resultMap = new Map<string, AIFinancePlanStepResult>();

  for (const step of input.plan.steps) {
    if (!dependenciesCompleted(step, resultMap)) {
      resultMap.set(step.id, {
        stepId: step.id,
        toolName: step.toolName,
        mode: step.mode,
        status: "skipped",
        reason: step.reason,
        arguments: step.arguments,
        error: "A dependency did not complete successfully.",
      });
      continue;
    }

    const stepStartedAt = Date.now();

    try {
      const resolvedArguments = resolvePlanStepArguments(
        step.arguments,
        resultMap,
      );

      const executed = await executeAIFinanceToolCall(
        input.context,
        {
          callId: step.id,
          name: step.toolName,
          argumentsJson: JSON.stringify(resolvedArguments),
        },
        {
          conversationId: input.conversationId,
        },
      );

      const data =
        executed.result.data &&
        typeof executed.result.data === "object" &&
        !Array.isArray(executed.result.data)
          ? (executed.result.data as Record<string, unknown>)
          : null;

      const confirmationRequired = data?.kind === "confirmation_required";

      resultMap.set(step.id, {
        stepId: step.id,
        toolName: step.toolName,
        mode: step.mode,
        status: executed.result.ok
          ? confirmationRequired
            ? "confirmation_required"
            : "completed"
          : "failed",
        reason: step.reason,
        arguments: resolvedArguments,
        output: executed.result,
        error: executed.result.error,
        durationMs: durationSince(stepStartedAt),
      });
    } catch (error) {
      resultMap.set(step.id, {
        stepId: step.id,
        toolName: step.toolName,
        mode: step.mode,
        status: "failed",
        reason: step.reason,
        arguments: step.arguments,
        error:
          error instanceof Error
            ? error.message
            : "Plan step execution failed.",
        durationMs: durationSince(stepStartedAt),
      });
    }
  }

  return input.plan.steps.map((step) => resultMap.get(step.id)!);
}

async function synthesizeAnswer(input: {
  apiKey: string;
  model: string;
  question: string;
  plan: AIFinanceExecutionPlan;
  steps: AIFinancePlanStepResult[];
  reasoning: ReturnType<typeof runAIFinancePostToolReasoning>;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  const payload = await callOpenAI({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: buildAIFinanceSynthesisSystemPrompt(),
    userPrompt: JSON.stringify({
      question: input.question,
      plan: input.plan,
      results: input.steps,
      postToolReasoning: input.reasoning,
    }),
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens ?? 1600,
    responseFormat: "text",
  });

  return {
    answer: extractOpenAIOutputText(payload),
    usage: usageOf(payload),
  };
}

export async function runAIFinanceDynamicPlanner(
  input: RunPlannerInput,
): Promise<AIFinancePlannerResult> {
  const totalStartedAt = Date.now();
  const planning = await createPlan(input);
  const executionStartedAt = Date.now();
  const steps = await executePlan({
    plan: planning.plan,
    context: input.context,
    conversationId: input.conversationId,
  });
  const executionMs = durationSince(executionStartedAt);

  const executedToolCalls = steps.map((step) => ({
    callId: step.stepId,
    name: step.toolName,
    result:
      step.output &&
      typeof step.output === "object" &&
      !Array.isArray(step.output)
        ? (step.output as {
            ok: boolean;
            data?: unknown;
            error?: string;
          })
        : {
            ok: step.status !== "failed",
            error: step.error,
          },
  }));

  const pendingActions = extractPendingActions(executedToolCalls);
  const reasoning = runAIFinancePostToolReasoning({
    steps,
    capabilities: input.reasoningCapabilities,
    operations: input.reasoningOperations,
  });
  const synthesisStartedAt = Date.now();
  const synthesis = await synthesizeAnswer({
    apiKey: input.apiKey,
    model: input.model,
    question: input.question,
    plan: planning.plan,
    steps,
    reasoning,
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
  });
  const synthesisMs = durationSince(synthesisStartedAt);

  const debug: AIPlannerDebugMetadata | undefined = input.debug
    ? {
        enabled: true,
        plannerStatus: planning.plannerStatus,
        intent: input.debugIntent,
        model: input.model,
        plannerAttempt: planning.plannerAttempt,
        selectedTools: steps.map((step) => ({
          stepId: step.stepId,
          toolName: step.toolName,
          mode: step.mode,
          reason: step.reason,
          status: toDebugToolStatus(step.status),
          argumentKeys: Object.keys(step.arguments).sort(),
          durationMs: step.durationMs,
          error: step.error ? sanitizeDebugError(step.error) : undefined,
        })),
        timing: {
          totalMs: durationSince(totalStartedAt),
          planningMs: planning.planningMs,
          validationMs: planning.validationMs,
          executionMs,
          synthesisMs,
        },
        validationErrors: planning.validationErrors,
        retryErrors: planning.retryErrors,
      }
    : undefined;

  return {
    answer:
      synthesis.answer ||
      (pendingActions.length > 0
        ? "Tôi đã chuẩn bị hành động. Vui lòng kiểm tra và xác nhận bên dưới."
        : "Tôi đã hoàn tất kế hoạch phân tích."),
    plan: planning.plan,
    steps,
    pendingActions,
    plannerUsage: planning.usage,
    synthesisUsage: synthesis.usage,
    reasoning,
    debug,
  };
}
