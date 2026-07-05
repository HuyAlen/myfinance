import type { AIFinanceContext } from "./aiFinanceContext";
import type { AIFinanceRuleInsight } from "./aiFinanceRules";

export type AIFinanceChatIntent =
  | "overview"
  | "budget"
  | "cashflow"
  | "spending"
  | "goal"
  | "wallet"
  | "debt"
  | "investment"
  | "health"
  | "alert"
  | "unknown";

export type AIFinanceChatIntentScore = {
  intent: AIFinanceChatIntent;
  score: number;
  matchedKeywords: string[];
};

export type AIFinanceChatResponseSection = {
  title: "Tổng quan" | "Phân tích" | "Gợi ý";
  content: string[];
};

export type AIFinanceChatResponseParts = {
  overview: string[];
  analysis: string[];
  suggestions: string[];
};

export type AIFinanceChatResponse = {
  answer: string;
  intent: AIFinanceChatIntent;
  intentScores: AIFinanceChatIntentScore[];
  selectedInsights: AIFinanceRuleInsight[];
  generatedAt: string;
  hasEnoughData: boolean;
};

export type BuildAIFinanceChatResponseInput = {
  question: string;
  context: AIFinanceContext | null;
  maxInsights?: number;
};

export type AIFinanceChatEngineInput = BuildAIFinanceChatResponseInput;

export type AIFinanceChatEngine = {
  ask: (input: AIFinanceChatEngineInput) => AIFinanceChatResponse;
};
