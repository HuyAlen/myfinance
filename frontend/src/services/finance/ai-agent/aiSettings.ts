import type { AIFinanceAISettings, AIFinanceProvider } from "./aiPromptTypes";

export const AI_SETTINGS_STORAGE_KEY = "myfinance.ai.settings";

export const DEFAULT_AI_FINANCE_SETTINGS: AIFinanceAISettings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-5.2",
  temperature: 0.2,
  maxTokens: 4096,
  fallbackLocal: true,
  noFabrication: true,
  sendFinanceContext: true,
  sendRuleInsights: true,
};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProvider(value: unknown): AIFinanceProvider {
  return value === "local" ? "local" : "openai";
}

export function normalizeAIFinanceSettings(
  value: Partial<AIFinanceAISettings> | null | undefined,
): AIFinanceAISettings {
  return {
    provider: normalizeProvider(value?.provider),
    apiKey: String(value?.apiKey ?? DEFAULT_AI_FINANCE_SETTINGS.apiKey).trim(),
    model:
      String(value?.model ?? DEFAULT_AI_FINANCE_SETTINGS.model).trim() ||
      DEFAULT_AI_FINANCE_SETTINGS.model,
    temperature: Math.min(
      2,
      Math.max(
        0,
        toNumber(value?.temperature, DEFAULT_AI_FINANCE_SETTINGS.temperature),
      ),
    ),
    maxTokens: Math.min(
      16000,
      Math.max(
        512,
        toNumber(value?.maxTokens, DEFAULT_AI_FINANCE_SETTINGS.maxTokens),
      ),
    ),
    fallbackLocal: toBoolean(
      value?.fallbackLocal,
      DEFAULT_AI_FINANCE_SETTINGS.fallbackLocal,
    ),
    noFabrication: toBoolean(
      value?.noFabrication,
      DEFAULT_AI_FINANCE_SETTINGS.noFabrication,
    ),
    sendFinanceContext: toBoolean(
      value?.sendFinanceContext,
      DEFAULT_AI_FINANCE_SETTINGS.sendFinanceContext,
    ),
    sendRuleInsights: toBoolean(
      value?.sendRuleInsights,
      DEFAULT_AI_FINANCE_SETTINGS.sendRuleInsights,
    ),
  };
}

export function maskAIFinanceApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 12) return "••••••••";
  return `${trimmed.slice(0, 7)}${"•".repeat(12)}${trimmed.slice(-4)}`;
}
