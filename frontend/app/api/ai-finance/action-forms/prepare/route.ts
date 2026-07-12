import { NextResponse } from "next/server";

import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { executeAIFinanceToolCall } from "@/src/services/finance/ai-agent/tools/aiToolExecutor.server";
import type { AIActionFormPrepareRequest } from "@/src/services/finance/ai-agent/action-form/aiActionFormTypes";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("values must be an object.");
  }
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAIUser(request);
    const payload =
      (await request.json()) as Partial<AIActionFormPrepareRequest>;
    const toolName =
      typeof payload.toolName === "string" ? payload.toolName.trim() : "";

    if (!toolName) {
      return NextResponse.json(
        { ok: false, error: "toolName is required." },
        { status: 400 },
      );
    }

    const values = asRecord(payload.values);
    const executed = await executeAIFinanceToolCall(
      { userId: user.id, supabase },
      {
        callId: `action_form_${Date.now()}`,
        name: toolName,
        argumentsJson: JSON.stringify(values),
      },
      {
        conversationId:
          typeof payload.conversationId === "string" &&
          payload.conversationId.trim()
            ? payload.conversationId.trim()
            : undefined,
      },
    );

    if (!executed.result.ok) {
      return NextResponse.json(
        { ok: false, error: executed.result.error ?? "Validation failed." },
        { status: 400 },
      );
    }

    const data =
      executed.result.data &&
      typeof executed.result.data === "object" &&
      !Array.isArray(executed.result.data)
        ? (executed.result.data as Record<string, unknown>)
        : null;

    if (!data || data.kind !== "confirmation_required") {
      return NextResponse.json(
        { ok: false, error: "Pending action was not created." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      pendingAction: data.pendingAction,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not prepare action.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 400 },
    );
  }
}
