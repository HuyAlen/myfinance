import { supabase } from "@/src/lib/supabase";

export type HouseholdRole = "owner" | "member" | "viewer";
export type HouseholdInviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired"
  | "declined";

export type HouseholdSummary = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdMember = {
  userId: string;
  email: string;
  role: HouseholdRole;
  joinedAt: string;
};

export type HouseholdInvite = {
  id: string;
  householdId: string;
  householdName: string;
  email: string;
  role: Exclude<HouseholdRole, "owner">;
  status: HouseholdInviteStatus;
  invitedBy: string;
  invitedByEmail: string;
  createdAt: string;
  expiresAt: string;
};

export type FinanceWorkspace = {
  householdId: string;
  name: string;
  ownerUserId: string;
  financeOwnerUserId: string;
  role: HouseholdRole;
  isPersonal: boolean;
  isActive: boolean;
  memberCount: number;
};

export type HouseholdContext = {
  household: HouseholdSummary;
  role: HouseholdRole;
  financeOwnerUserId: string;
  activeHouseholdId: string;
  personalHouseholdId: string;
  workspaces: FinanceWorkspace[];
  members: HouseholdMember[];
  invites: HouseholdInvite[];
  pendingInvites: HouseholdInvite[];
  pendingInvite: HouseholdInvite | null;
};

export type HouseholdInviteAcceptance = {
  householdId: string;
  activeHouseholdId: string;
  personalHouseholdId: string;
};

const LOCAL_UI_MODE =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LOCAL_UI_MODE === "true";

