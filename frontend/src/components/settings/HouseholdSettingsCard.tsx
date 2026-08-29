"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  History,
  House,
  Loader2,
  LogOut,
  Mail,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { useToast } from "@/src/components/ui/ToastProvider";
import type { HouseholdInvite } from "@/src/services/finance/householdService";

const ROLE_LABELS = {
  owner: "Chủ gia đình",
  member: "Thành viên",
  viewer: "Chỉ xem",
} as const;

type JoinedChoice = {
  householdId: string;
  personalHouseholdId: string;
  householdName: string;
};

export default function HouseholdSettingsCard() {
  const {
    context,
    household,
    role,
    workspaces,
    activeWorkspace,
    personalWorkspace,
    loading,
    error,
    invite,
    acceptInvite,
    declineInvite,
    switchWorkspace,
    leaveHousehold,
    revokeInvite,
    removeMember,
    changeMemberRole,
  } = useHousehold();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [joinedChoice, setJoinedChoice] = useState<JoinedChoice | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const canManage = role === "owner";
  const pendingOutgoingInvites = useMemo(
    () => context?.invites.filter((item) => item.status === "pending") ?? [],
    [context?.invites],
  );
  const incomingInvites = useMemo(
    () =>
      context?.pendingInvites?.length
        ? context.pendingInvites
        : context?.pendingInvite
          ? [context.pendingInvite]
          : [],
    [context?.pendingInvite, context?.pendingInvites],
  );

  const activeWorkspaceLabel = activeWorkspace?.isPersonal
    ? "Cá nhân của tôi"
    : activeWorkspace?.name || household?.name || "Gia đình MyFinance";
  const activeWorkspaceMeta = activeWorkspace?.isPersonal
    ? "Dữ liệu riêng của bạn"
    : activeWorkspace
      ? `${ROLE_LABELS[activeWorkspace.role]} · ${activeWorkspace.memberCount} thành viên`
      : "Chọn không gian để sử dụng";

  async function runAction(
    key: string,
    action: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    if (busyKey) return false;
    setBusyKey(key);
    try {
      await action();
      toast({ variant: "success", message: success });
      return true;
    } catch (actionError) {
      toast({
        variant: "error",
        message:
          actionError instanceof Error
            ? actionError.message
            : "Không thể cập nhật gia đình MyFinance.",
      });
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInvite() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      toast({ variant: "warning", message: "Nhập email hợp lệ để gửi lời mời." });
      return;
    }
    await runAction(
      "invite",
      async () => {
        await invite(normalizedEmail, inviteRole);
        setEmail("");
      },
      "Đã gửi lời mời trong MyFinance. Lời mời sẽ xuất hiện khi đúng tài khoản đăng nhập.",
    );
  }

  async function handleAcceptInvite(inviteItem: HouseholdInvite) {
    if (busyKey) return;
    setBusyKey(`accept:${inviteItem.id}`);
    try {
      const receipt = await acceptInvite(inviteItem.id);
      setJoinedChoice({
        householdId: receipt.householdId,
        personalHouseholdId:
          receipt.personalHouseholdId ||
          personalWorkspace?.householdId ||
          context?.personalHouseholdId ||
          "",
        householdName: inviteItem.householdName || "Gia đình được mời",
      });
      toast({
        variant: "success",
        message: "Đã tham gia gia đình. Dữ liệu cá nhân vẫn được giữ riêng.",
      });
    } catch (actionError) {
      toast({
        variant: "error",
        message:
          actionError instanceof Error
            ? actionError.message
            : "Không thể tham gia gia đình MyFinance.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSwitch(householdId: string, label: string) {
    if (!householdId || householdId === context?.activeHouseholdId) return;
    const switched = await runAction(
      `switch:${householdId}`,
      () => switchWorkspace(householdId),
      `Đã chuyển sang ${label}.`,
    );
    if (switched) window.location.reload();
  }

  async function handleLeave(householdId: string, label: string) {
    const confirmed = window.confirm(
      `Rời ${label}?\n\nBạn sẽ mất quyền truy cập dữ liệu dùng chung của gia đình. Dữ liệu gia đình không bị xóa và dữ liệu cá nhân của bạn vẫn giữ nguyên.`,
    );
    if (!confirmed) return;
    const left = await runAction(
      `leave:${householdId}`,
      () => leaveHousehold(householdId),
      "Đã rời gia đình và quay về không gian cá nhân.",
    );
    if (left) window.location.reload();
  }

  async function handleChoosePersonal() {
    if (!joinedChoice) return;
    const personalId =
      joinedChoice.personalHouseholdId || personalWorkspace?.householdId || "";
    if (!personalId) {
      toast({ variant: "error", message: "Không xác định được không gian cá nhân." });
      return;
    }
    if (personalId === context?.activeHouseholdId) {
      setJoinedChoice(null);
      toast({ variant: "success", message: "Bạn đang tiếp tục dùng dữ liệu cá nhân." });
      return;
    }
    await handleSwitch(personalId, "Cá nhân của tôi");
  }

  async function handleChooseJoinedFamily() {
    if (!joinedChoice) return;
    await handleSwitch(joinedChoice.householdId, joinedChoice.householdName);
  }

  return (
    <div id="settings-household" className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
          <Users size={16} />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-900">
            Gia đình & dữ liệu dùng chung
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Một tài khoản có thể giữ dữ liệu cá nhân riêng và đồng thời tham gia không gian tài chính gia đình.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 size={17} className="animate-spin" />
            Đang tải gia đình...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        ) : (
          <div className="space-y-5">
            {incomingInvites.map((inviteItem) => (
              <div
                key={inviteItem.id}
                className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
              >
                <div className="flex items-start gap-3">
                  <Mail size={18} className="mt-0.5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-blue-950">
                      Bạn có lời mời tham gia gia đình
                    </p>
                    <p className="mt-1 text-sm font-bold text-blue-900">
                      {inviteItem.householdName || "Gia đình MyFinance"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      Email {inviteItem.email} được mời với quyền {ROLE_LABELS[inviteItem.role]}.
                      Khi tham gia, dữ liệu cá nhân vẫn nằm riêng và bạn có thể chuyển qua lại giữa hai không gian.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAcceptInvite(inviteItem)}
                        disabled={Boolean(busyKey)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busyKey === `accept:${inviteItem.id}` ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={15} />
                        )}
                        Tham gia
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            `decline:${inviteItem.id}`,
                            () => declineInvite(inviteItem.id),
                            "Đã từ chối lời mời gia đình.",
                          )
                        }
                        disabled={Boolean(busyKey)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 disabled:opacity-50"
                      >
                        <X size={15} />
                        Từ chối
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {joinedChoice ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-emerald-950">
                      Đã tham gia {joinedChoice.householdName}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      Chọn không gian bạn muốn sử dụng ngay bây giờ. Việc chuyển không gian không gộp, sao chép hay xóa dữ liệu.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void handleChoosePersonal()}
                        disabled={Boolean(busyKey)}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-800 disabled:opacity-50"
                      >
                        <CircleUserRound size={16} />
                        Cá nhân của tôi
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleChooseJoinedFamily()}
                        disabled={Boolean(busyKey)}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        <House size={16} />
                        {joinedChoice.householdName}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Không gian tài chính
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Chuyển qua lại để xem đúng bộ dữ liệu. Dữ liệu giữa các không gian luôn tách biệt.
                </p>
              </div>

              <div className="relative mt-3">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={workspaceMenuOpen}
                  aria-label="Chọn không gian tài chính"
                  onClick={() => setWorkspaceMenuOpen((open) => !open)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                >
                  <span
                    className={[
                      "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                      activeWorkspace?.isPersonal
                        ? "bg-slate-100 text-slate-600"
                        : "bg-blue-600 text-white",
                    ].join(" ")}
                  >
                    {activeWorkspace?.isPersonal ? (
                      <CircleUserRound size={18} />
                    ) : (
                      <House size={18} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-900">
                      {activeWorkspaceLabel}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {activeWorkspaceMeta}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-600 sm:inline-flex">
                      Đang dùng
                    </span>
                    <ChevronDown
                      size={18}
                      className={[
                        "text-slate-400 transition-transform",
                        workspaceMenuOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </span>
                </button>

                {workspaceMenuOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng danh sách không gian tài chính"
                      onClick={() => setWorkspaceMenuOpen(false)}
                      className="fixed inset-0 z-[70] bg-slate-950/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                    />
                    <div
                      role="menu"
                      aria-label="Không gian tài chính"
                      className="fixed inset-x-3 bottom-3 z-[80] max-h-[70vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:max-h-[28rem] sm:rounded-2xl"
                    >
                      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
                      <div className="flex items-center justify-between gap-3 px-1 pb-2">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                            Không gian tài chính
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Chọn dữ liệu bạn muốn sử dụng.
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Đóng"
                          onClick={() => setWorkspaceMenuOpen(false)}
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 sm:hidden"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {workspaces.map((workspace) => {
                          const active = workspace.householdId === context?.activeHouseholdId;
                          const label = workspace.isPersonal ? "Cá nhân của tôi" : workspace.name;
                          const canLeave = !workspace.isPersonal && workspace.role !== "owner";
                          const meta = workspace.isPersonal
                            ? "Dữ liệu riêng của bạn"
                            : `${ROLE_LABELS[workspace.role]} · ${workspace.memberCount} thành viên`;
                          return (
                            <div
                              key={workspace.householdId}
                              className={[
                                "flex items-stretch gap-1.5 rounded-2xl border p-1.5",
                                active
                                  ? "border-blue-200 bg-blue-50"
                                  : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50",
                              ].join(" ")}
                            >
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                onClick={() => {
                                  setWorkspaceMenuOpen(false);
                                  void handleSwitch(workspace.householdId, label);
                                }}
                                disabled={Boolean(busyKey)}
                                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left disabled:opacity-50"
                              >
                                <span
                                  className={[
                                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                                    active
                                      ? "bg-blue-600 text-white"
                                      : "bg-slate-100 text-slate-500",
                                  ].join(" ")}
                                >
                                  {workspace.isPersonal ? (
                                    <CircleUserRound size={17} />
                                  ) : (
                                    <House size={17} />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-black leading-5 text-slate-800">
                                    {label}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                                    {meta}
                                  </span>
                                </span>
                                {active ? (
                                  <CheckCircle2 size={18} className="shrink-0 text-blue-600" />
                                ) : null}
                              </button>

                              {canLeave ? (
                                <button
                                  type="button"
                                  title={`Rời ${label}`}
                                  aria-label={`Rời ${label}`}
                                  disabled={Boolean(busyKey)}
                                  onClick={() => {
                                    setWorkspaceMenuOpen(false);
                                    void handleLeave(workspace.householdId, label);
                                  }}
                                  className="flex min-h-14 min-w-12 shrink-0 items-center justify-center rounded-xl text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                                >
                                  {busyKey === `leave:${workspace.householdId}` ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <LogOut size={16} />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <Link
              href="/activity"
              className="group flex min-h-16 items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/45 p-3.5 transition hover:border-blue-200 hover:bg-blue-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                <History size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-800">
                  Lịch sử hoạt động
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  Xem ai đã thay đổi dữ liệu, thời điểm và giá trị trước / sau trong không gian đang chọn.
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-blue-400 transition group-hover:translate-x-0.5"
              />
            </Link>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-800">Thành viên</p>
                  <p className="text-xs text-slate-400">
                    Thành viên của không gian đang dùng; Audit Trail vẫn ghi đúng tài khoản thực hiện thay đổi.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {context?.members.map((member) => {
                  const isOwner = member.role === "owner";
                  return (
                    <div
                      key={member.userId}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {member.email || member.userId}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {ROLE_LABELS[member.role]}
                        </p>
                      </div>
                      {canManage && !isOwner ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            disabled={Boolean(busyKey)}
                            onChange={(event) =>
                              void runAction(
                                `role:${member.userId}`,
                                () =>
                                  changeMemberRole(
                                    member.userId,
                                    event.target.value as "member" | "viewer",
                                  ),
                                "Đã cập nhật quyền thành viên.",
                              )
                            }
                            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                          >
                            <option value="member">Thành viên</option>
                            <option value="viewer">Chỉ xem</option>
                          </select>
                          <button
                            type="button"
                            title="Gỡ thành viên"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Gỡ ${member.email || "thành viên này"} khỏi gia đình?`,
                                )
                              )
                                return;
                              void runAction(
                                `remove:${member.userId}`,
                                () => removeMember(member.userId),
                                "Đã gỡ thành viên khỏi gia đình. Tài khoản đó sẽ quay về không gian cá nhân.",
                              );
                            }}
                            className="flex size-11 items-center justify-center rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <UserMinus size={15} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {canManage ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-blue-950">
                  <UserPlus size={16} /> Gửi lời mời
                </div>
                <p className="mt-1 text-xs leading-5 text-blue-700">
                  Lời mời hiển thị ngay trong MyFinance khi người đó đăng nhập bằng đúng email. Không cần xác nhận qua email và dữ liệu cá nhân của họ không bị gộp với dữ liệu gia đình.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="email@example.com"
                    className="min-h-11 min-w-0 rounded-2xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as "member" | "viewer")
                    }
                    className="min-h-11 rounded-2xl border border-blue-200 bg-white px-3 text-sm font-bold text-slate-700"
                  >
                    <option value="member">Thành viên</option>
                    <option value="viewer">Chỉ xem</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleInvite()}
                    disabled={Boolean(busyKey)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busyKey === "invite" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <UserPlus size={15} />
                    )}
                    Gửi lời mời
                  </button>
                </div>

                {pendingOutgoingInvites.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-blue-100 pt-3">
                    <p className="text-xs font-black uppercase tracking-wide text-blue-500">
                      Đang chờ
                    </p>
                    {pendingOutgoingInvites.map((inviteItem) => (
                      <div
                        key={inviteItem.id}
                        className="flex items-center justify-between gap-3 text-xs text-blue-900"
                      >
                        <span className="min-w-0 truncate font-semibold">
                          {inviteItem.email} · {ROLE_LABELS[inviteItem.role]}
                        </span>
                        <button
                          type="button"
                          title="Thu hồi lời mời"
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            void runAction(
                              `revoke:${inviteItem.id}`,
                              () => revokeInvite(inviteItem.id),
                              "Đã thu hồi lời mời.",
                            )
                          }
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-blue-500 hover:bg-blue-100 disabled:opacity-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
