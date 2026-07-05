import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";
import type {
  AIFinanceChatAction,
  AIFinanceChatIntent,
  AIFinanceChatResponseSource,
  AIFinanceChatUsage,
  AIFinancePromptDebug,
} from "./aiChatTypes";

export type AIFinanceProvider = "openai" | "local";

export type AIFinanceAISettings = {
  provider: AIFinanceProvider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackLocal: boolean;
  noFabrication: boolean;
  sendFinanceContext: boolean;
  sendRuleInsights: boolean;
};

export type AIFinanceChatApiRequest = {
  question: string;
  context: AIFinanceContext | null;
  settings: AIFinanceAISettings;
  maxInsights?: number;
};

export type AIFinanceOpenAIInput = {
  question: string;
  context: AIFinanceContext | null;
  insights: AIFinanceRuleInsight[];
  intent: AIFinanceChatIntent;
  settings: AIFinanceAISettings;
};

/**
 * Kept for backward compatibility with older AI-7 parsers.
 * AI-8 Native ChatGPT mode no longer asks OpenAI to return this schema.
 */
export type AIFinanceOpenAIStructuredResponse = {
  overview: string[];
  analysis: string[];
  suggestions: string[];
  confidence: number;
  dataLimitations: string[];
  actions: AIFinanceChatAction[];
};

export type AIFinanceChatApiResponse = {
  answer: string;
  source: AIFinanceChatResponseSource;
  confidence: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  model?: string;
  generatedAt: string;
  actions: AIFinanceChatAction[];
  latencyMs?: number;
  usage?: AIFinanceChatUsage;
  responseId?: string;
  promptDebug?: AIFinancePromptDebug;
};
