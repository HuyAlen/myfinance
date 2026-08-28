"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { useToast } from "@/src/components/ui/ToastProvider";

const ROLE_LABELS = {
  owner: "Chủ gia đình",
  member: "Thành viên",
  viewer: "Chỉ xem",
} as const;

export default function HouseholdSettingsCard() {
  const {
    context,
    household,
    role,
    loading,
    error,
    invite,
    acceptInvite,
    revokeInvite,
    removeMember,
    changeMemberRole,
  } = useHousehold();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const memberCount = context?.members.length ?? 0;
  const canManage = role === "owner";
  const pendingInvites = useMemo(
    () => context?.invites.filter((item) => item.status === "pending") ?? [],
    [context?.invites],
  );

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
      "Đã tạo lời mời. Người được mời đăng nhập bằng đúng email để tham gia.",
    );
  }

  async function handleAcceptInvite() {
    const accepted = await runAction(
      "accept",
      async () => {
        await acceptInvite();
      },
      "Đã tham gia gia đình. Đang nạp lại phạm vi dữ liệu dùng chung.",
    );
    if (accepted) window.location.reload();
  }

  return (
    <div id="settings-household" className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
          <Users size={16} />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-900">Gia đình & dữ liệu dùng chung</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Mỗi người dùng một tài khoản đăng nhập riêng nhưng cùng xem và cập nhật một bộ dữ liệu tài chính.
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
            {context?.pendingInvite ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <Mail size={18} className="mt-0.5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-blue-950">Bạn có lời mời tham gia gia đình</p>
                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      Email {context.pendingInvite.email} được mời với quyền {ROLE_LABELS[context.pendingInvite.role]}.
                      Tài khoản đang có dữ liệu tài chính riêng sẽ không được tự động gộp để tránh mất dữ liệu.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleAcceptInvite()}
                      disabled={Boolean(busyKey)}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busyKey === "accept" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      Tham gia gia đình
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Không gian hiện tại</p>
                <p className="mt-1 truncate text-base font-black text-slate-900">
                  {household?.name ?? "Gia đình MyFinance"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {memberCount} thành viên · {role ? ROLE_LABELS[role] : "Đang xác định quyền"}
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <ShieldCheck size={14} />
                Shared Finance
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-800">Thành viên</p>
                  <p className="text-xs text-slate-400">Danh tính đăng nhập riêng để bước Audit Trail xác định đúng người thay đổi.</p>
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
                        <p className="mt-0.5 text-xs text-slate-400">{ROLE_LABELS[member.role]}</p>
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
                            className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                          >
                            <option value="member">Thành viên</option>
                            <option value="viewer">Chỉ xem</option>
                          </select>
                          <button
                            type="button"
                            title="Gỡ thành viên"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              if (!window.confirm(`Gỡ ${member.email || "thành viên này"} khỏi gia đình?`)) return;
                              void runAction(
                                `remove:${member.userId}`,
                                () => removeMember(member.userId),
                                "Đã gỡ thành viên khỏi gia đình.",
                              );
                            }}
                            className="flex size-10 items-center justify-center rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
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
                  <UserPlus size={16} /> Mời thành viên
                </div>
                <p className="mt-1 text-xs leading-5 text-blue-700">
                  Người được mời cần đăng ký/đăng nhập MyFinance bằng đúng email này và xác nhận email trước khi tham gia. Lời mời được lưu trong MyFinance; hệ thống chưa tự gửi email mời. Không chia sẻ mật khẩu tài khoản hiện tại.
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
                    onChange={(event) => setInviteRole(event.target.value as "member" | "viewer")}
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
                    {busyKey === "invite" ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                    Mời
                  </button>
                </div>

                {pendingInvites.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-blue-100 pt-3">
                    <p className="text-xs font-black uppercase tracking-wide text-blue-500">Đang chờ</p>
                    {pendingInvites.map((inviteItem) => (
                      <div key={inviteItem.id} className="flex items-center justify-between gap-3 text-xs text-blue-900">
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
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-blue-500 hover:bg-blue-100 disabled:opacity-50"
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
