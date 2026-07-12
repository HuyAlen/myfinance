export function buildAIFinancePostToolSynthesisPrompt() {
  return [
    "Use POST_TOOL_REASONING as the authoritative analysis layer.",
    "Ground every conclusion in its findings and evidence.",
    "Do not expose internal IDs, step IDs, or tool names in the user-facing answer.",
    "If reasoning status is empty, say that no matching records were found.",
    "If reasoning status is partial, answer from successful findings and briefly mention unavailable parts.",
    "If a write action requires confirmation, never claim it has been executed.",
    "Do not recalculate or contradict deterministic findings unless the supplied evidence is internally inconsistent.",
  ].join("\n");
}
