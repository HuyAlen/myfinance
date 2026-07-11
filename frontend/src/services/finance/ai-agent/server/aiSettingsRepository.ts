import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";
import { decryptAIKey, encryptAIKey } from "./aiKeyEncryption";

export type AIProviderName = "openai" | "local";
export type AIConnectionStatus =
  | "not_tested"
  | "connected"
  | "invalid"
  | "error";

export type AISettingsInput = {
  provider: AIProviderName;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackLocal: boolean;
  noFabrication: boolean;
  sendFinanceContext: boolean;
  sendRuleInsights: boolean;
};

export type PublicAISettings = Omit<AISettingsInput, "apiKey"> & {
  hasStoredApiKey: boolean;
  maskedApiKey: string;
  connectionStatus: AIConnectionStatus;
  lastTestedAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
};

type Client = SupabaseClient<Database>;
type SettingsRow = Database["public"]["Tables"]["ai_user_settings"]["Row"];

const DEFAULTS: PublicAISettings = {
  provider: "local",
  model: "gpt-4.1-mini",
  temperature: 0.2,
  maxTokens: 4096,
  fallbackLocal: true,
  noFabrication: true,
  sendFinanceContext: true,
  sendRuleInsights: true,
  hasStoredApiKey: false,
  maskedApiKey: "",
  connectionStatus: "not_tested",
  lastTestedAt: null,
  lastTestLatencyMs: null,
  lastTestError: null,
};

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function toPublicSettings(row: SettingsRow | null): PublicAISettings {
  if (!row) return DEFAULTS;

  return {
    provider: row.provider,
    model: row.model,
    temperature: Number(row.temperature),
    maxTokens: row.max_tokens,
    fallbackLocal: row.fallback_local,
    noFabrication: row.no_fabrication,
    sendFinanceContext: row.send_finance_context,
    sendRuleInsights: row.send_rule_insights,
    hasStoredApiKey: Boolean(
      row.encrypted_api_key && row.api_key_iv && row.api_key_auth_tag,
    ),
    maskedApiKey: row.api_key_hint ?? "",
    connectionStatus: row.connection_status,
    lastTestedAt: row.last_tested_at,
    lastTestLatencyMs: row.last_test_latency_ms,
    lastTestError: row.last_test_error,
  };
}

export async function getAISettings(client: Client, userId: string) {
  const { data, error } = await client
    .from("ai_user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { row: data, settings: toPublicSettings(data) };
}

export async function saveAISettings(
  client: Client,
  userId: string,
  input: AISettingsInput,
) {
  const normalizedKey = input.apiKey?.trim();
  const encrypted = normalizedKey ? encryptAIKey(normalizedKey) : null;

  const payload: Database["public"]["Tables"]["ai_user_settings"]["Insert"] = {
    user_id: userId,
    provider: input.provider,
    model: input.model.trim() || DEFAULTS.model,
    temperature: clamp(input.temperature, 0, 2, DEFAULTS.temperature),
    max_tokens: Math.round(
      clamp(input.maxTokens, 256, 32768, DEFAULTS.maxTokens),
    ),
    fallback_local: Boolean(input.fallbackLocal),
    no_fabrication: Boolean(input.noFabrication),
    send_finance_context: Boolean(input.sendFinanceContext),
    send_rule_insights: Boolean(input.sendRuleInsights),
    updated_at: new Date().toISOString(),
    connection_status: "not_tested",
    last_tested_at: null,
    last_test_latency_ms: null,
    last_test_error: null,
  };

  if (encrypted) {
    payload.encrypted_api_key = encrypted.ciphertext;
    payload.api_key_iv = encrypted.iv;
    payload.api_key_auth_tag = encrypted.authTag;
    payload.api_key_hint = encrypted.hint;
    payload.api_key = null;
  }

  const { data, error } = await client
    .from("ai_user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return toPublicSettings(data);
}

export async function clearStoredAIKey(client: Client, userId: string) {
  const { data, error } = await client
    .from("ai_user_settings")
    .update({
      api_key: null,
      encrypted_api_key: null,
      api_key_iv: null,
      api_key_auth_tag: null,
      api_key_hint: null,
      connection_status: "not_tested",
      last_tested_at: null,
      last_test_latency_ms: null,
      last_test_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return toPublicSettings(data);
}

export async function resolveStoredAIKey(client: Client, userId: string) {
  const { row } = await getAISettings(client, userId);
  if (!row) return null;
  if (!row.encrypted_api_key || !row.api_key_iv || !row.api_key_auth_tag) {
    return null;
  }

  return decryptAIKey({
    ciphertext: row.encrypted_api_key,
    iv: row.api_key_iv,
    authTag: row.api_key_auth_tag,
  });
}

export async function updateAIConnectionStatus(
  client: Client,
  userId: string,
  input: {
    status: AIConnectionStatus;
    latencyMs: number | null;
    error: string | null;
  },
) {
  const { error } = await client
    .from("ai_user_settings")
    .update({
      connection_status: input.status,
      last_tested_at: new Date().toISOString(),
      last_test_latency_ms: input.latencyMs,
      last_test_error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
