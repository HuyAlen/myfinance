import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { clearStoredAIKey } from "@/src/services/finance/ai-agent/server/aiSettingsRepository";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireAIUser(request);
    const settings = await clearStoredAIKey(supabase, user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cannot delete AI API key.",
      },
      { status },
    );
  }
}
