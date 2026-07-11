import { NextResponse } from "next/server";
import { requireAIUser } from "@/src/services/finance/ai-agent/server/aiServerAuth";
import {
  getAISettings,
  resolveStoredAIKey,
  updateAIConnectionStatus,
} from "@/src/services/finance/ai-agent/server/aiSettingsRepository";

export const runtime = "nodejs";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAIUser(request);
    const { settings } = await getAISettings(supabase, user.id);

    if (settings.provider === "local") {
      await updateAIConnectionStatus(supabase, user.id, {
        status: "connected",
        latencyMs: 0,
        error: null,
      });
      return NextResponse.json({
        success: true,
        provider: "local",
        latencyMs: 0,
      });
    }

    const apiKey = await resolveStoredAIKey(supabase, user.id);
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI_API_KEY_MISSING" },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        input: "Reply with OK only.",
        max_output_tokens: 8,
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const status =
        response.status === 401 || response.status === 403
          ? "invalid"
          : "error";
      await updateAIConnectionStatus(supabase, user.id, {
        status,
        latencyMs,
        error: text.slice(0, 500) || `OpenAI error ${response.status}`,
      });
      return NextResponse.json(
        { error: `OpenAI request failed (${response.status}).` },
        { status: response.status },
      );
    }

    await updateAIConnectionStatus(supabase, user.id, {
      status: "connected",
      latencyMs,
      error: null,
    });

    return NextResponse.json({
      success: true,
      provider: "openai",
      model: settings.model,
      latencyMs,
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cannot test AI connection.",
      },
      { status },
    );
  }
}
