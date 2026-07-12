import { NextResponse } from "next/server";

import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { loadAIActionFormOptions } from "@/src/services/finance/ai-agent/action-form/aiActionFormOptions.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireAIUser(request);
    const url = new URL(request.url);
    const toolName = url.searchParams.get("toolName")?.trim() ?? "";

    if (!toolName) {
      return NextResponse.json(
        { ok: false, error: "toolName is required." },
        { status: 400 },
      );
    }

    const result = await loadAIActionFormOptions({
      context: { userId: user.id, supabase },
      toolName,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load form options.";

    return NextResponse.json(
      { ok: false, error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "ACTION_FORM_NOT_SUPPORTED"
              ? 404
              : 400,
      },
    );
  }
}
