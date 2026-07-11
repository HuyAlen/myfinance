import type { AIPendingActionCardData } from "@/src/components/ai-agent/AIPendingActionCard";

export type AIToolCallMetadata = {
  name: string;
  ok: boolean;
  error?: string;
};

export type SecureAIChatResponse = {
  answer: string;
  source: "openai" | "local" | "fallback";
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  conversationId?: string;
  agentSteps?: number;
  toolCalls?: AIToolCallMetadata[];
  pendingActions?: AIPendingActionCardData[];
  latencyMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};
