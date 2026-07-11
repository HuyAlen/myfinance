import { NextResponse } from "next/server";

import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { cancelPendingAction } from "@/src/services/finance/ai-agent/server/aiWriteActionExecutor.server";

export const runtime = "nodejs";

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

    const result = await cancelPendingAction({
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
      error instanceof Error ? error.message : "Could not cancel action.";

    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "PENDING_ACTION_NOT_FOUND"
          ? 404
          : 400;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
