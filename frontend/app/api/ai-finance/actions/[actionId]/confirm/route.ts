import { NextResponse } from "next/server";

import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { confirmAndExecutePendingAction } from "@/src/services/finance/ai-agent/server/aiWriteActionExecutor.server";

export const runtime = "nodejs";

function statusForError(message: string) {
  if (message === "UNAUTHORIZED") return 401;
  if (message === "PENDING_ACTION_NOT_FOUND") return 404;
  if (message === "PENDING_ACTION_EXPIRED") return 409;
  if (message === "PENDING_ACTION_IN_PROGRESS") return 409;
  if (message === "PENDING_ACTION_CANCELLED") return 409;
  if (message === "PENDING_ACTION_FAILED") return 409;
  return 400;
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      actionId: string;
    }>;
  },
) {
  try {
    const { user, supabase } = await requireAIUser(request);
    const { actionId } = await context.params;

    const result = await confirmAndExecutePendingAction({
      context: {
        userId: user.id,
        supabase,
      },
      actionId,
    });

    return NextResponse.json({
      ok: true,
      action: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not confirm action.";

    console.error("[AI_CONFIRM_ACTION_FAILED]", {
      error: message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: statusForError(message) },
    );
  }
}
