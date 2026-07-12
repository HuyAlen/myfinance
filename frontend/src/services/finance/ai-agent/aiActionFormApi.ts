import type {
  AIActionFormMetadata,
  AIActionFormOption,
  AIActionFormSchema,
} from "./action-form/aiActionFormTypes";
import type { AIPendingActionDto } from "./aiPendingActionApi";

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function getAIActionFormOptions(
  accessToken: string,
  toolName: string,
): Promise<{
  schema: AIActionFormSchema;
  options: Record<string, AIActionFormOption[]>;
}> {
  const response = await fetch(
    `/api/ai-finance/action-forms/options?toolName=${encodeURIComponent(toolName)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const payload = await readJson(response);

  if (!response.ok || payload.ok !== true) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Không thể tải dữ liệu biểu mẫu.",
    );
  }

  return {
    schema: payload.schema as AIActionFormSchema,
    options: (payload.options ?? {}) as Record<string, AIActionFormOption[]>,
  };
}

export async function prepareAIActionForm(
  accessToken: string,
  input: {
    form: AIActionFormMetadata;
    conversationId?: string | null;
    values: Record<string, unknown>;
  },
): Promise<AIPendingActionDto> {
  const response = await fetch("/api/ai-finance/action-forms/prepare", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      toolName: input.form.toolName,
      conversationId: input.conversationId ?? undefined,
      values: input.values,
    }),
  });
  const payload = await readJson(response);

  if (!response.ok || payload.ok !== true || !payload.pendingAction) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Không thể chuẩn bị hành động.",
    );
  }

  const action = payload.pendingAction as {
    id: string;
    toolName: string;
    preview: Record<string, unknown>;
    status: string;
    expiresAt: string;
  };

  return {
    id: action.id,
    tool_name: action.toolName,
    arguments: input.values,
    preview: action.preview,
    status: action.status,
    expires_at: action.expiresAt,
    result: null,
    error_message: null,
  };
}
