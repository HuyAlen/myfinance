import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import { listAIMessages } from "@/src/services/finance/ai-agent/server/aiConversationRepository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const { user, supabase } = await requireAIUser(request);
    const messages = await listAIMessages(supabase, user.id, conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể tải tin nhắn.";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "CONVERSATION_NOT_FOUND"
              ? 404
              : 500,
      },
    );
  }
}
