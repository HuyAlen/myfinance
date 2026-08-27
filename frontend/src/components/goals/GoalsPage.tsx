"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { supabase } from "@/src/lib/supabase";
import { useQuickActionCreateIntent } from "@/src/lib/navigation/quickActionIntent";
import { parseFocusId } from "@/src/lib/navigation/financeNavigation";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import {
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import type { Goal, SavingAccount, Transaction } from "@/src/types/finance";

import {
  addGoal,
  deleteGoal,
  getGoals,
  getTransactions,
  updateGoal,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getGoalEffectiveCurrentAmount,
  getGoalLinkedSavingAmount,
} from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  savingCategoryIds: string[];
};

const emptyForm: FormState = {
  name: "",
  targetAmount: "",
  currentAmount: "",
  savingCategoryIds: [],
};

type GoalTier = "completed" | "near" | "progress" | "started";

function getTier(pct: number): GoalTier {
  if (pct >= 100) return "completed";
  if (pct >= 75) return "near";
  if (pct >= 25) return "progress";
  return "started";
}

const TIER_STYLE: Record<
  GoalTier,
  {
    badge: string;
    bar: string;
    border: string;
    iconGrad: string;
    label: string;
  }
> = {
  completed: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    bar: "#10b981",
    border: "border-emerald-100",
    iconGrad: "from-emerald-500 to-teal-400",
    label: "Hoàn thành",
  },
  near: {
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    bar: "#2563eb",
    border: "border-blue-100",
    iconGrad: "from-blue-500 to-cyan-500",
    label: "Gần đích",
  },
  progress: {
    badge: "bg-cyan-100 text-cyan-700 border-cyan-200",
    bar: "#06b6d4",
    border: "border-cyan-100",
    iconGrad: "from-cyan-500 to-blue-400",
    label: "Đang thực hiện",
  },
  started: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    bar: "#f59e0b",
    border: "border-amber-100",
    iconGrad: "from-amber-400 to-orange-500",
    label: "Mới bắt đầu",
  },
};

type SavingRow = {
  id: string;
  name: string;
  type: SavingAccount["type"];
  balance: number | string | null;
  interest_rate: number | string | null;
  maturity_date: string | null;
  notes: string | null;
};

const mapSavingRowToSavingAccount = (row: SavingRow): SavingAccount => ({
  id: row.id,
  name: row.name,
  type: row.type,
  balance: Number(row.balance ?? 0),
  interestRate:
    row.interest_rate === null || row.interest_rate === undefined
      ? undefined
      : Number(row.interest_rate),
  maturityDate: row.maturity_date ?? undefined,
  notes: row.notes ?? undefined,
});

const normalizeGoalText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

