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
      writeIntent: input.context.writeIntent,
      snapshot: input.context.snapshot,
      diagnostics: input.context.diagnostics,
    },
    rules: [
      "Use writeIntent, capabilityResolution, and dataRequirement before selecting tools.",
      "When writeIntent.matched is true, select exactly writeIntent.requiredTool and do not replace it with a read tool.",
      "When writeIntent.matched is true and fields are missing, keep only values explicitly stated by the user; the write tool will render an interactive form.",
      "Never prefill write arguments from snapshot records, current budgets, current goals, examples, or arbitrary defaults.",
      "Context may resolve an ID only when the user explicitly mentioned the matching entity with high confidence.",
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
