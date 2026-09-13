import { describe, expect, it } from "vitest";
import { runAIFinancePostToolReasoning } from "./aiPostToolReasoning.server";

describe("BUDGET-AT-LIMIT-INTEGRITY-1 post-tool reasoning", () => {
  it("treats at_limit as a warning rather than a positive budget state", () => {
    const result = runAIFinancePostToolReasoning({
      steps: [
        {
          stepId: "budget-step",
          toolName: "get_budget_status",
          mode: "read",
          status: "completed",
          reason: "Inspect budget status",
          arguments: {},
          output: {
            ok: true,
            data: {
              budgets: [
                {
                  categoryName: "Nhà ở",
                  limit: 6_500_000,
                  spent: 6_500_000,
                  remaining: 0,
                  usagePercent: 100,
                  status: "at_limit",
                },
              ],
            },
          },
        },
      ],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.code).toBe("budget_risk");
    expect(result.findings[0]?.severity).toBe("warning");
  });
});
