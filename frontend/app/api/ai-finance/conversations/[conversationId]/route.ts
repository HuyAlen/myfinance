import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import {
  deleteAIConversation,
  updateAIConversation,
} from "@/src/services/finance/ai-agent/server/aiConversationRepository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const { user, supabase } = await requireAIUser(request);
    const body = (await request.json()) as {
      title?: string;
      isPinned?: boolean;
    };
    const conversation = await updateAIConversation({
      supabase,
      userId: user.id,
      conversationId,
      title: body.title,
      isPinned: body.isPinned,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể cập nhật hội thoại.",
      },
      {
        status:
          error instanceof Error && error.message === "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const { user, supabase } = await requireAIUser(request);
    await deleteAIConversation(supabase, user.id, conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Không thể xóa hội thoại.",
      },
      {
        status:
          error instanceof Error && error.message === "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}
