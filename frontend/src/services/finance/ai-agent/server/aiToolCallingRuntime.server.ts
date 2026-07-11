import { executeAIFinanceToolCall } from "../tools/aiToolExecutor.server";
import { getAIFinanceToolDefinitions } from "../tools/aiToolRegistry.server";
import type {
  AIFinanceExecutedToolCall,
  AIFinanceToolCall,
  AIFinanceToolContext,
} from "../tools/aiToolTypes";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_AGENT_STEPS = 8;
const MAX_TOOL_CALLS = 12;

type OpenAIOutputItem = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
};

type OpenAIResponsePayload = {
  id?: string;
  output_text?: string;
  output?: OpenAIOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

export type RunAIFinanceAgentInput = {
  apiKey: string;
  model: string;
  question: string;
  systemPrompt: string;
  context: AIFinanceToolContext;
  conversationId?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type RunAIFinanceAgentResult = {
  answer: string;
  responseId?: string;
  steps: number;
  toolCalls: AIFinanceExecutedToolCall[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

function extractToolCalls(payload: OpenAIResponsePayload): AIFinanceToolCall[] {
  return (payload.output ?? [])
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      callId: item.call_id ?? "",
      name: item.name ?? "",
      argumentsJson: item.arguments ?? "{}",
    }))
    .filter((item) => item.callId && item.name);
}

async function callOpenAI(input: {
  apiKey: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
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

  return payload;
}

export async function runAIFinanceToolCallingAgent(
  input: RunAIFinanceAgentInput,
): Promise<RunAIFinanceAgentResult> {
  const allExecutedCalls: AIFinanceExecutedToolCall[] = [];
  let previousResponseId: string | undefined;
  let nextInput: unknown = [
    {
      role: "system",
      content: input.systemPrompt,
    },
    {
      role: "user",
      content: input.question,
    },
  ];

  for (let step = 1; step <= MAX_AGENT_STEPS; step += 1) {
    const body: Record<string, unknown> = {
      model: input.model,
      input: nextInput,
      tools: getAIFinanceToolDefinitions(),
      tool_choice: "auto",
      max_output_tokens: input.maxOutputTokens ?? 1800,
    };

    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    if (!input.model.toLowerCase().startsWith("gpt-5")) {
      body.temperature = input.temperature ?? 0.2;
    }

    const payload = await callOpenAI({
      apiKey: input.apiKey,
      body,
    });

    previousResponseId = payload.id ?? previousResponseId;
    const toolCalls = extractToolCalls(payload);

    if (toolCalls.length == 0) {
      return {
        answer: String(payload.output_text ?? "").trim(),
        responseId: payload.id,
        steps: step,
        toolCalls: allExecutedCalls,
        usage: payload.usage
          ? {
              inputTokens: payload.usage.input_tokens,
              outputTokens: payload.usage.output_tokens,
              totalTokens: payload.usage.total_tokens,
            }
          : undefined,
      };
    }

    if (allExecutedCalls.length + toolCalls.length > MAX_TOOL_CALLS) {
      throw new Error("AI tool call limit exceeded.");
    }

    const executedCalls = await Promise.all(
      toolCalls.map((call) =>
        executeAIFinanceToolCall(input.context, call, {
          conversationId: input.conversationId,
        }),
      ),
    );

    allExecutedCalls.push(...executedCalls);

    nextInput = executedCalls.map((call) => ({
      type: "function_call_output",
      call_id: call.callId,
      output: JSON.stringify(call.result),
    }));
  }

  throw new Error("AI agent step limit exceeded.");
}
