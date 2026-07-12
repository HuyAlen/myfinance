import type { AIPendingActionContinuationDirective } from "./aiPendingActionContinuationTypes";

export function buildPendingActionContinuationContext(input: {
  question: string;
  directive: AIPendingActionContinuationDirective;
}) {
  if (!input.directive.matched) return input.question;

  const rules = [
    "PENDING_ACTION_CONTINUATION:",
    `mode=${input.directive.mode}`,
    `source=${input.directive.source}`,
    `reason=${input.directive.reason}`,
    "The current user message must be interpreted in the context of the immediately preceding action request.",
    "Do not reinterpret a compact field-value reply as a read-only finance question.",
    "Merge newly supplied values with previously collected values.",
    "Never execute a write action directly; always create or update a confirmation-required pending action.",
  ];

  if (input.directive.toolName) {
    rules.push(`lockedTool=${input.directive.toolName}`);
    rules.push(
      `existingArguments=${JSON.stringify(input.directive.existingArguments ?? {})}`,
    );
    rules.push(
      "The execution plan may use only the locked write tool. Return the complete merged argument object, not only changed fields.",
    );
  } else {
    rules.push(
      "Preserve the prior action objective from RECENT_CONVERSATION and use the matching write tool when enough information is available.",
    );
  }

  return [rules.join("\n"), "", "CURRENT_USER_MESSAGE:", input.question].join(
    "\n",
  );
}

export function pendingActionContinuationAnswer(
  directive: AIPendingActionContinuationDirective,
) {
  if (directive.mode === "cancelled") {
    return "Đã hủy hành động đang chờ xác nhận. Tôi chưa thay đổi dữ liệu tài chính của bạn.";
  }

  if (directive.mode === "confirm_requested") {
    return "Hành động đã sẵn sàng nhưng vẫn cần xác nhận bảo mật. Vui lòng kiểm tra nội dung và bấm “Xác nhận” trên thẻ hành động bên dưới.";
  }

  return null;
}
