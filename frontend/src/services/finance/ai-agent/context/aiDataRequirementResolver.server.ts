import {
  AI_FINANCE_CAPABILITY_DEFINITIONS,
  type AIFinanceAnalysisOperation,
  type AIFinanceCapability,
} from "./aiFinanceCapabilities";
import type { AIFinanceCapabilityResolution } from "./aiCapabilityResolver.server";

export type AIFinanceDataRequirement = {
  capabilities: AIFinanceCapability[];
  requiredData: string[];
  operations: AIFinanceAnalysisOperation[];
  preferredTools: string[];
  requiresClarification: boolean;
  clarificationQuestion?: string;
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN");
}

export function resolveAIFinanceDataRequirements(input: {
  question: string;
  capabilityResolution: AIFinanceCapabilityResolution;
}): AIFinanceDataRequirement {
  const selected = input.capabilityResolution.matches
    .filter((match, index) => index === 0 || match.score >= 6)
    .map((match) => match.capability);
  const capabilities =
    selected.length > 0
      ? unique(selected)
      : [input.capabilityResolution.primary];
  const definitions = capabilities.map(
    (capability) => AI_FINANCE_CAPABILITY_DEFINITIONS[capability],
  );
  const text = normalize(input.question);

  let requiresClarification = false;
  let clarificationQuestion: string | undefined;

  if (
    capabilities.includes("period_comparison") &&
    !/(thang|tuan|quy|nam|month|week|quarter|year|hom nay|hom qua)/.test(text)
  ) {
    requiresClarification = true;
    clarificationQuestion =
      "Bạn muốn so sánh khoảng thời gian nào, ví dụ tháng này với tháng trước?";
  }

  if (
    capabilities.includes("scenario_analysis") &&
    !/(\d|trieu|ty|million|billion)/.test(text)
  ) {
    requiresClarification = true;
    clarificationQuestion =
      "Bạn muốn mô phỏng kịch bản với số tiền hoặc thời hạn cụ thể nào?";
  }

  return {
    capabilities,
    requiredData: unique(definitions.flatMap((item) => item.requiredData)),
    operations: unique(definitions.flatMap((item) => item.operations)),
    preferredTools: unique([
      ...input.capabilityResolution.preferredTools,
      ...definitions.flatMap((item) => item.preferredTools),
    ]),
    requiresClarification,
    clarificationQuestion,
  };
}
