"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  List,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";

import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import ConfirmDialog, { type PendingConfirm } from "@/src/components/ui/ConfirmDialog";
import { SaveError } from "@/src/components/ui/SaveError";
import { useToast } from "@/src/components/ui/ToastProvider";
import {
  addTransaction,
  getCategories,
  getTransactions,
  getWallets,
  updateCategoryRecurringSchedule,
  updateTransactionRecurringSchedule,
} from "@/src/services/finance/financeStorage";
import { formatVND } from "@/src/services/finance/financeCalculations";
import {
  buildRecurringMoneySchedules,
  getRecurringIssueLabel,
  toRecurringScheduleInputs,
  type RecurringMoneySchedule,
} from "@/src/lib/recurring/recurringMoney";
import { expandRecurringScheduleOccurrences } from "@/src/lib/dashboard/dashboardIntelligence";
import {
  buildRecurringDueActions,
  type RecurringDueAction,
} from "@/src/lib/recurring/recurringDueAction";
import type {
  Category,
  RecurrenceFrequency,
  Transaction,
  Wallet,
} from "@/src/types/finance";

type ViewMode = "list" | "calendar";
type FilterMode = "all" | "income" | "expense" | "paused" | "issues";

type EditorState = {
  source: "category" | "transaction";
  sourceId?: string;
  categoryId: string;
  amount: string;
  walletId: string;
  recurrence: RecurrenceFrequency;
  nextRunDate: string;
  enabled: boolean;
  shadowedSourceIds: string[];
};

const RECURRENCE_LABEL: Record<RecurrenceFrequency, string> = {
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
  yearly: "Hàng năm",
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string) {
  if (!value) return "Chưa đặt";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function formatRecurringAmountInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
}
function emptyEditor(categories: Category[], wallets: Wallet[]): EditorState {
  const category = categories.find((item) => item.type === "expense") ?? categories[0];
  return {
    source: "category",
    categoryId: category?.id ?? "",
    amount: "",
    walletId: wallets[0]?.id ?? "",
    recurrence: "monthly",
    nextRunDate: localDateKey(),
    enabled: true,
    shadowedSourceIds: [],
  };
}

