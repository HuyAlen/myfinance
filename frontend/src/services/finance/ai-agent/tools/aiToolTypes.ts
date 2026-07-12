import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/lib/database.types";

export type AIFinanceToolMode = "read" | "write";

export type AIFinanceToolContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

export type AIFinanceToolResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type AIFinanceToolDefinition = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
};

export type AIFinanceToolSemanticMetadata = {
  capabilities: string[];
  returns: string[];
  useWhen: string[];
  doNotUseWhen: string[];
  examples: string[];
  priority: number;
};

export type AIFinanceToolRegistration<TArgs = unknown> = {
  name: string;
  mode: AIFinanceToolMode;
  description: string;
  semantic: AIFinanceToolSemanticMetadata;
  definition: AIFinanceToolDefinition;

  validate: (input: unknown) => TArgs;

  execute: (
    context: AIFinanceToolContext,
    args: TArgs,
  ) => Promise<AIFinanceToolResult>;
};

export type AIFinanceToolCall = {
  callId: string;
  name: string;
  argumentsJson: string;
};

export type AIFinanceExecutedToolCall = {
  callId: string;
  name: string;
  result: AIFinanceToolResult;
};