const LOCAL_CONTEXT: HouseholdContext = {
  household: {
    id: "local-ui-household",
    name: "Gia đình MyFinance",
    ownerUserId: "local-ui-user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  role: "owner",
  financeOwnerUserId: "local-ui-user",
  activeHouseholdId: "local-ui-household",
  personalHouseholdId: "local-ui-household",
  workspaces: [
    {
      householdId: "local-ui-household",
      name: "Gia đình MyFinance",
      ownerUserId: "local-ui-user",
      financeOwnerUserId: "local-ui-user",
      role: "owner",
      isPersonal: true,
      isActive: true,
      memberCount: 1,
    },
  ],
  members: [
    {
      userId: "local-ui-user",
      email: "local@myfinance.dev",
      role: "owner",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  invites: [],
  pendingInvites: [],
  pendingInvite: null,
};

let scopeCache:
  | { authUserId: string; financeOwnerUserId: string }
  | null = null;

export function getCachedFinanceOwnerUserId(authUserId: string): string | null {
  return scopeCache?.authUserId === authUserId
    ? scopeCache.financeOwnerUserId
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRole(value: unknown): HouseholdRole {
  return value === "owner" || value === "member" || value === "viewer"
    ? value
    : "viewer";
}

function parseInvite(value: unknown): HouseholdInvite | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const householdId = asString(value.household_id);
  const email = asString(value.email);
  const role = value.role === "viewer" ? "viewer" : "member";
  const status: HouseholdInviteStatus =
    value.status === "accepted" ||
    value.status === "revoked" ||
    value.status === "expired" ||
    value.status === "declined"
      ? value.status
      : "pending";
  if (!id || !householdId || !email) return null;
  return {
    id,
    householdId,
    householdName: asString(value.household_name),
    email,
    role,
    status,
    invitedBy: asString(value.invited_by),
    invitedByEmail: asString(value.invited_by_email),
    createdAt: asString(value.created_at),
    expiresAt: asString(value.expires_at),
  };
}

function parseWorkspace(value: unknown): FinanceWorkspace | null {
  if (!isRecord(value)) return null;
  const householdId = asString(value.household_id);
  const ownerUserId = asString(value.owner_user_id);
  const financeOwnerUserId = asString(
    value.finance_owner_user_id,
    ownerUserId,
  );
  if (!householdId || !ownerUserId || !financeOwnerUserId) return null;
  return {
    householdId,
    name: asString(value.name, "Gia đình MyFinance"),
    ownerUserId,
    financeOwnerUserId,
    role: asRole(value.role),
    isPersonal: value.is_personal === true,
    isActive: value.is_active === true,
    memberCount: Math.max(0, Math.trunc(asNumber(value.member_count))),
  };
}

function parseContext(value: unknown): HouseholdContext {
  if (!isRecord(value) || !isRecord(value.household)) {
    throw new Error("Máy chủ trả về household context không hợp lệ.");
  }
  const household = value.household;
  const id = asString(household.id);
  const ownerUserId = asString(household.owner_user_id);
  const financeOwnerUserId = asString(value.finance_owner_user_id);
  if (!id || !ownerUserId || !financeOwnerUserId) {
    throw new Error("Household context thiếu định danh bắt buộc.");
  }

  const members = Array.isArray(value.members)
    ? value.members
        .map((member): HouseholdMember | null => {
          if (!isRecord(member)) return null;
          const userId = asString(member.user_id);
          if (!userId) return null;
          return {
            userId,
            email: asString(member.email),
            role: asRole(member.role),
            joinedAt: asString(member.joined_at),
          };
        })
        .filter((member): member is HouseholdMember => member !== null)
    : [];

  const invites = Array.isArray(value.invites)
    ? value.invites
        .map(parseInvite)
        .filter((invite): invite is HouseholdInvite => invite !== null)
    : [];

  const pendingInvite = parseInvite(value.pending_invite);
  const pendingInvites = Array.isArray(value.pending_invites)
    ? value.pending_invites
        .map(parseInvite)
        .filter((invite): invite is HouseholdInvite => invite !== null)
    : pendingInvite
      ? [pendingInvite]
      : [];

  const activeHouseholdId = asString(value.active_household_id, id);
  const personalHouseholdId = asString(value.personal_household_id);
  const parsedWorkspaces = Array.isArray(value.workspaces)
    ? value.workspaces
        .map(parseWorkspace)
        .filter((workspace): workspace is FinanceWorkspace => workspace !== null)
    : [];
  const workspaces =
    parsedWorkspaces.length > 0
      ? parsedWorkspaces
      : [
          {
            householdId: id,
            name: asString(household.name, "Gia đình MyFinance"),
            ownerUserId,
            financeOwnerUserId,
            role: asRole(value.role),
            isPersonal:
              personalHouseholdId === id ||
              (!personalHouseholdId && asRole(value.role) === "owner"),
            isActive: true,
            memberCount: members.length,
          },
        ];

  return {
    household: {
      id,
      name: asString(household.name, "Gia đình MyFinance"),
      ownerUserId,
      createdAt: asString(household.created_at),
      updatedAt: asString(household.updated_at),
    },
    role: asRole(value.role),
    financeOwnerUserId,
    activeHouseholdId,
    personalHouseholdId:
      personalHouseholdId ||
      workspaces.find((workspace) => workspace.isPersonal)?.householdId ||
      id,
    workspaces,
    members,
    invites,
    pendingInvites,
    pendingInvite: pendingInvite ?? pendingInvites[0] ?? null,
  };
}

function mapHouseholdError(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "MFH01":
      return "Không có phiên đăng nhập. Vui lòng đăng nhập lại.";
    case "MFH02":
      return "Không tìm thấy không gian tài chính dùng chung.";
    case "MFH03":
      return "Bạn không có quyền thực hiện thao tác này trong gia đình.";
    case "MFH04":
      return "Chỉ chủ gia đình mới có thể thực hiện thao tác này.";
    case "MFH05":
      return "Email mời không hợp lệ.";
    case "MFH06":
      return "Tài khoản này đã là thành viên của gia đình.";
    case "MFH07":
      return "Không tìm thấy lời mời đang chờ cho tài khoản này.";
    case "MFH08":
      return "Hai không gian tài chính độc lập không được tự động gộp.";
    case "MFH09":
      return "Không thể thay đổi hoặc xóa chủ gia đình ở giai đoạn này.";
    case "MFH10":
      return "Vui lòng xác nhận email của tài khoản trước khi tham gia gia đình.";
    case "MFH11":
      return "Không gian tài chính này không còn khả dụng cho tài khoản của bạn.";
    case "MFH12":
      return "Không thể rời không gian cá nhân hoặc không gian mà bạn đang là chủ sở hữu.";
    default:
      return error.message || "Không thể cập nhật gia đình MyFinance.";
  }
}

export function invalidateFinanceScopeCache() {
  scopeCache = null;
}

export async function getFinanceOwnerUserId(): Promise<string | null> {
  if (LOCAL_UI_MODE) return LOCAL_CONTEXT.financeOwnerUserId;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUserId = session?.user?.id ?? null;
  if (!authUserId) {
    scopeCache = null;
    return null;
  }
  if (scopeCache?.authUserId === authUserId) {
    return scopeCache.financeOwnerUserId;
  }
  const { data, error } = await supabase.rpc(
    "get_finance_scope_owner_user_id",
  );
  if (error) {
    console.error("[householdService] getFinanceOwnerUserId:", error.message);
    throw new Error(mapHouseholdError(error));
  }
  if (typeof data !== "string" || !data) {
    throw new Error("Không xác định được phạm vi dữ liệu tài chính hiện tại.");
  }

  scopeCache = { authUserId, financeOwnerUserId: data };
  return data;
}

export async function getHouseholdContext(): Promise<HouseholdContext> {
  if (LOCAL_UI_MODE) return LOCAL_CONTEXT;
  const {
    data: { session: sessionBefore },
  } = await supabase.auth.getSession();
  const authUserId = sessionBefore?.user?.id ?? null;
  if (!authUserId) {
    invalidateFinanceScopeCache();
    throw new Error("Không có phiên đăng nhập. Vui lòng đăng nhập lại.");
  }
  const { data, error } = await supabase.rpc("get_current_household_context");
  if (error) {
    console.error("[householdService] getHouseholdContext:", error.message);
    throw new Error(mapHouseholdError(error));
  }
  const context = parseContext(data);
  const {
    data: { session: sessionAfter },
  } = await supabase.auth.getSession();
  if (sessionAfter?.user?.id !== authUserId) {
    invalidateFinanceScopeCache();
    throw new Error("Phiên đăng nhập đã thay đổi. Đang nạp lại không gian tài chính.");
  }

  scopeCache = {
    authUserId,
    financeOwnerUserId: context.financeOwnerUserId,
  };
  return context;
}

export async function createHouseholdInvite(
  email: string,
  role: "member" | "viewer",
): Promise<HouseholdInvite> {
  const { data, error } = await supabase.rpc("create_household_invite", {
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(mapHouseholdError(error));
  const invite = parseInvite(data);
  if (!invite) throw new Error("Máy chủ chưa xác nhận lời mời gia đình.");
  return invite;
}

function parseAcceptance(data: unknown): HouseholdInviteAcceptance {
  if (!isRecord(data) || data.accepted !== true) {
    throw new Error("Máy chủ chưa xác nhận việc tham gia gia đình.");
  }
  const householdId = asString(data.household_id);
  const activeHouseholdId = asString(data.active_household_id);
  const personalHouseholdId = asString(data.personal_household_id);
  if (!householdId) {
    throw new Error("Máy chủ chưa trả về không gian gia đình vừa tham gia.");
  }
  return {
    householdId,
    activeHouseholdId,
    personalHouseholdId,
  };
}

export async function acceptHouseholdInvite(
  inviteId: string,
): Promise<HouseholdInviteAcceptance> {
  const { data, error } = await supabase.rpc("accept_household_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  const receipt = parseAcceptance(data);
  invalidateFinanceScopeCache();
  return receipt;
}

export async function acceptCurrentHouseholdInvite(): Promise<HouseholdInviteAcceptance> {
  const { data, error } = await supabase.rpc("accept_current_household_invite");
  if (error) throw new Error(mapHouseholdError(error));
  const receipt = parseAcceptance(data);
  invalidateFinanceScopeCache();
  return receipt;
}

export async function declineHouseholdInvite(inviteId: string): Promise<void> {
  const { data, error } = await supabase.rpc("decline_household_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.declined !== true) {
    throw new Error("Máy chủ chưa xác nhận việc từ chối lời mời.");
  }
}

export async function switchFinanceWorkspace(householdId: string): Promise<void> {
  const { data, error } = await supabase.rpc("switch_finance_workspace", {
    p_household_id: householdId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.switched !== true) {
    throw new Error("Máy chủ chưa xác nhận không gian tài chính mới.");
  }
  invalidateFinanceScopeCache();
}

export async function leaveHousehold(householdId: string): Promise<void> {
  const { data, error } = await supabase.rpc("leave_household", {
    p_household_id: householdId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.left !== true) {
    throw new Error("Máy chủ chưa xác nhận việc rời gia đình.");
  }
  invalidateFinanceScopeCache();
}

export async function revokeHouseholdInvite(inviteId: string): Promise<void> {
  const { data, error } = await supabase.rpc("revoke_household_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.revoked !== true) {
    throw new Error("Máy chủ chưa xác nhận việc thu hồi lời mời.");
  }
}

export async function removeHouseholdMember(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("remove_household_member", {
    p_user_id: userId,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.removed !== true) {
    throw new Error("Máy chủ chưa xác nhận việc gỡ thành viên.");
  }
}

export async function setHouseholdMemberRole(
  userId: string,
  role: "member" | "viewer",
): Promise<void> {
  const { data, error } = await supabase.rpc("set_household_member_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.updated !== true) {
    throw new Error("Máy chủ chưa xác nhận quyền thành viên.");
  }
}

export async function renameCurrentHousehold(name: string): Promise<void> {
  const { data, error } = await supabase.rpc("rename_current_household", {
    p_name: name,
  });
  if (error) throw new Error(mapHouseholdError(error));
  if (!isRecord(data) || data.updated !== true) {
    throw new Error("Máy chủ chưa xác nhận tên gia đình mới.");
  }
}
