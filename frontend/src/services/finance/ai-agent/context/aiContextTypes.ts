import type { AIFinanceCapabilityResolution } from "./aiCapabilityResolver.server";
import type { AIFinanceDataRequirement } from "./aiDataRequirementResolver.server";
import type { AIWriteIntentResolution } from "./aiWriteIntentResolver.server";

export type AIFinanceContextDomain =
  | "overview"
  | "transactions"
  | "budgets"
  | "goals"
  | "wallets"
  | "debts"
  | "investments"
  | "cashflow"
  | "health";

export type AIFinanceContextIntent = {
  domains: AIFinanceContextDomain[];
  action: "read" | "write" | "mixed";
  dateRange: {
    from: string;
    to: string;
    label: string;
  };
  entities: string[];
  needsRecentTransactions: boolean;
};

export type AIFinanceRelevantContext = {
  generatedAt: string;
  timezone: string;
  currency: string;
  intent: AIFinanceContextIntent;
  capabilityResolution: AIFinanceCapabilityResolution;
  dataRequirement: AIFinanceDataRequirement;
  writeIntent: AIWriteIntentResolution;
  snapshot: Record<string, unknown>;
  limits: {
    maxRowsPerDomain: number;
    maxRecentTransactions: number;
  };
  diagnostics: {
    loadedDomains: AIFinanceContextDomain[];
    truncated: boolean;
    estimatedCharacters: number;
  };
};
