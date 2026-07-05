import type { AIFinanceChatAction } from "./aiChatTypes";
import type { AIFinanceOpenAIStructuredResponse } from "./aiPromptTypes";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.75;

  return Math.min(1, Math.max(0, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAIFinanceChatAction(
  value: AIFinanceChatAction | null,
): value is AIFinanceChatAction {
  return value !== null;
}

function normalizeActions(value: unknown): AIFinanceChatAction[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): AIFinanceChatAction | null => {
      if (!isRecord(item)) return null;

      const type = String(item.type ?? "").trim();
      const label = String(item.label ?? "").trim();

      if (!type || !label) return null;

      const payload = isRecord(item.payload) ? item.payload : undefined;

      return payload
        ? {
            type,
            label,
            payload,
          }
        : {
            type,
            label,
          };
    })
    .filter(isAIFinanceChatAction)
    .slice(0, 4);
}

export function composeOpenAIFinanceAnswer(
  parsed: AIFinanceOpenAIStructuredResponse,
) {
  const overview = parsed.overview.length
    ? parsed.overview
    : ["AI chưa có đủ dữ liệu để tạo tổng quan chi tiết."];

  const analysis = parsed.analysis.length
    ? parsed.analysis
    : ["Cần kiểm tra lại Finance Context và Rule Insights trước khi kết luận."];

  const suggestions = parsed.suggestions.length
    ? parsed.suggestions
    : [
        "Hãy bổ sung thêm giao dịch, ngân sách hoặc mục tiêu để AI phân tích chính xác hơn.",
      ];

  return [
    "📊 Tổng quan",
    ...overview.map((item) => `• ${item}`),
    "",
    "🔍 Phân tích",
    ...analysis.map((item) => `• ${item}`),
    "",
    "💡 Gợi ý",
    ...suggestions.map((item) => `• ${item}`),
  ].join("\n");
}

export function parseAIFinanceOpenAIJson(
  rawText: string,
): AIFinanceOpenAIStructuredResponse {
  const trimmed = rawText.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim()
    : trimmed;

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  return {
    overview: asStringArray(parsed.overview),
    analysis: asStringArray(parsed.analysis),
    suggestions: asStringArray(parsed.suggestions),
    confidence: normalizeConfidence(parsed.confidence),
    dataLimitations: asStringArray(parsed.dataLimitations),
    actions: normalizeActions(parsed.actions),
  };
}

export function extractResponsesApiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const response = payload as Record<string, unknown>;

  if (typeof response.output_text === "string") return response.output_text;

  const output = response.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;

    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (!isRecord(contentItem)) continue;

      const text = contentItem.text;
      if (typeof text === "string") chunks.push(text);
    }
  }

  return chunks.join("\n").trim();
}
