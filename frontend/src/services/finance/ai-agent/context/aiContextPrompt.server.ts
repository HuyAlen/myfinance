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
      snapshot: input.context.snapshot,
      diagnostics: input.context.diagnostics,
    },
    rules: [
      "Use planningContext only to choose tools and resolve safe identifiers.",
      "Use finance tools as the source of truth for final calculations.",
      "Do not invent IDs that are absent from planningContext or tool results.",
      "Do not expose internal IDs unless required for a confirmation action.",
    ],
  });
}
