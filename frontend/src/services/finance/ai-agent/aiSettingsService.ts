"use client";

import { supabase } from "@/src/lib/supabase";
import type { AIFinanceAISettings } from "./aiPromptTypes";
import {
  DEFAULT_AI_FINANCE_SETTINGS,
  maskAIFinanceApiKey,
  normalizeAIFinanceSettings,
} from "./aiSettings";

type AIProvider = "openai" | "local";

type AIUserSettingsRow = {
  id: string;
  user_id: string;
  provider: AIProvider | string;
  api_key: string | null;
  model: string;
  temperature: number | string;
  max_tokens: number;
  fallback_local: boolean;
  no_fabrication: boolean;
  send_finance_context: boolean;
  send_rule_insights: boolean;
  created_at?: string;
  updated_at?: string;
};

type AIUserSettingsUpsert = {
  user_id: string;
  provider: AIProvider;
  api_key?: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  fallback_local: boolean;
  no_fabrication: boolean;
  send_finance_context: boolean;
  send_rule_insights: boolean;
  updated_at: string;
};

type AIUserSettingsUpdate = {
  api_key?: string | null;
  updated_at: string;
};

export type AIFinanceSettingsDbResult = {
  settings: AIFinanceAISettings;
  hasStoredApiKey: boolean;
  maskedApiKey: string;
  updatedAt?: string;
};

export type SaveAIFinanceSettingsDbInput = Omit<
  AIFinanceAISettings,
  "apiKey"
> & {
  apiKey?: string;
};

function normalizeProvider(provider: unknown): AIProvider {
  return provider === "local" ? "local" : "openai";
}

function getDefaultDbResult(): AIFinanceSettingsDbResult {
  return {
    settings: DEFAULT_AI_FINANCE_SETTINGS,
    hasStoredApiKey: false,
    maskedApiKey: "",
  };
}

function rowToSettings(
  row: AIUserSettingsRow | null,
): AIFinanceSettingsDbResult {
  if (!row) return getDefaultDbResult();

  const apiKey = row.api_key ?? "";

  return {
    settings: normalizeAIFinanceSettings({
      provider: normalizeProvider(row.provider),
      apiKey,
      model: row.model,
      temperature: Number(row.temperature),
      maxTokens: row.max_tokens,
      fallbackLocal: row.fallback_local,
      noFabrication: row.no_fabrication,
      sendFinanceContext: row.send_finance_context,
      sendRuleInsights: row.send_rule_insights,
    }),
    hasStoredApiKey: Boolean(apiKey),
    maskedApiKey: maskAIFinanceApiKey(apiKey),
    updatedAt: row.updated_at,
  };
}

export async function getAIFinanceSettingsFromDb(
  userId: string | undefined | null,
): Promise<AIFinanceSettingsDbResult> {
  if (!userId) return getDefaultDbResult();

  const { data, error } = await supabase
    .from("ai_user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return rowToSettings(data as AIUserSettingsRow | null);
}

export async function saveAIFinanceSettingsToDb(
  userId: string,
  input: SaveAIFinanceSettingsDbInput,
): Promise<AIFinanceSettingsDbResult> {
  const normalized = normalizeAIFinanceSettings({
    ...input,
    apiKey: input.apiKey ?? "",
  });
  const trimmedApiKey = input.apiKey?.trim();

  const payload: AIUserSettingsUpsert = {
    user_id: userId,
    provider: normalizeProvider(normalized.provider),
    model: normalized.model,
    temperature: normalized.temperature,
    max_tokens: normalized.maxTokens,
    fallback_local: normalized.fallbackLocal,
    no_fabrication: normalized.noFabrication,
    send_finance_context: normalized.sendFinanceContext,
    send_rule_insights: normalized.sendRuleInsights,
    updated_at: new Date().toISOString(),
  };

  // Empty API key means "keep existing key".
  // Use clearAIFinanceApiKeyInDb when the user explicitly wants to remove it.
  if (trimmedApiKey) {
    payload.api_key = trimmedApiKey;
  }

  const { data, error } = await supabase
    .from("ai_user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return rowToSettings(data as AIUserSettingsRow);
}

export async function clearAIFinanceApiKeyInDb(userId: string): Promise<void> {
  const payload: AIUserSettingsUpdate = {
    api_key: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("ai_user_settings")
    .update(payload)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function removeOpenAIApiKey(userId: string): Promise<void> {
  return clearAIFinanceApiKeyInDb(userId);
}
