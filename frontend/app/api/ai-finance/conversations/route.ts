import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import {
  buildConversationTitle,
  createAIConversation,
  listAIConversations,
} from "@/src/services/finance/ai-agent/server/aiConversationRepository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireAIUser(request);
    const conversations = await listAIConversations(supabase, user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Không thể tải lịch sử.",
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

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAIUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      question?: string;
    };
    const title =
      body.title?.trim() || buildConversationTitle(body.question ?? "");
    const conversation = await createAIConversation(supabase, user.id, title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Không thể tạo hội thoại.",
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