const getSupabaseSavingAmountForGoal = (
  goal: Goal,
  savings: SavingAccount[],
) => {
  const linkedSavingIds = new Set(goal.savingCategoryIds ?? []);
  const selectedSavingsAmount = savings.reduce((sum, saving) => {
    if (!linkedSavingIds.has(saving.id)) return sum;
    return sum + saving.balance;
  }, 0);

  if (selectedSavingsAmount > 0) {
    return selectedSavingsAmount;
  }

  const goalName = normalizeGoalText(goal.name);

  return savings.reduce((sum, saving) => {
    const savingName = normalizeGoalText(saving.name);
    const isEmergencyGoal =
      goalName.includes("khan cap") ||
      goalName.includes("emergency") ||
      goalName.includes("du phong");
    const isEmergencySaving = saving.type === "emergency_fund";
    const isNameMatched =
      goalName.length > 0 &&
      savingName.length > 0 &&
      (goalName.includes(savingName) || savingName.includes(goalName));

    if ((isEmergencyGoal && isEmergencySaving) || isNameMatched) {
      return sum + saving.balance;
    }

    return sum;
  }, 0);
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  // FINANCE-DATA-1B: "Chưa có mục tiêu nào" must not render before a load
  // has actually SUCCEEDED — an initial read failure (getGoals now
  // rejects instead of silently resolving []) would otherwise look
  // identical to a genuinely goal-less account.
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalsLoadError, setGoalsLoadError] = useState<string | null>(null);
  const [savings, setSavings] = useState<SavingAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  // FINANCE-DATA-1: getGoals/getTransactions now reject on a genuine query
  // failure instead of silently resolving to [] — caught here so every
  // caller (mount, realtime, post-submit/post-delete refresh via
  // handleSubmit/handleDelete below) never sees an unhandled rejection and
  // the form/confirm dialog can still close after a mutation that itself
  // already succeeded. State setters only run after a successful resolve,
  // so a caught failure leaves the previously-loaded goals/transactions on
  // screen.
  async function reloadData() {
    try {
      const [nextGoals, nextTransactions, savingRows] = await Promise.all([
        getGoals(),
        getTransactions(),
        supabase
          .from("savings")
          .select("id,name,type,balance,interest_rate,maturity_date,notes")
          .order("created_at", { ascending: false }),
      ]);

      // FINANCE-DATA-1C: this raw "savings" read is a mandatory dependency
      // of this load cycle too — selectedSavingsAmount/selectedTotal treat
      // `savings` as validated data, so a failed read here must not be
      // treated as a successful load (which previously left `savings` at
      // its stale/initial [] while clearing goalsLoadError to null).
      if (savingRows.error) {
        throw savingRows.error;
      }

      setGoals(nextGoals);
      setTransactions(nextTransactions);
      setSavings(
        ((savingRows.data ?? []) as SavingRow[]).map(
          mapSavingRowToSavingAccount,
        ),
      );
      setGoalsLoadError(null);
    } catch (error) {
      console.error("[GoalsPage] reloadData failed:", error);
      setGoalsLoadError("Không thể tải dữ liệu mục tiêu. Vui lòng tải lại trang.");
    } finally {
      setIsLoadingGoals(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  useRealtimeTable(["goals", "transactions"], reloadData);

  // ── NEW: per-goal analytics ───────────────────────────────────────────────
  const goalMeta = useMemo(
    () =>
      goals.map((g) => {
        const linkedSavingAmount = getGoalLinkedSavingAmount({
          goal: g,
          transactions,
        });
        const supabaseSavingAmount = getSupabaseSavingAmountForGoal(g, savings);
        const baseEffectiveCurrentAmount = getGoalEffectiveCurrentAmount({
          goal: g,
          transactions,
        });
        const effectiveCurrentAmount = Math.max(
          baseEffectiveCurrentAmount,
          g.currentAmount + supabaseSavingAmount,
        );
        const pct =
          g.targetAmount > 0
            ? Math.round((effectiveCurrentAmount / g.targetAmount) * 100)
            : 0;
        const tier = getTier(pct);
        const remaining = Math.max(g.targetAmount - effectiveCurrentAmount, 0);
        const suggestedMonthly =
          remaining > 0 ? Math.ceil(remaining / 12 / 1000) * 1000 : 0;
        const monthsLeft =
          suggestedMonthly > 0 ? Math.ceil(remaining / suggestedMonthly) : 0;
        return {
          ...g,
          pct,
          tier,
          remaining,
          linkedSavingAmount,
          supabaseSavingAmount,
          effectiveCurrentAmount,
          suggestedMonthly,
          monthsLeft,
        };
      }),
    [goals, transactions, savings],
  );

  // ── PRESERVED: summary ───────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalTarget = goalMeta.reduce((s, g) => s + g.targetAmount, 0);
    const totalCurrent = goalMeta.reduce(
      (s, g) => s + g.effectiveCurrentAmount,
      0,
    );
    const percent =
      totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
    return {
      totalTarget,
      totalCurrent,
      remaining: Math.max(totalTarget - totalCurrent, 0),
      percent,
    };
  }, [goalMeta]);

  const totalSyncedSavings = useMemo(
    () => goalMeta.reduce((sum, goal) => sum + goal.supabaseSavingAmount, 0),
    [goalMeta],
  );

  // ── NEW: tier counts ──────────────────────────────────────────────────────
  const tierCounts = useMemo(
    () => ({
      completed: goalMeta.filter((g) => g.tier === "completed").length,
      near: goalMeta.filter((g) => g.tier === "near").length,
      progress: goalMeta.filter((g) => g.tier === "progress").length,
      started: goalMeta.filter((g) => g.tier === "started").length,
    }),
    [goalMeta],
  );

  const priorityGoals = useMemo(
    () =>
      [...goalMeta]
        .filter((goal) => goal.pct < 100)
        .sort((a, b) => {
          if (a.pct !== b.pct) return b.pct - a.pct;
          return a.remaining - b.remaining;
        })
        .slice(0, 3),
    [goalMeta],
  );

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  useQuickActionCreateIntent(openCreateForm);
  useSuppressGlobalFabsWhileOpen(isFormOpen || !!pendingAction);

  // Contextual entity focus from Dashboard/Header (?goalId=...): scroll to
  // and briefly highlight the matching card once it renders. A missing or
  // already-deleted goalId is ignored — the page just loads normally.
  const searchParams = useSearchParams();
  const focusGoalId = parseFocusId(searchParams, "goalId");
  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(
    null,
  );
  const focusedGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusGoalId || focusedGoalIdRef.current === focusGoalId) return;
    const el = document.getElementById(`goal-card-${focusGoalId}`);
    if (!el) return;

    focusedGoalIdRef.current = focusGoalId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const highlightTimer = window.setTimeout(
      () => setHighlightedGoalId(focusGoalId),
      0,
    );
    const clearTimer = window.setTimeout(() => setHighlightedGoalId(null), 2500);
    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusGoalId, goalMeta]);

  function openEditForm(goal: Goal) {
    setForm({
      id: goal.id,
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      savingCategoryIds: goal.savingCategoryIds ?? [],
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const targetAmount = Number(form.targetAmount);
    const currentAmount = Number(form.currentAmount);
    if (!form.name.trim()) {
      setSaveError("Vui lòng nhập tên mục tiêu");
      return;
    }
    if (!targetAmount || targetAmount <= 0) {
      setSaveError("Vui lòng nhập số tiền mục tiêu hợp lệ");
      return;
    }
    if (Number.isNaN(currentAmount) || currentAmount < 0) {
      setSaveError("Vui lòng nhập số tiền đã tiết kiệm hợp lệ");
      return;
    }
    const goal: Goal = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      targetAmount,
      currentAmount,
      savingCategoryIds: form.savingCategoryIds,
    };
    setSaveError(null);
    const { error } = form.id ? await updateGoal(goal) : await addGoal(goal);
    if (error) {
      setSaveError(error);
      return;
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  function handleDelete(id: string) {
    setPendingAction({
      title: "Xóa mục tiêu?",
      description:
        "Hành động này không thể hoàn tác. Mục tiêu sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteGoal(id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa mục tiêu: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa mục tiêu thành công." });
        await reloadData();
      },
    });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 overflow-x-hidden pb-24 md:space-y-6 md:pb-0">
      {/* GOALS-MOBILE-POLISH-1 · Compact Goal Hierarchy & Scroll Efficiency */}
      {/* SECTION 1 · Goal Command Center */}
      <section className="overflow-hidden rounded-3xl border border-[#DCE6EF] bg-white shadow-[0_8px_24px_rgba(54,83,107,0.07)] sm:rounded-4xl">
        <div className="bg-linear-to-br from-white via-[#F8FBFF] to-[#F1F7FC] px-3.5 py-4 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F80ED] sm:text-[11px] sm:tracking-[0.18em]">
                Goal Center
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#36536B] sm:text-4xl">
                Mục tiêu tài chính
              </h1>
              <p className="mt-1 hidden max-w-2xl text-sm text-[#61788F] sm:block">
                Theo dõi số tiền đã tích lũy, phần còn thiếu và mức đóng góp cần
                thiết cho từng mục tiêu.
              </p>
            </div>

            <button
              onClick={openCreateForm}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2F80ED] px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(47,128,237,0.20)] transition hover:bg-[#2676DE] active:scale-[.98] sm:rounded-2xl sm:px-5 sm:py-3"
            >
              <Plus size={17} />
              Thêm mục tiêu
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <KpiCard
              label="Tổng mục tiêu"
              value={String(goals.length)}
              sub={`${tierCounts.completed} hoàn thành · ${goals.length - tierCounts.completed} đang theo dõi`}
              tone="blue"
              icon={<Target size={17} />}
            />
            <KpiCard
              label="Đã tích lũy"
              value={formatVND(summary.totalCurrent)}
              sub={
                totalSyncedSavings > 0
                  ? `${formatVND(totalSyncedSavings)} đồng bộ từ tiết kiệm`
                  : "Tổng số tiền đã có"
              }
              tone="emerald"
              icon={<TrendingUp size={17} />}
            />
            <KpiCard
              label="Còn thiếu"
              value={formatVND(summary.remaining)}
              sub="Để hoàn thành tất cả mục tiêu"
              tone="rose"
              icon={<ArrowUpRight size={17} />}
            />
            <KpiCard
              label="Tiến độ chung"
              value={`${summary.percent}%`}
              sub={
                summary.percent >= 100
                  ? "Đã hoàn thành toàn bộ"
                  : "Tỷ lệ hoàn thành hiện tại"
              }
              tone="indigo"
              icon={<CheckCircle2 size={17} />}
            />
          </div>
        </div>
      </section>

      {/* SECTION 2 · Overall progress and priority */}
      {goals.length > 0 && (
        <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="rounded-3xl border border-[#DCE6EF] bg-white p-4 shadow-[0_6px_18px_rgba(54,83,107,0.06)] sm:rounded-4xl sm:p-6">
            <div className="flex items-start justify-between gap-3 sm:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8CA0B3]">
                  Tiến độ tổng thể
                </p>
                <h2 className="mt-1 text-[17px] font-black leading-6 text-[#36536B] sm:text-xl">
                  {formatVND(summary.totalCurrent)} /{" "}
                  {formatVND(summary.totalTarget)}
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#61788F] sm:text-sm">
                  Còn {formatVND(summary.remaining)} để hoàn thành toàn bộ mục
                  tiêu.
                </p>
              </div>
              <span className="shrink-0 text-3xl font-black tracking-tight text-[#2F80ED] sm:text-4xl">
                {summary.percent}%
              </span>
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#EDF3F8] sm:mt-5 sm:h-4">
              <div
                className="h-full rounded-full bg-linear-to-r from-blue-600 to-cyan-500 transition-all duration-700"
                style={{ width: `${Math.min(summary.percent, 100)}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4 sm:gap-3">
              {(["completed", "near", "progress", "started"] as GoalTier[]).map(
                (tier) => {
                  const style = TIER_STYLE[tier];
                  return (
                    <div
                      key={tier}
                      className="rounded-xl border border-[#E4ECF3] bg-[#F8FBFD] p-2.5 sm:rounded-2xl sm:p-3"
                    >
                      <p className="text-[9px] font-black uppercase tracking-wide text-[#8CA0B3] sm:text-[10px]">
                        {style.label}
                      </p>
                      <p className="mt-0.5 text-lg font-black text-[#36536B] sm:mt-1 sm:text-2xl">
                        {tierCounts[tier]}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#DCE6EF] bg-white p-4 shadow-[0_6px_18px_rgba(54,83,107,0.06)] sm:rounded-4xl sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8CA0B3]">
                Ưu tiên hiện tại
              </p>
              <h2 className="mt-1 text-base font-black text-[#36536B] sm:text-lg">
                Mục tiêu gần hoàn thành nhất
              </h2>
              <p className="mt-1 hidden text-xs leading-5 text-[#61788F] sm:block">
                Tập trung vào các mục tiêu có tiến độ cao để hoàn thành nhanh
                hơn.
              </p>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-[#DCE6EF] bg-[#F8FBFF] sm:mt-4">
              {priorityGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="border-b border-[#E4ECF3] px-3 py-2.5 last:border-b-0 sm:px-3.5 sm:py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#36536B]">
                        {goal.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#61788F] sm:text-xs">
                        Còn {formatVND(goal.remaining)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-[#2F80ED]">
                      {goal.pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[#2F80ED]"
                      style={{ width: `${Math.min(goal.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}

              {priorityGoals.length === 0 && (
                <div className="p-3 text-sm font-bold text-emerald-700">
                  Tất cả mục tiêu đã hoàn thành.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3 · Goal list */}
      <section>
        <div className="mb-3 flex flex-col gap-0.5 px-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8CA0B3]">
              Danh sách mục tiêu
            </p>
            <h2 className="mt-1 text-base font-black text-[#36536B] sm:text-lg">
              {goals.length} mục tiêu đang theo dõi
            </h2>
          </div>
          <p className="text-[11px] leading-4 text-[#61788F] sm:text-xs">
            Cập nhật số tiền đã tích lũy hoặc liên kết với khoản tiết kiệm.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {goalMeta.map((g) => {
            const s = TIER_STYLE[g.tier];
            return (
              <div
                key={g.id}
                id={`goal-card-${g.id}`}
                className={
                  "group rounded-3xl border bg-white p-4 shadow-[0_5px_16px_rgba(54,83,107,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:rounded-4xl sm:p-6 " +
                  s.border +
                  (highlightedGoalId === g.id
                    ? " ring-2 ring-blue-400 ring-offset-2"
                    : "")
                }
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <div
                      className={
                        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-sm sm:size-12 sm:rounded-2xl " +
                        s.iconGrad
                      }
                    >
                      {g.tier === "completed" ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Target size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-black text-[#36536B] sm:text-base">
                        {g.name}
                      </h3>
                      <span
                        className={
                          "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                          s.badge
                        }
                      >
                        {s.label}
                      </span>
                    </div>
                  </div>
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => openEditForm(g)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 3-col mini stats */}
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#F6F9FC] p-2.5 sm:mt-5 sm:gap-2 sm:rounded-2xl sm:p-3">
                  <div className="min-w-0 text-center">
                    <p className="text-[8.5px] font-bold uppercase tracking-wide text-[#8CA0B3] sm:text-[9px]">
                      Mục tiêu
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-black text-[#2F80ED] sm:text-xs">
                      {g.targetAmount >= 1_000_000
                        ? Math.round(g.targetAmount / 1_000_000) + "M"
                        : Math.round(g.targetAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="min-w-0 text-center">
                    <p className="text-[8.5px] font-bold uppercase tracking-wide text-[#8CA0B3] sm:text-[9px]">
                      Đã có
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-black text-emerald-600 sm:text-xs">
                      {g.effectiveCurrentAmount >= 1_000_000
                        ? Math.round(g.effectiveCurrentAmount / 1_000_000) + "M"
                        : Math.round(g.effectiveCurrentAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="min-w-0 text-center">
                    <p className="text-[8.5px] font-bold uppercase tracking-wide text-[#8CA0B3] sm:text-[9px]">
                      Còn lại
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-black text-[#61788F] sm:text-xs">
                      {g.remaining >= 1_000_000
                        ? Math.round(g.remaining / 1_000_000) + "M"
                        : Math.round(g.remaining / 1_000) + "K"}
                    </p>
                  </div>
                </div>

                {/* Large saved amount */}
                <div className="mt-3 sm:mt-4">
                  <p className="text-[9px] font-black uppercase tracking-wide text-[#8CA0B3] sm:text-[10px]">
                    Đã tích lũy
                  </p>
                  <p
                    className={
                      "mt-0.5 text-xl font-black tracking-tight sm:mt-1 sm:text-2xl " +
                      (g.tier === "completed"
                        ? "text-emerald-600"
                        : "text-[#2F80ED]")
                    }
                  >
                    {formatVND(g.effectiveCurrentAmount)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8CA0B3] sm:text-xs">
                    / {formatVND(g.targetAmount)}
                  </p>
                  {g.supabaseSavingAmount > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-cyan-600">
                      Đã đồng bộ {formatVND(g.supabaseSavingAmount)} từ Savings
                    </p>
                  )}
                  {g.linkedSavingAmount > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-600">
                      Đã tự động cộng {formatVND(g.linkedSavingAmount)} từ danh
                      mục tiết kiệm
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-3 sm:mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] sm:text-xs">
                    <span className="text-[#61788F]">Tiến độ</span>
                    <div className="flex items-center gap-1.5">
                      {g.pct >= 100 ? (
                        <ArrowUpRight size={10} className="text-emerald-500" />
                      ) : g.pct >= 75 ? (
                        <ArrowUpRight size={10} className="text-blue-500" />
                      ) : null}
                      <span
                        className={
                          "font-black " +
                          (g.tier === "completed"
                            ? "text-emerald-600"
                            : "text-slate-700")
                        }
                      >
                        {g.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#EDF3F8] sm:h-3">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: Math.min(g.pct, 100) + "%",
                        background: s.bar,
                      }}
                    />
                  </div>
                </div>

                {/* V3 forecast */}
                <div className="mt-3 rounded-xl border border-[#DCE6EF] bg-[#F7FAFE] p-2.5 sm:mt-4 sm:rounded-2xl sm:p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wide text-[#2F80ED] sm:text-[10px]">
                        Dự kiến hoàn thành
                      </p>
                      <p className="mt-0.5 text-[13px] font-black text-[#36536B] sm:mt-1 sm:text-sm">
                        {g.remaining <= 0
                          ? "Đã hoàn thành"
                          : `~${g.monthsLeft} tháng`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-[#8CA0B3] sm:text-[10px]">
                        Góp đề xuất
                      </p>
                      <p className="mt-0.5 text-[13px] font-black text-[#2F80ED] sm:mt-1 sm:text-sm">
                        {g.remaining <= 0
                          ? "0 đ"
                          : formatVND(g.suggestedMonthly) + "/tháng"}
                      </p>
                    </div>
                  </div>
                  {g.remaining > 0 && (
                    <p className="mt-2 hidden text-[11px] leading-5 text-[#61788F] sm:block">
                      Nếu duy trì khoản góp này, mục tiêu có thể hoàn thành
                      trong khoảng 12 tháng. Bạn có thể chỉnh số tiền đã tiết
                      kiệm sau mỗi lần góp.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* FINANCE-DATA-1B: an initial read failure must not present as
              "Chưa có mục tiêu nào". */}
          {goals.length === 0 && isLoadingGoals && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-slate-100">
                <Target size={24} className="text-slate-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Đang tải dữ liệu mục tiêu...
              </h3>
            </div>
          )}

          {goals.length === 0 && !isLoadingGoals && goalsLoadError && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-rose-100">
                <Target size={24} className="text-rose-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Không thể tải dữ liệu mục tiêu
              </h3>
              <p className="mt-2 text-sm text-slate-400">{goalsLoadError}</p>
            </div>
          )}

          {/* Empty state */}
          {goals.length === 0 && !isLoadingGoals && !goalsLoadError && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Target size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Chưa có mục tiêu nào
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Bắt đầu hành trình tài chính bằng cách đặt ra mục tiêu đầu tiên.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Thêm mục tiêu
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-stretch justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-dvh w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl">
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 p-4 pb-4 sm:p-6 sm:pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Chỉnh sửa mục tiêu" : "Thêm mục tiêu mới"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Cập nhật số tiền mục tiêu và số tiền đã tiết kiệm.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-[calc(8rem+env(safe-area-inset-bottom))]"
            >
              <div className="space-y-4">
                <FormInput
                  label="Tên mục tiêu"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="VD: Mua laptop, Quỹ khẩn cấp..."
                />
                {/* Target amount with ₫ */}
                <AmountInput
                  label="Số tiền mục tiêu"
                  value={form.targetAmount}
                  onChange={(v) => setForm((p) => ({ ...p, targetAmount: v }))}
                  placeholder="30000000"
                />
                {/* Current amount with ₫ */}
                <AmountInput
                  label="Số tiền đã tiết kiệm thủ công"
                  value={form.currentAmount}
                  onChange={(v) => setForm((p) => ({ ...p, currentAmount: v }))}
                  placeholder="12000000"
                />

                <SavingAccountSelector
                  savings={savings}
                  value={form.savingCategoryIds}
                  onChange={(next) =>
                    setForm((previous) => ({
                      ...previous,
                      savingCategoryIds: next,
                    }))
                  }
                />
              </div>

              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                >
                  {form.id ? "Lưu thay đổi" : "Thêm mục tiêu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "emerald" | "rose" | "indigo";
  icon: React.ReactNode;
}) {
  const styles = {
    blue: "border-[#CFE1F4] bg-[#F3F8FE] text-[#2F80ED]",
    emerald: "border-emerald-200 bg-[#F1FBF7] text-emerald-700",
    rose: "border-rose-200 bg-[#FFF5F6] text-rose-700",
    indigo: "border-indigo-200 bg-[#F5F6FF] text-indigo-700",
  };

  return (
    <div className={"min-h-[108px] rounded-2xl border p-3 shadow-[0_3px_10px_rgba(54,83,107,0.05)] sm:min-h-0 sm:rounded-3xl sm:p-4 " + styles[tone]}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.13em] opacity-75 sm:text-[10px] sm:tracking-[0.16em]">
            {label}
          </p>
          <p className="mt-1.5 wrap-break-word text-[17px] font-black leading-5 tracking-tight sm:mt-2 sm:text-xl sm:leading-normal">
            {value}
          </p>
          <p className="mt-1 line-clamp-1 text-[9.5px] font-semibold leading-4 opacity-75 sm:line-clamp-2 sm:text-[11px]">
            {sub}
          </p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/85 shadow-sm sm:size-9 sm:rounded-2xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function getSavingTypeLabel(type: SavingAccount["type"]) {
  if (type === "emergency_fund") return "Quỹ khẩn cấp";
  if (type === "term_deposit") return "Tiền gửi có kỳ hạn";
  if (type === "certificate") return "Chứng chỉ tiền gửi";
  return "Tài khoản tiết kiệm";
}

function SavingAccountSelector({
  savings,
  value,
  onChange,
}: {
  savings: SavingAccount[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(savingId: string) {
    if (value.includes(savingId)) {
      onChange(value.filter((id) => id !== savingId));
      return;
    }

    onChange([...value, savingId]);
  }

  const selectedTotal = savings.reduce((sum, saving) => {
    if (!value.includes(saving.id)) return sum;
    return sum + saving.balance;
  }, 0);

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">
            Liên kết sổ tiết kiệm
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Chọn khoản tiết kiệm thật từ Supabase để tự cộng vào tiến độ mục
            tiêu.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-emerald-600 shadow-sm">
          {value.length} chọn
        </span>
      </div>

      {selectedTotal > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            Đang đồng bộ
          </p>
          <p className="mt-0.5 text-sm font-black text-emerald-700">
            {formatVND(selectedTotal)}
          </p>
        </div>
      )}

      {savings.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
          Chưa có sổ tiết kiệm trong Supabase. Hãy tạo ở trang Tiết kiệm trước,
          sau đó quay lại liên kết với mục tiêu này.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {savings.map((saving) => {
            const checked = value.includes(saving.id);
            return (
              <button
                key={saving.id}
                type="button"
                onClick={() => toggle(saving.id)}
                className={
                  "rounded-xl border px-3 py-2 text-left transition " +
                  (checked
                    ? "border-emerald-300 bg-white text-emerald-700 shadow-sm"
                    : "border-white bg-white/70 text-slate-600 hover:border-emerald-200")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-black">
                    {saving.name}
                  </span>
                  <span
                    className={
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] " +
                      (checked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 text-transparent")
                    }
                  >
                    ✓
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
                  <span>{getSavingTypeLabel(saving.type)}</span>
                  <span>•</span>
                  <span className="text-emerald-700">
                    {formatVND(saving.balance)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}

function AmountInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <CurrencyInput
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}
