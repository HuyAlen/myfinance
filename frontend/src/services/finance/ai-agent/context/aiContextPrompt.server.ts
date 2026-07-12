import type { AIFinanceRelevantContext } from "./aiContextTypes";

export function buildContextAwarePlannerQuestion(input: {
  question: string;
  context: AIFinanceRelevantContext;
}) {
  return JSON.stringify({
    userQuestion: input.question,
    planningContext: {
      generatedAt: input.context.generatedAt,
      timezone: input.context.timezone,
      currency: input.context.currency,
      intent: input.context.intent,
      capabilityResolution: input.context.capabilityResolution,
      dataRequirement: input.context.dataRequirement,
      snapshot: input.context.snapshot,
      diagnostics: input.context.diagnostics,
    },
    rules: [
      "Use capabilityResolution and dataRequirement before selecting tools.",
      "Prefer tools listed in dataRequirement.preferredTools when they can provide the required data.",
      "Use the requested analysis operations after tools return data, including sorting, ranking, min/max, comparison, and threshold detection.",
      "Do not replace a wallet detail or wallet ranking request with get_financial_summary; use get_wallets.",
      "Use planningContext only to choose tools and resolve safe identifiers.",
      "Use finance tools as the source of truth for final calculations.",
      "Do not invent IDs that are absent from planningContext or tool results.",
      "Do not expose internal IDs unless required for a confirmation action.",
    ],
  });
}