export default function RecurringMoneyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  useSuppressGlobalFabsWhileOpen(Boolean(editor) || Boolean(pendingConfirm));

  const reloadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [nextCategories, nextTransactions, nextWallets] = await Promise.all([
        getCategories(),
        getTransactions(),
        getWallets(),
      ]);
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setWallets(nextWallets);
    } catch (error) {
      console.error("[RecurringMoneyPage] reload failed:", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Không thể tải dữ liệu định kỳ. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useRealtimeTable(["categories", "transactions", "wallets"], () => {
    void reloadData();
  });

  const todayKey = localDateKey();
  const schedules = useMemo(
    () =>
      buildRecurringMoneySchedules({
        categories,
        transactions,
        wallets,
        referenceDate: todayKey,
      }),
    [categories, transactions, wallets, todayKey],
  );
  const forecastSchedules = useMemo(
    () => toRecurringScheduleInputs(schedules),
    [schedules],
  );
  const occurrences = useMemo(
    () => expandRecurringScheduleOccurrences(forecastSchedules, todayKey, 30),
    [forecastSchedules, todayKey],
  );
  const dueActions = useMemo(
    () =>
      buildRecurringDueActions({
        schedules,
        transactions,
        referenceDate: todayKey,
        upcomingDays: 3,
      }),
    [schedules, todayKey, transactions],
  );
  const dueActionByScheduleId = useMemo(
    () => new Map(dueActions.map((item) => [item.scheduleId, item])),
    [dueActions],
  );

  const overview = useMemo(() => {
    const income30 = occurrences
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + item.amount, 0);
    const expense30 = occurrences
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      active: schedules.filter((item) => item.enabled && item.issues.length === 0).length,
      paused: schedules.filter((item) => !item.enabled).length,
      issues: schedules.filter((item) => item.issues.length > 0).length,
      income30,
      expense30,
      net30: income30 - expense30,
    };
  }, [occurrences, schedules]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      if (filterMode === "income") return schedule.type === "income";
      if (filterMode === "expense") return schedule.type === "expense";
      if (filterMode === "paused") return !schedule.enabled;
      if (filterMode === "issues") return schedule.issues.length > 0;
      return true;
    });
  }, [filterMode, schedules]);

  const groupedOccurrences = useMemo(() => {
    const groups = new Map<string, typeof occurrences>();
    for (const occurrence of occurrences) {
      const key = localDateKey(occurrence.date);
      const group = groups.get(key) ?? [];
      group.push(occurrence);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [occurrences]);

  const categoryScheduleIds = useMemo(
    () => new Set(schedules.filter((item) => item.source === "category").map((item) => item.sourceId)),
    [schedules],
  );
  const selectableCategories = categories.filter(
    (category) =>
      (category.type === "income" || category.type === "expense") &&
      !categoryScheduleIds.has(category.id),
  );

  function openCreate() {
    if (wallets.length === 0) {
      toast({ variant: "warning", message: "Hãy tạo ít nhất một ví trước khi lập lịch định kỳ." });
      router.push("/wallets");
      return;
    }
    if (selectableCategories.length === 0) {
      toast({
        variant: "info",
        message: schedules.length > 0
          ? "Mọi danh mục phù hợp đã có lịch. Bạn có thể sửa lịch hiện có hoặc tạo thêm danh mục."
          : "Hãy tạo danh mục thu/chi trước khi lập lịch định kỳ.",
      });
      if (categories.length === 0) router.push("/categories");
      return;
    }
    setSaveError(null);
    setEditor(emptyEditor(selectableCategories, wallets));
  }

  function openEdit(schedule: RecurringMoneySchedule) {
    setSaveError(null);
    setEditor({
      source: schedule.source,
      sourceId: schedule.sourceId,
      categoryId: schedule.categoryId,
      amount: schedule.amount > 0 ? String(schedule.amount) : "",
      walletId: schedule.walletId,
      recurrence: schedule.recurrence ?? "monthly",
      nextRunDate: schedule.nextRunDate ?? localDateKey(),
      enabled: schedule.enabled,
      shadowedSourceIds: schedule.shadowedSourceIds,
    });
  }

  async function clearShadowedLegacySchedules(ids: string[]) {
    for (const transactionId of ids) {
      const result = await updateTransactionRecurringSchedule({
        transactionId,
        enabled: false,
        recurrence: null,
        nextRunDate: null,
      });
      if (result.error) return result.error;
    }
    return null;
  }

  async function persistSchedule(next: EditorState) {
    if (!next.sourceId && next.source !== "category") {
      return "Không xác định được nguồn lịch định kỳ.";
    }
    if (!next.recurrence) return "Vui lòng chọn tần suất.";
    if (!next.nextRunDate) return "Vui lòng chọn ngày chạy tiếp theo.";

    if (next.source === "transaction") {
      const result = await updateTransactionRecurringSchedule({
        transactionId: next.sourceId!,
        enabled: next.enabled,
        recurrence: next.recurrence,
        nextRunDate: next.nextRunDate,
      });
      return result.error;
    }

    const amount = Number(next.amount);
    if (!next.categoryId) return "Vui lòng chọn danh mục.";
    if (!Number.isFinite(amount) || amount <= 0) return "Số tiền định kỳ phải lớn hơn 0.";
    if (!next.walletId) return "Vui lòng chọn ví.";

    const shadowError = await clearShadowedLegacySchedules(
      next.shadowedSourceIds,
    );
    if (shadowError) return shadowError;

    const result = await updateCategoryRecurringSchedule({
      categoryId: next.sourceId ?? next.categoryId,
      enabled: next.enabled,
      recurrence: next.recurrence,
      amount,
      walletId: next.walletId,
      nextRunDate: next.nextRunDate,
    });
    return result.error;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const error = await persistSchedule(editor);
      if (error) {
        setSaveError(error);
        return;
      }
      await reloadData();
      setEditor(null);
      toast({ variant: "success", message: editor.sourceId ? "Đã cập nhật lịch định kỳ." : "Đã tạo lịch định kỳ." });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không thể lưu lịch định kỳ.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(schedule: RecurringMoneySchedule) {
    if (!schedule.enabled && schedule.issues.length > 0) {
      openEdit(schedule);
      setSaveError("Hãy hoàn tất cấu hình còn thiếu trước khi bật lại lịch.");
      return;
    }
    const next: EditorState = {
      source: schedule.source,
      sourceId: schedule.sourceId,
      categoryId: schedule.categoryId,
      amount: String(schedule.amount),
      walletId: schedule.walletId,
      recurrence: schedule.recurrence ?? "monthly",
      nextRunDate: schedule.nextRunDate ?? localDateKey(),
      enabled: !schedule.enabled,
      shadowedSourceIds: schedule.shadowedSourceIds,
    };
    const error = await persistSchedule(next);
    if (error) {
      toast({ variant: "error", message: error });
      return;
    }
    await reloadData();
    toast({ variant: "success", message: next.enabled ? "Đã bật lịch định kỳ." : "Đã tạm dừng lịch định kỳ." });
  }

  function requestRecordDueTransaction(
    schedule: RecurringMoneySchedule,
    dueAction: RecurringDueAction,
  ) {
    if (dueAction.status !== "due-today") return;

    setPendingConfirm({
      title: `Ghi giao dịch “${schedule.title}”?`,
      description:
        schedule.type === "income"
          ? `Ghi nhận khoản thu ${formatVND(schedule.amount)} vào ngày ${formatDate(dueAction.dueDate)}. MyFinance chỉ tạo giao dịch sau khi bạn xác nhận.`
          : `Ghi nhận khoản chi ${formatVND(schedule.amount)} vào ngày ${formatDate(dueAction.dueDate)}. MyFinance chỉ trừ ví sau khi bạn xác nhận.`,
      confirmText: "Ghi giao dịch",
      variant: schedule.type === "expense" ? "danger" : "info",
      onConfirm: async () => {
        const transaction: Transaction = {
          id: crypto.randomUUID(),
          type: schedule.type,
          amount: schedule.amount,
          categoryId: schedule.categoryId,
          walletId: schedule.walletId,
          note: schedule.title,
          date: dueAction.dueDate,
        };

        const result = await addTransaction(transaction);
        if (result.error) {
          toast({ variant: "error", message: result.error });
          return;
        }

        await reloadData();
        toast({
          variant: "success",
          message:
            schedule.type === "income"
              ? "Đã ghi nhận khoản thu định kỳ."
              : "Đã ghi nhận khoản chi định kỳ.",
        });
      },
    });
  }
  function requestClear(schedule: RecurringMoneySchedule) {
    setPendingConfirm({
      title: "Xóa lịch định kỳ?",
      description: schedule.legacy
        ? "Chỉ xóa cấu hình lặp lại khỏi giao dịch gốc. Giao dịch đã ghi nhận và số dư ví không bị thay đổi."
        : "Chỉ xóa cấu hình định kỳ khỏi danh mục. Danh mục và các giao dịch đã ghi nhận vẫn được giữ nguyên.",
      confirmText: "Xóa lịch",
      variant: "danger",
      onConfirm: async () => {
        if (schedule.source === "category") {
          const shadowError = await clearShadowedLegacySchedules(
            schedule.shadowedSourceIds,
          );
          if (shadowError) {
            toast({ variant: "error", message: shadowError });
            return;
          }
        }

        const result = schedule.source === "category"
          ? await updateCategoryRecurringSchedule({
              categoryId: schedule.sourceId,
              enabled: false,
              recurrence: null,
              amount: null,
              walletId: null,
              nextRunDate: null,
            })
          : await updateTransactionRecurringSchedule({
              transactionId: schedule.sourceId,
              enabled: false,
              recurrence: null,
              nextRunDate: null,
            });
        if (result.error) {
          toast({ variant: "error", message: result.error });
          return;
        }
        await reloadData();
        toast({ variant: "success", message: "Đã xóa lịch định kỳ." });
      },
    });
  }

  return (
    <div data-recurring-money-manager="true" className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-[#C9DCEB] bg-white p-4 shadow-[0_14px_34px_rgba(45,76,102,0.10)] sm:rounded-4xl sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-700">
              <Repeat2 size={13} /> DÒNG TIỀN ĐỊNH KỲ
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-[#294A66] sm:text-3xl">Dòng tiền định kỳ</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#60778D]">
              Một nơi quản lý lương, hóa đơn và khoản thu/chi lặp lại. Dashboard Safe to Spend và Cash Runway dùng chính lịch hợp lệ ở đây. Lịch chỉ dùng cho dự báo; đến hạn không tự ghi giao dịch hay đổi số dư.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-[#2F80ED] to-[#17A9D4] px-4 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(47,128,237,0.18)] transition hover:-translate-y-0.5"
          >
            <Plus size={17} /> Thêm khoản định kỳ
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="Đang hoạt động" value={String(overview.active)} tone="blue" />
          <SummaryCard label="30 ngày thu" value={formatVND(overview.income30)} tone="green" />
          <SummaryCard label="30 ngày chi" value={formatVND(overview.expense30)} tone="rose" />
          <SummaryCard label="30 ngày ròng" value={`${overview.net30 >= 0 ? "+" : ""}${formatVND(overview.net30)}`} tone={overview.net30 >= 0 ? "blue" : "rose"} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-sm sm:rounded-4xl sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {([
              ["all", "Tất cả"],
              ["expense", "Chi định kỳ"],
              ["income", "Thu định kỳ"],
              ["paused", `Tạm dừng${overview.paused ? ` · ${overview.paused}` : ""}`],
              ["issues", `Cần sửa${overview.issues ? ` · ${overview.issues}` : ""}`],
            ] as Array<[FilterMode, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilterMode(value)}
                className={`min-h-10 shrink-0 rounded-xl px-3.5 text-xs font-black transition ${filterMode === value ? "bg-[#EAF3FC] text-[#1F6FCA]" : "text-[#60778D] hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:w-64">
            <button type="button" onClick={() => setViewMode("list")} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-black ${viewMode === "list" ? "bg-white text-[#294A66] shadow-sm" : "text-[#71879A]"}`}><List size={14} /> Danh sách</button>
            <button type="button" onClick={() => setViewMode("calendar")} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-black ${viewMode === "calendar" ? "bg-white text-[#294A66] shadow-sm" : "text-[#71879A]"}`}><CalendarDays size={14} /> 30 ngày</button>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-36 animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-36 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      ) : loadError ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-black text-amber-800">Chưa thể tải lịch định kỳ</p>
          <p className="mt-1 text-sm text-amber-700">{loadError}</p>
          <button type="button" onClick={() => void reloadData()} className="mt-4 min-h-10 rounded-xl bg-white px-4 text-sm font-black text-amber-800 shadow-sm">Thử lại</button>
        </div>
      ) : viewMode === "list" ? (
        filteredSchedules.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <section className="grid gap-3 lg:grid-cols-2">
            {filteredSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                dueAction={dueActionByScheduleId.get(schedule.id)}
                onRecord={(dueAction) =>
                  requestRecordDueTransaction(schedule, dueAction)
                }
                onEdit={() => openEdit(schedule)}
                onToggle={() => void handleToggle(schedule)}
                onClear={() => requestClear(schedule)}
              />
            ))}
          </section>
        )
      ) : groupedOccurrences.length === 0 ? (
        <EmptyState onCreate={openCreate} calendar />
      ) : (
        <section className="space-y-3">
          {groupedOccurrences.map(([dateKey, items]) => (
            <div key={dateKey} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#71879A]">Ngày đến hạn</p>
                  <p className="mt-1 text-base font-black text-[#294A66]">{formatDate(dateKey)}</p>
                </div>
                <span className="rounded-full bg-[#EEF5FA] px-2.5 py-1 text-[11px] font-black text-[#60778D]">{items.length} khoản</span>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#294A66]">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-[#71879A]">{item.categoryName ?? "Chưa phân loại"}</p>
                    </div>
                    <p className={`shrink-0 text-sm font-black tabular-nums ${item.type === "income" ? "text-emerald-600" : "text-rose-500"}`}>
                      {item.type === "income" ? "+" : "−"}{formatVND(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {editor && (
        <div className="fixed inset-0 overflow-x-hidden z-100 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <div>
                <h2 className="text-[1.15rem] font-black tracking-tight text-slate-900 sm:text-xl">
                  {editor.sourceId ? "Chỉnh lịch định kỳ" : "Thêm khoản định kỳ"}
                </h2>
                <p className="mt-0.5 max-w-72 text-[10px] font-medium leading-4 text-slate-400 sm:max-w-none sm:text-xs">
                  Thiết lập khoản thu hoặc chi lặp lại để dự báo dòng tiền.
                </p>
              </div>
              <button type="button" onClick={() => setEditor(null)} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 active:scale-95 sm:size-9 sm:rounded-2xl"><X size={18} /></button>
            </div>

            <form id="recurring-money-form" onSubmit={handleSave} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-2.5 pb-24 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-4 sm:pb-5">
              {editor.source === "category" ? (
                <label className="block">
                  <span className="text-sm font-black text-slate-700">Danh mục</span>
                  <select
                    value={editor.categoryId}
                    disabled={Boolean(editor.sourceId)}
                    onChange={(event) => setEditor((prev) => prev ? { ...prev, categoryId: event.target.value, sourceId: undefined } : prev)}
                    className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm"
                  >
                    {(editor.sourceId ? categories.filter((item) => item.id === editor.categoryId) : selectableCategories).map((category) => (
                      <option key={category.id} value={category.id}>{category.name} · {category.type === "income" ? "Thu" : "Chi"}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs font-medium leading-5 text-slate-600">
                  Đây là lịch legacy từ một giao dịch đã ghi nhận. Số tiền, ví và danh mục giữ nguyên để không tạo thay đổi số dư ngoài ý muốn; sửa các trường đó tại trang Giao dịch.
                </div>
              )}<div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-700">Số tiền</p>
                  {Number(editor.amount) > 0 ? (
                    <p className="text-xs font-black text-blue-600">
                      {formatVND(Number(editor.amount))}
                    </p>
                  ) : null}
                </div>
                <div className="relative rounded-2xl border-2 border-slate-200 bg-white transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">
                    ₫
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatRecurringAmountInput(editor.amount)}
                    disabled={editor.source === "transaction"}
                    onChange={(event) =>
                      setEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              amount: event.target.value.replace(/[^0-9]/g, ""),
                            }
                          : prev,
                      )
                    }
                    placeholder="Nhập số tiền"
                    className="w-full rounded-2xl bg-transparent py-3 pl-11 pr-4 text-[1.25rem] font-black tracking-tight text-slate-900 outline-none placeholder:text-sm placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:py-3.5 sm:text-xl"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-slate-700">Tần suất</span>
                  <select
                    value={editor.recurrence}
                    onChange={(event) =>
                      setEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              recurrence: event.target.value as RecurrenceFrequency,
                            }
                          : prev,
                      )
                    }
                    className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-sm"
                  >
                    <option value="daily">Hàng ngày</option>
                    <option value="weekly">Hàng tuần</option>
                    <option value="monthly">Hàng tháng</option>
                    <option value="yearly">Hàng năm</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-black text-slate-700">Ví tiền</span>
                  <select
                    value={editor.walletId}
                    disabled={editor.source === "transaction"}
                    onChange={(event) =>
                      setEditor((prev) =>
                        prev ? { ...prev, walletId: event.target.value } : prev,
                      )
                    }
                    className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm"
                  >
                    <option value="">Chọn ví</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Ngày chạy tiếp</span>
                <input
                  type="date"
                  value={editor.nextRunDate}
                  onChange={(event) =>
                    setEditor((prev) =>
                      prev ? { ...prev, nextRunDate: event.target.value } : prev,
                    )
                  }
                  className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-sm"
                />
              </label>

              <button type="button" onClick={() => setEditor((prev) => prev ? { ...prev, enabled: !prev.enabled } : prev)} className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-left transition hover:bg-slate-100/70">
                <div>
                  <p className="text-sm font-black text-slate-700">Kích hoạt lịch</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-400">Tắt để tạm dừng nhưng vẫn giữ cấu hình.</p>
                </div>
                <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${editor.enabled ? "bg-blue-600 shadow-sm shadow-blue-200" : "bg-slate-300"}`}><span className={`size-5 rounded-full bg-white shadow transition-transform ${editor.enabled ? "translate-x-6" : "translate-x-1"}`} /></span>
              </button>

              <SaveError message={saveError} onDismiss={() => setSaveError(null)} />
            </form>

            <div className="safe-bottom-padding relative z-20 shrink-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_32px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6 sm:py-3.5">
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditor(null)} className="min-h-11 flex-1 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[.99]">Hủy</button>
                <button form="recurring-money-form" type="submit" disabled={isSaving} className="min-h-11 flex-1 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Đang lưu..." : "Lưu lịch"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog action={pendingConfirm} onCancel={() => setPendingConfirm(null)} />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "rose" }) {
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "rose" ? "text-rose-500" : "text-[#2F80ED]";
  return (
    <div className="rounded-2xl border border-[#DCE8F1] bg-[#FCFEFF] p-3.5">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#71879A]">{label}</p>
      <p className={`mt-1.5 whitespace-nowrap text-[clamp(14px,4vw,20px)] font-black tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onCreate, calendar = false }: { onCreate: () => void; calendar?: boolean }) {
  return (
    <section className="rounded-3xl border border-dashed border-[#C9DCEB] bg-white/80 p-8 text-center">
      <Repeat2 className="mx-auto text-[#8ABBE8]" size={28} />
      <p className="mt-3 text-base font-black text-[#294A66]">{calendar ? "Chưa có khoản đến hạn trong 30 ngày" : "Chưa có lịch định kỳ phù hợp"}</p>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[#71879A]">Tạo lịch từ một danh mục thu/chi để Safe to Spend và Cash Runway có dữ liệu dự báo đáng tin hơn.</p>
      <button type="button" onClick={onCreate} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-50 px-4 text-sm font-black text-blue-700"><Plus size={16} /> Thêm khoản định kỳ</button>
    </section>
  );
}

function ScheduleCard({
  schedule,
  dueAction,
  onRecord,
  onEdit,
  onToggle,
  onClear,
}: {
  schedule: RecurringMoneySchedule;
  dueAction?: RecurringDueAction;
  onRecord: (dueAction: RecurringDueAction) => void;
  onEdit: () => void;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <article className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${schedule.issues.length > 0 ? "border-amber-200" : "border-slate-200/80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex size-9 items-center justify-center rounded-xl ${schedule.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
              {schedule.type === "income" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#294A66]">{schedule.title}</p>
              <p className="mt-0.5 truncate text-xs text-[#71879A]">{schedule.categoryName} · {schedule.walletName}</p>
            </div>
          </div>
        </div>
        <p className={`shrink-0 text-sm font-black tabular-nums ${schedule.type === "income" ? "text-emerald-600" : "text-rose-500"}`}>{schedule.type === "income" ? "+" : "−"}{formatVND(schedule.amount)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#F8FBFE] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8297A9]">Tần suất</p>
          <p className="mt-1 text-xs font-black text-[#3F5F79]">{schedule.recurrence ? RECURRENCE_LABEL[schedule.recurrence] : "Chưa đặt"}</p>
        </div>
        <div className="rounded-xl bg-[#F8FBFE] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8297A9]">Lần tới</p>
          <p className="mt-1 text-xs font-black text-[#3F5F79]">{formatDate(schedule.effectiveNextRunDate ?? schedule.nextRunDate)}</p>
        </div>
      </div>

      {dueAction ? (
        <div
          data-recurring-due-status={dueAction.status}
          className={
            "mt-3 flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 " +
            (dueAction.status === "due-today"
              ? "border-amber-200/80 bg-amber-50/70"
              : "border-blue-100 bg-blue-50/55")
          }
        >
          <div className="min-w-0">
            <p
              className={
                "text-xs font-black tracking-tight " +
                (dueAction.status === "due-today"
                  ? "text-amber-800"
                  : "text-blue-700")
              }
            >
              {dueAction.status === "due-today"
                ? "Đến hạn hôm nay"
                : `Sắp đến hạn · còn ${dueAction.daysUntilDue} ngày`}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {formatDate(dueAction.dueDate)} · MyFinance không tự ghi giao dịch
            </p>
          </div>
          {dueAction?.status === "due-today" ? (
            <button
              type="button"
              onClick={() => onRecord(dueAction)}
              className="min-h-10 shrink-0 rounded-xl bg-amber-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-amber-700 active:scale-[.98]"
            >
              Ghi giao dịch
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${schedule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{schedule.enabled ? "Đang chạy" : "Tạm dừng"}</span>
        {schedule.legacy ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">Nguồn: giao dịch cũ</span> : <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">Nguồn: danh mục</span>}
        {schedule.shadowedSourceIds.length > 0 ? <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700">Đã gộp {schedule.shadowedSourceIds.length} mirror</span> : null}
      </div>

      {schedule.issues.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs font-semibold leading-5 text-amber-800">{schedule.issues.map(getRecurringIssueLabel).join(" · ")}</p>
        </div>
      ) : schedule.enabled ? (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700/90"><CheckCircle2 size={13} /> Đủ dữ liệu cho forecast</div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3.5">
        <button type="button" onClick={onToggle} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-600 transition hover:bg-slate-100 active:scale-[.99]">{schedule.enabled ? <PauseCircle size={15} /> : <PlayCircle size={15} />}{schedule.enabled ? "Dừng" : "Bật"}</button>
        <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700 transition hover:bg-blue-100 active:scale-[.99]"><Pencil size={14} /> Sửa</button>
        <button type="button" onClick={onClear} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 text-xs font-bold text-rose-600 transition hover:bg-rose-100 active:scale-[.99]"><Trash2 size={14} /> Xóa lịch</button>
      </div>
    </article>
  );
}
