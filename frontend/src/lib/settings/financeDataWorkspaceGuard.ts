/** SETTINGS-HOUSEHOLD-DATA-SAFETY-1: fail-closed client UX guard.
 * Server-side scoped RPCs are authoritative; this does NOT grant permission.
 */
export type BackupWorkspaceCandidate = {
  householdId: string;
  financeOwnerUserId: string;
  name: string;
  role: "owner" | "member" | "viewer";
  isActive: boolean;
};

export type BackupWorkspaceAccess = {
  allowed: boolean;
  householdId: string | null;
  workspaceName: string;
  reason: string;
};

export function resolveBackupWorkspaceAccess(
  accountId: string | null | undefined,
  workspace: BackupWorkspaceCandidate | null | undefined,
  activeHouseholdId: string | null | undefined,
  isLoading: boolean,
): BackupWorkspaceAccess {
  const workspaceName = workspace?.name?.trim() || "Không gian chưa xác định";
  const denied = (reason: string): BackupWorkspaceAccess => ({
    allowed: false,
    householdId: null,
    workspaceName,
    reason,
  });
  if (isLoading || !accountId || accountId === "local-ui-user" || !workspace || !activeHouseholdId) {
    return denied("Chưa xác minh được tài khoản và không gian tài chính.");
  }
  if (!workspace.isActive || workspace.householdId !== activeHouseholdId) {
    return denied("Không gian tài chính đã thay đổi. Vui lòng tải lại trước khi thao tác.");
  }
  if (workspace.role !== "owner" || workspace.financeOwnerUserId !== accountId) {
    return denied("Chỉ chủ sở hữu không gian tài chính được sao lưu hoặc thay thế dữ liệu.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace.householdId)) {
    return denied("ID không gian tài chính không hợp lệ.");
  }
  return {
    allowed: true,
    householdId: workspace.householdId,
    workspaceName,
    reason: "",
  };
}
