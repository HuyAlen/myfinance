import { executeAIFinanceToolCall } from "../tools/aiToolExecutor.server";
import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { extractPendingActions } from "../server/aiPendingActionResponse.server";
import { buildAIFinancePlannerSystemPrompt } from "./aiPlannerPrompt.server";
import { validateAIFinanceExecutionPlan } from "./aiPlanValidation.server";
import { resolvePlanStepArguments } from "./aiPlanReferenceResolver.server";
import type {
  AIFinanceExecutionPlan,
  AIFinancePlannerResult,
  AIFinancePlannerUsage,
  AIFinancePlanStepResult,
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
};

type OpenAIResponseFormat = "text" | "json_object";

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
    body.text = {
      format: {
        type: "json_object",
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
  const systemPrompt = buildAIFinancePlannerSystemPrompt();
  const baseUserPrompt = input.planningContext ?? input.question;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const payload = await callOpenAI({
      apiKey: input.apiKey,
      model: input.model,
      systemPrompt,
      userPrompt:
        attempt === 1
          ? baseUserPrompt
          : [
              baseUserPrompt,
              "",
              "IMPORTANT RETRY:",
              "Return exactly one valid JSON object.",
              "Do not include markdown, comments, trailing text, or a second JSON object.",
              "The response must match the execution-plan shape from the system prompt.",
            ].join("\n"),
      temperature: attempt === 1 ? input.temperature : 0,
      maxOutputTokens: Math.max(input.maxOutputTokens ?? 2400, 2400),
      responseFormat: "json_object",
    });

    try {
      const parsed = parseJsonText(extractOpenAIOutputText(payload));
      const plan = validateAIFinanceExecutionPlan(parsed);

      return {
        plan,
        usage: usageOf(payload),
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Planner returned an invalid execution plan.");
    }
  }

  throw lastError ?? new Error("Planner could not create a valid plan.");
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
  temperature?: number;
  maxOutputTokens?: number;
}) {
  const payload = await callOpenAI({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: [
      "You are MyFinance AI.",
      "Answer in Vietnamese.",
      "Use only the supplied execution results.",
      "Never claim a confirmation-required action has already been completed.",
      "When pending actions exist, tell the user to review and confirm the cards below.",
      "Keep the answer concise and practical.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      question: input.question,
      plan: input.plan,
      results: input.steps,
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
  const { plan, usage: plannerUsage } = await createPlan(input);
  const steps = await executePlan({
    plan,
    context: input.context,
    conversationId: input.conversationId,
  });

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
  const synthesis = await synthesizeAnswer({
    apiKey: input.apiKey,
    model: input.model,
    question: input.question,
    plan,
    steps,
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
  });

  return {
    answer:
      synthesis.answer ||
      (pendingActions.length > 0
        ? "Tôi đã chuẩn bị hành động. Vui lòng kiểm tra và xác nhận bên dưới."
        : "Tôi đã hoàn tất kế hoạch phân tích."),
    plan,
    steps,
    pendingActions,
    plannerUsage,
    synthesisUsage: synthesis.usage,
  };
}
