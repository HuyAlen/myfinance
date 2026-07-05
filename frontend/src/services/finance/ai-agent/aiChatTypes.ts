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

export type AIFinanceChatResponseSource = "local" | "openai" | "fallback";

export type AIFinanceChatMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "stopped"
  | "error";

export type AIFinanceChatActionType =
  | "open_transactions"
  | "open_budgets"
  | "open_goals"
  | "clone_budget"
  | "create_budget"
  | "create_goal"
  | "create_bill_reminder"
  | "none";

export type AIFinanceChatAction = {
  type: AIFinanceChatActionType | string;
  label: string;
  payload?: Record<string, unknown>;
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

export type AIFinanceChatUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AIFinanceStreamChunk = {
  text: string;
  done?: boolean;
};

export type AIFinanceStreamHandlers = {
  onStart?: () => void;
  onChunk?: (chunk: AIFinanceStreamChunk) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
};

export type AIFinancePromptDebug = {
  provider: AIFinanceChatResponseSource;
  model?: string;
  intent?: AIFinanceChatIntent;
  temperature?: number;
  maxTokens?: number;
  contextSent?: boolean;
  ruleInsightsSent?: boolean;
  insightCount?: number;
  noFabrication?: boolean;
  systemPromptPreview?: string;
  userPromptPreview?: string;
  systemPromptChars?: number;
  userPromptChars?: number;
  responseId?: string;
};

export type AIFinanceChatResponse = {
  answer: string;
  intent: AIFinanceChatIntent;
  intentScores: AIFinanceChatIntentScore[];
  selectedInsights: AIFinanceRuleInsight[];
  generatedAt: string;
  hasEnoughData: boolean;
  source?: AIFinanceChatResponseSource;
  confidence?: number;
  actions?: AIFinanceChatAction[];
  fallbackUsed?: boolean;
  fallbackReason?: string;
  model?: string;
  latencyMs?: number;
  usage?: AIFinanceChatUsage;
  promptDebug?: AIFinancePromptDebug;
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
