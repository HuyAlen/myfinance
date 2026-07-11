import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import {
  getAISettings,
  saveAISettings,
  type AISettingsInput,
} from "@/src/services/finance/ai-agent/server/aiSettingsRepository";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireAIUser(request);
    const { settings } = await getAISettings(supabase, user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cannot load AI settings.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireAIUser(request);
    const payload = (await request.json()) as Partial<AISettingsInput>;

    if (payload.provider !== "openai" && payload.provider !== "local") {
      return NextResponse.json(
        { error: "Invalid AI provider." },
        { status: 400 },
      );
    }

    const settings = await saveAISettings(supabase, user.id, {
      provider: payload.provider,
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
      model: String(payload.model ?? "gpt-4.1-mini"),
      temperature: Number(payload.temperature ?? 0.2),
      maxTokens: Number(payload.maxTokens ?? 4096),
      fallbackLocal: payload.fallbackLocal !== false,
      noFabrication: payload.noFabrication !== false,
      sendFinanceContext: payload.sendFinanceContext !== false,
      sendRuleInsights: payload.sendRuleInsights !== false,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cannot save AI settings.",
      },
      { status: 500 },
    );
  }
}
