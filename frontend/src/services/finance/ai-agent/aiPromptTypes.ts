import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";
import type { AIFinanceChatAction, AIFinanceChatIntent } from "./aiChatTypes";

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
  source: "openai" | "local" | "fallback";
  confidence: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  model?: string;
  generatedAt: string;
  actions: AIFinanceChatAction[];
};
