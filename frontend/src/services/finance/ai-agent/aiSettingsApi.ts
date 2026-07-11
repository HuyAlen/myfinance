export type AIProviderName = "openai" | "local";
export type AIConnectionStatus =
  | "not_tested"
  | "connected"
  | "invalid"
  | "error";

export type PublicAIFinanceSettings = {
  provider: AIProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackLocal: boolean;
  noFabrication: boolean;
  sendFinanceContext: boolean;
  sendRuleInsights: boolean;
  hasStoredApiKey: boolean;
  maskedApiKey: string;
  connectionStatus: AIConnectionStatus;
  lastTestedAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
};

export type SaveAIFinanceSettingsInput = {
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

export type TestAIFinanceConnectionResult = {
  success: true;
  provider: AIProviderName;
  model?: string;
  latencyMs: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : undefined;
    throw new Error(message || `Request failed (${response.status}).`);
  }

  if (!payload) {
    throw new Error("Server returned an empty response.");
  }

  return payload as T;
}

function authHeaders(accessToken: string) {
  if (!accessToken.trim()) {
    throw new Error("Supabase access token is missing.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function getAIFinanceSettings(
  accessToken: string,
): Promise<PublicAIFinanceSettings> {
  const response = await fetch("/api/ai-finance/settings", {
    method: "GET",
    headers: authHeaders(accessToken),
    cache: "no-store",
  });

  const payload = await readJson<{ settings: PublicAIFinanceSettings }>(
    response,
  );
  return payload.settings;
}

export async function saveAIFinanceSettings(
  accessToken: string,
  input: SaveAIFinanceSettingsInput,
): Promise<PublicAIFinanceSettings> {
  const response = await fetch("/api/ai-finance/settings", {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  const payload = await readJson<{ settings: PublicAIFinanceSettings }>(
    response,
  );
  return payload.settings;
}

export async function deleteAIFinanceApiKey(
  accessToken: string,
): Promise<PublicAIFinanceSettings> {
  const response = await fetch("/api/ai-finance/settings/key", {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  const payload = await readJson<{ settings: PublicAIFinanceSettings }>(
    response,
  );
  return payload.settings;
}

export async function testAIFinanceConnection(
  accessToken: string,
): Promise<TestAIFinanceConnectionResult> {
  const response = await fetch("/api/ai-finance/settings/test", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  });

  return readJson<TestAIFinanceConnectionResult>(response);
}
