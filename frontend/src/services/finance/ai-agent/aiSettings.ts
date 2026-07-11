export type AIFinanceProvider = "openai" | "local";

export type AIFinanceSettings = {
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

export const DEFAULT_AI_FINANCE_SETTINGS: AIFinanceSettings = {
  provider: "local",
  apiKey: "",
  model: "gpt-5.2",
  temperature: 0.2,
  maxTokens: 4096,
  fallbackLocal: true,
  noFabrication: true,
  sendFinanceContext: true,
  sendRuleInsights: true,
};

function normalizeProvider(value: unknown): AIFinanceProvider {
  return value === "openai" ? "openai" : "local";
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function normalizeAIFinanceSettings(value: unknown): AIFinanceSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AI_FINANCE_SETTINGS };
  }

  const input = value as Partial<AIFinanceSettings>;

  return {
    provider: normalizeProvider(input.provider),

    apiKey:
      typeof input.apiKey === "string"
        ? input.apiKey.trim()
        : DEFAULT_AI_FINANCE_SETTINGS.apiKey,

    model: normalizeString(input.model, DEFAULT_AI_FINANCE_SETTINGS.model),

    temperature: normalizeNumber(
      input.temperature,
      DEFAULT_AI_FINANCE_SETTINGS.temperature,
      0,
      2,
    ),

    maxTokens: Math.round(
      normalizeNumber(
        input.maxTokens,
        DEFAULT_AI_FINANCE_SETTINGS.maxTokens,
        256,
        32768,
      ),
    ),

    fallbackLocal: normalizeBoolean(
      input.fallbackLocal,
      DEFAULT_AI_FINANCE_SETTINGS.fallbackLocal,
    ),

    noFabrication: normalizeBoolean(
      input.noFabrication,
      DEFAULT_AI_FINANCE_SETTINGS.noFabrication,
    ),

    sendFinanceContext: normalizeBoolean(
      input.sendFinanceContext,
      DEFAULT_AI_FINANCE_SETTINGS.sendFinanceContext,
    ),

    sendRuleInsights: normalizeBoolean(
      input.sendRuleInsights,
      DEFAULT_AI_FINANCE_SETTINGS.sendRuleInsights,
    ),
  };
}

export function sanitizeAIFinanceSettings(settings: AIFinanceSettings): Omit<
  AIFinanceSettings,
  "apiKey"
> & {
  apiKey: "";
} {
  return {
    ...settings,
    apiKey: "",
  };
}
