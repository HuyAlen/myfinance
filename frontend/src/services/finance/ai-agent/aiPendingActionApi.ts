export type AIPendingActionDto = {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: string;
  expires_at: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
};

async function postAction(
  accessToken: string,
  actionId: string,
  action: "confirm" | "cancel",
) {
  const response = await fetch(
    `/api/ai-finance/actions/${encodeURIComponent(actionId)}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    action?: AIPendingActionDto;
    error?: string;
  };

  if (!response.ok || !payload.ok || !payload.action) {
    throw new Error(payload.error ?? `Could not ${action} action.`);
  }

  return payload.action;
}

export function confirmAIPendingAction(accessToken: string, actionId: string) {
  return postAction(accessToken, actionId, "confirm");
}

export function cancelAIPendingAction(accessToken: string, actionId: string) {
  return postAction(accessToken, actionId, "cancel");
}
