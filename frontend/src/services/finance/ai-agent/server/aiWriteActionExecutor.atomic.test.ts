import { describe, expect, it, vi } from "vitest";

import { confirmAndExecutePendingAction } from "./aiWriteActionExecutor.server";
import type { AIFinanceToolContext } from "../tools/aiToolTypes";

function action(status = "completed") {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    conversation_id: null,
    tool_name: "create_goal",
    arguments: {},
    preview: {},
    status,
    result: { id: "goal-1" },
    error_message: null,
    old_value: null,
    new_value: null,
    idempotency_key: "key",
    expires_at: "2099-01-01T00:00:00.000Z",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    confirmed_by: "22222222-2222-4222-8222-222222222222",
    executed_at: "2026-01-01T00:00:01.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:01.000Z",
  };
}

function contextWithReceipt(receipt: unknown): {
  context: AIFinanceToolContext;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn().mockResolvedValue({
    data: receipt,
    error: null,
  });

  return {
    context: {
      userId: "22222222-2222-4222-8222-222222222222",
      supabase: { rpc } as never,
    },
    rpc,
  };
}

describe("AI pending action atomic executor", () => {
  it("delegates confirm+finance mutation+completion to one RPC", async () => {
    const { context, rpc } = contextWithReceipt({
      outcome: "completed",
      action: action(),
    });

    const result = await confirmAndExecutePendingAction({
      context,
      actionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.status).toBe("completed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("execute_ai_pending_action_atomic", {
      p_action_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it.each([
    ["not_found", "PENDING_ACTION_NOT_FOUND"],
    ["expired", "PENDING_ACTION_EXPIRED"],
    ["cancelled", "PENDING_ACTION_CANCELLED"],
    ["failed", "PENDING_ACTION_FAILED"],
    ["forbidden", "PENDING_ACTION_FORBIDDEN"],
    ["in_progress", "PENDING_ACTION_IN_PROGRESS"],
  ])("maps %s outcome to %s", async (outcome, expectedError) => {
    const { context } = contextWithReceipt({
      outcome,
      action: outcome === "not_found" ? null : action(outcome),
    });

    await expect(
      confirmAndExecutePendingAction({
        context,
        actionId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow(expectedError);
  });

  it("fails closed on an invalid RPC receipt", async () => {
    const { context } = contextWithReceipt({ ok: true });

    await expect(
      confirmAndExecutePendingAction({
        context,
        actionId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow("PENDING_ACTION_INVALID_RECEIPT");
  });

  it("maps the RPC unauthenticated SQLSTATE to the existing auth contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "MPA01", message: "Not authenticated" },
    });
    const context = {
      userId: "22222222-2222-4222-8222-222222222222",
      supabase: { rpc } as never,
    } satisfies AIFinanceToolContext;

    await expect(
      confirmAndExecutePendingAction({
        context,
        actionId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow("UNAUTHORIZED");
  });
});