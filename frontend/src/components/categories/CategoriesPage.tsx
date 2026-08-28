"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Folder,
  Layers3,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  Repeat2,
  CalendarDays,
  WalletCards,
  X,
} from "lucide-react";

import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  CategoryType,

  RecurrenceFrequency,
  Transaction,
  Wallet,
} from "@/src/types/finance";

import {
  addCategory,
  deleteCategory,
  getBudgets,
  getCategories,
  getTransactions,
  getWallets,
  updateCategory,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getCategoryPlanningGroup,
} from "@/src/services/finance/financeCalculations";

type CategoryGroup = Extract<
  CategoryPlanningGroup,
  "income" | "fixed" | "variable"
>;
type ActivityFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "income" | "expense";
type GroupFilter = "all" | CategoryGroup;
type SortOption = "amount" | "usage" | "name";

type FormState = {
  id?: string;
  name: string;
  type: CategoryType;
  group: CategoryGroup;
  legacyFinancialGroup?: Category["financialGroup"];
  isRecurring: boolean;
  recurrence: RecurrenceFrequency;
  defaultAmount: string;
  defaultWalletId: string;
  nextRunDate: string;
};

const emptyForm: FormState = {
  name: "",
  type: "expense",
  group: "variable",

  isRecurring: false,
  recurrence: "monthly",
  defaultAmount: "",
  defaultWalletId: "",
  nextRunDate: "",
};

type GroupMeta = {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  iconBg: string;
  bar: string;
};

const GROUP_ORDER: CategoryGroup[] = ["income", "fixed", "variable"];

const GROUP_META: Record<CategoryGroup, GroupMeta> = {
  income: {
    label: "Thu nhập",
    shortLabel: "Thu nhập",
    description: "Lương, thưởng và các khoản tiền vào",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconBg: "bg-emerald-500",
    bar: "#10b981",
  },
  fixed: {
    label: "Chi phí cố định",
    shortLabel: "Cố định",
    description: "Nhà ở, điện nước và phí định kỳ",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    iconBg: "bg-indigo-500",
    bar: "#6366f1",
  },
  variable: {
    label: "Chi phí biến đổi",
    shortLabel: "Biến đổi",
    description: "Ăn uống, mua sắm và các khoản linh hoạt",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    iconBg: "bg-orange-500",
    bar: "#f97316",
  },
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const amount = Number(digits);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function inferCategoryGroup(
  category: Pick<Category, "name" | "type" | "planningGroup">,
): CategoryGroup | null {
  const group = getCategoryPlanningGroup(category);
  return group === "income" || group === "fixed" || group === "variable"
    ? group
    : null;
}

function getTypeFromGroup(group: CategoryGroup): CategoryType {
  return group === "income" ? "income" : "expense";
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  // FINANCE-DATA-1B: "Không tìm thấy danh mục" must not render before a
  // load has actually SUCCEEDED at least once — an initial read failure
  // (getCategories now rejects instead of silently resolving []) would
  // otherwise look identical to a genuinely category-less account.
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoriesLoadError, setCategoriesLoadError] = useState<
    string | null
  >(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [hasLoadedCategorySnapshot, setHasLoadedCategorySnapshot] =
    useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("usage");

  const { toast } = useToast();

  const reloadData = useCallback(async () => {
    // CATEGORIES-CORRECTNESS-1: categories + transactions + budgets form one
    // critical snapshot. Never commit a partial dependency view because both
    // activity state and delete eligibility depend on transaction/budget reads.
    // On failure, keep the last-known-good snapshot intact.
    setIsLoadingCategories(true);
    try {
      const [categoryData, transactionData, budgetData] = await Promise.all([
        getCategories(),
        getTransactions(),
        getBudgets(),
      ]);
      setCategories(categoryData);
      setTransactions(transactionData);
      setBudgets(budgetData);
      setHasLoadedCategorySnapshot(true);
      setCategoriesLoadError(null);
    } catch (error) {
      console.error("[CategoriesPage] reloadData failed:", error);
      setCategoriesLoadError(
        "Không thể tải hoặc làm mới dữ liệu danh mục. Vui lòng thử lại.",
      );
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  const reloadWallets = useCallback(async () => {
    // Wallet availability is useful for recurring-category editing, but it must
    // not poison the critical category snapshot when the wallet read fails.
    try {
      const walletData = await getWallets();
      setWallets(walletData);
    } catch (error) {
      console.error("[CategoriesPage] reloadWallets failed:", error);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
      void reloadWallets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadData, reloadWallets]);

  useEffect(() => {
    if (!isFormOpen && !isFilterOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFilterOpen, isFormOpen]);

  useRealtimeTable(["categories", "transactions", "budgets"], reloadData);
  useRealtimeTable(["wallets"], reloadWallets);

  const transactionSummaryByCategory = useMemo(() => {
    const summary = new Map<string, { count: number; total: number }>();
    for (const transaction of transactions) {
      const current = summary.get(transaction.categoryId) ?? {
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += transaction.amount;
      summary.set(transaction.categoryId, current);
    }
    return summary;
  }, [transactions]);

  const budgetCountByCategory = useMemo(() => {
    const summary = new Map<string, number>();
    for (const budget of budgets) {
      summary.set(budget.categoryId, (summary.get(budget.categoryId) ?? 0) + 1);
    }
    return summary;
  }, [budgets]);

  const enrichedCategories = useMemo(
    () =>
      categories.flatMap((category) => {
        const group = inferCategoryGroup(category);
        if (!group) return [];
        const usage = transactionSummaryByCategory.get(category.id) ?? {
          count: 0,
          total: 0,
        };
        const budgetCount = budgetCountByCategory.get(category.id) ?? 0;
        return [
          {
            ...category,
            group,
            count: usage.count,
            total: usage.total,
            budgetCount,
            isActive:
              category.isRecurring === true ||
              usage.count > 0 ||
              budgetCount > 0,
          },
        ];
      }),
    [budgetCountByCategory, categories, transactionSummaryByCategory],
  );

  const overview = useMemo(() => {
    const active = enrichedCategories.filter((category) => category.isActive);
    return {
      total: enrichedCategories.length,
      income: enrichedCategories.filter(
        (category) => category.type === "income",
      ).length,
      expense: enrichedCategories.filter(
        (category) => category.type === "expense",
      ).length,
      active: active.length,
      unused: enrichedCategories.length - active.length,
    };
  }, [enrichedCategories]);

  const groupStats = useMemo(() => {
    const initial = Object.fromEntries(
      GROUP_ORDER.map((group) => [group, { count: 0, active: 0, amount: 0 }]),
    ) as Record<
      CategoryGroup,
      { count: number; active: number; amount: number }
    >;

    for (const category of enrichedCategories) {
      initial[category.group].count += 1;
      initial[category.group].amount += category.total;
      if (category.isActive) initial[category.group].active += 1;
    }
    return initial;
  }, [enrichedCategories]);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeText(search.trim());
    return enrichedCategories
      .filter((category) => {
        if (typeFilter !== "all" && category.type !== typeFilter) return false;
        if (groupFilter !== "all" && category.group !== groupFilter)
          return false;
        if (activityFilter === "active" && !category.isActive) return false;
        if (activityFilter === "inactive" && category.isActive) return false;
        if (
          normalizedSearch &&
          !normalizeText(category.name).includes(normalizedSearch)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name, "vi");
        if (sortBy === "amount") return b.total - a.total;
        return b.count - a.count;
      });
  }, [
    activityFilter,
    enrichedCategories,
    groupFilter,
    search,
    sortBy,
    typeFilter,
  ]);

  const activeFilterCount = [
    typeFilter !== "all",
    groupFilter !== "all",
    activityFilter !== "all",
    sortBy !== "usage",
  ].filter(Boolean).length;

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setGroupFilter("all");
    setActivityFilter("all");
    setSortBy("usage");
  }

  function openCreateForm(group: CategoryGroup = "variable") {
    if (!hasLoadedCategorySnapshot || categoriesLoadError) {
      toast({
        variant: "warning",
        message: "Chưa thể tạo danh mục cho tới khi dữ liệu tải thành công.",
      });
      return;
    }

    setSaveError(null);
    setForm({
      name: "",
      group,
      type: getTypeFromGroup(group),

      isRecurring: false,
      recurrence: "monthly",
      defaultAmount: "",
      defaultWalletId: "",
      nextRunDate: "",
    });
    setIsFormOpen(true);
  }

  function openEditForm(category: Category) {
    const group = inferCategoryGroup(category);
    if (!group) return;
    setSaveError(null);
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      group,
      legacyFinancialGroup: category.financialGroup,
      isRecurring: category.isRecurring ?? false,
      recurrence: category.recurrence ?? "monthly",
      defaultAmount:
        category.defaultAmount === undefined
          ? ""
          : String(category.defaultAmount),
      defaultWalletId: category.defaultWalletId ?? "",
      nextRunDate: category.nextRunDate ?? "",
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitInFlightRef.current) return;
    if (!hasLoadedCategorySnapshot || categoriesLoadError) {
      setSaveError(
        "Chưa thể xác minh dữ liệu danh mục. Hãy đợi lần tải thành công trước khi lưu.",
      );
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setSaveError("Vui lòng nhập tên danh mục");
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== form.id &&
        normalizeText(category.name) === normalizeText(name),
    );
    if (duplicate) {
      setSaveError("Tên danh mục đã tồn tại");
      return;
    }

    const recurringAmount = Number(form.defaultAmount);
    if (form.isRecurring) {
      if (!Number.isFinite(recurringAmount) || recurringAmount <= 0) {
        setSaveError("Vui lòng nhập số tiền định kỳ lớn hơn 0");
        return;
      }
      if (!form.defaultWalletId) {
        setSaveError("Vui lòng chọn ví mặc định cho khoản định kỳ");
        return;
      }
      if (!form.nextRunDate) {
        setSaveError("Vui lòng chọn ngày chạy tiếp theo");
        return;
      }
    }

    const category: Category = {
      id: form.id ?? crypto.randomUUID(),
      name,
      type: getTypeFromGroup(form.group),
      planningGroup: form.group,
      financialGroup: form.legacyFinancialGroup,
      isRecurring: form.isRecurring,
      recurrence: form.isRecurring ? form.recurrence : undefined,
      defaultAmount: form.isRecurring ? recurringAmount : undefined,
      defaultWalletId: form.isRecurring ? form.defaultWalletId : undefined,
      nextRunDate: form.isRecurring ? form.nextRunDate : undefined,
    };

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setSaveError(null);

    try {
      const { error } = form.id
        ? await updateCategory(category)
        : await addCategory(category);

      if (error) {
        setSaveError(error);
        return;
      }

      await reloadData();
      setIsFormOpen(false);
      setForm(emptyForm);
      toast({
        variant: "success",
        message: form.id ? "Đã cập nhật danh mục." : "Đã thêm danh mục mới.",
      });
    } catch (error) {
      console.error("[CategoriesPage] handleSubmit failed:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Không thể lưu danh mục. Vui lòng thử lại.",
      );
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handleDelete(category: Category) {
    if (!hasLoadedCategorySnapshot || categoriesLoadError) {
      toast({
        variant: "warning",
        message:
          "Chưa thể xác minh giao dịch/ngân sách liên kết. Hãy đợi dữ liệu tải thành công trước khi xóa danh mục.",
      });
      return;
    }

    const usage = transactionSummaryByCategory.get(category.id);
    if ((usage?.count ?? 0) > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa “${category.name}” vì đang có ${usage?.count ?? 0} giao dịch liên kết.`,
      });
      return;
    }

    const budgetCount = budgetCountByCategory.get(category.id) ?? 0;
    if (budgetCount > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa “${category.name}” vì đang có ${budgetCount} ngân sách liên kết. Hãy xóa hoặc chuyển ngân sách sang danh mục khác trước.`,
      });
      return;
    }

    setPendingAction({
      title: `Xóa danh mục “${category.name}”?`,
      description:
        "Danh mục chưa có giao dịch hoặc ngân sách liên kết và sẽ bị xóa vĩnh viễn khỏi tài khoản.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteCategory(category.id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa danh mục: " + error });
          return;
        }
        await reloadData();
        toast({ variant: "success", message: "Đã xóa danh mục." });
      },
    });
  }

  return (
    <div className="space-y-3 overflow-x-hidden pb-24 sm:space-y-5 md:pb-0">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-6">
        <div className="flex items-center justify-between gap-3 sm:items-end">
          <div className="min-w-0">
            <p className="hidden text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 sm:block">
              Category Management
            </p>
            <h1 className="whitespace-nowrap text-xl font-black tracking-tight text-slate-900 sm:mt-1 sm:text-3xl">
              Danh mục thu chi
            </h1>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">
              Quản lý loại giao dịch, nhóm vận hành và cấu hình định kỳ.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateForm("variable")}
            disabled={!hasLoadedCategorySnapshot || Boolean(categoriesLoadError)}
            aria-label="Thêm danh mục"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-200/70 transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:bg-slate-300 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3 sm:text-sm sm:font-bold"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Thêm danh mục</span>
          </button>
        </div>

        <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-5 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5">
          {hasLoadedCategorySnapshot ? (
            <>
              <OverviewCard
                label="Tổng danh mục"
                value={overview.total}
                icon={<Layers3 size={18} />}
              />
              <OverviewCard
                label="Thu nhập"
                value={overview.income}
                icon={<ArrowUpRight size={18} />}
                tone="income"
              />
              <OverviewCard
                label="Chi tiêu"
                value={overview.expense}
                icon={<ArrowDownRight size={18} />}
                tone="expense"
              />
              <OverviewCard
                label="Đang sử dụng"
                value={overview.active}
                icon={<CheckCircle2 size={18} />}
                tone="active"
              />
              <OverviewCard
                label="Chưa sử dụng"
                value={overview.unused}
                icon={<Archive size={18} />}
                tone="unused"
              />
            </>
          ) : (
            Array.from({ length: 5 }, (_, index) => (
              <OverviewCardSkeleton key={index} />
            ))
          )}
        </div>
      </section>

      {hasLoadedCategorySnapshot && categoriesLoadError && (
        <div
          role="alert"
          className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <b>Đang hiển thị dữ liệu gần nhất.</b> {categoriesLoadError}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-6">
        <div className="hidden sm:block">
          <h2 className="text-base font-black text-slate-900">Loại danh mục</h2>
          <p className="text-xs text-slate-500">
            Chọn một loại để lọc nhanh hoặc tạo danh mục giao dịch mới.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          {GROUP_ORDER.map((group) => {
            const meta = GROUP_META[group];
            const stat = hasLoadedCategorySnapshot ? groupStats[group] : null;
            const selected =
              hasLoadedCategorySnapshot && groupFilter === group;
            return (
              <div
                key={group}
                className={
                  "min-w-0 rounded-2xl border p-2.5 transition sm:rounded-3xl sm:p-4 " +
                  (selected
                    ? `${meta.border} ${meta.bg} ring-2 ring-blue-100`
                    : "border-slate-200 bg-white hover:border-blue-200")
                }
              >
                <button
                  type="button"
                  onClick={() => setGroupFilter(selected ? "all" : group)}
                  disabled={!hasLoadedCategorySnapshot}
                  className="w-full text-left disabled:cursor-not-allowed"
                  aria-pressed={selected}
                >
                  <div className="flex items-center justify-between gap-1.5 sm:items-start sm:gap-3">
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-xl text-white sm:size-9 sm:rounded-2xl ${meta.iconBg}`}
                    >
                      {group === "income" ? (
                        <Tag size={14} />
                      ) : (
                        <Folder size={14} />
                      )}
                    </div>
                    <span className="text-lg font-black tabular-nums text-slate-900 sm:text-2xl">
                      {stat ? stat.count : "—"}
                    </span>
                  </div>
                  <p className={`mt-2 whitespace-nowrap text-[10px] font-black tracking-tight sm:mt-3 sm:text-sm sm:tracking-normal ${meta.color}`}>
                    <span className="sm:hidden">{meta.shortLabel}</span>
                    <span className="hidden sm:inline">{meta.label}</span>
                  </p>
                  <p className="mt-1 hidden line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500 sm:block">
                    {meta.description}
                  </p>
                  <div className="mt-3 hidden items-center justify-between text-[10px] text-slate-400 sm:flex">
                    <span>{stat ? `${stat.active} đang dùng` : "Đang tải"}</span>
                    <span>
                      {stat
                        ? stat.amount > 0
                          ? formatVND(stat.amount)
                          : "Chưa phát sinh"
                        : "—"}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openCreateForm(group)}
                  disabled={
                    !hasLoadedCategorySnapshot || Boolean(categoriesLoadError)
                  }
                  className="mt-3 hidden w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
                >
                  <Plus size={12} />
                  Thêm vào nhóm
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-5">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 sm:left-4"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm danh mục..."
              disabled={!hasLoadedCategorySnapshot}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-base outline-none transition focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:pl-10 sm:pr-10 sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            disabled={!hasLoadedCategorySnapshot}
            className="relative inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
            aria-label="Mở bộ lọc danh mục"
          >
            <SlidersHorizontal size={16} />
            Lọc
            {activeFilterCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="hidden text-xs text-slate-500 sm:block">
            {hasLoadedCategorySnapshot ? (
              <>
                Hiển thị <b className="text-slate-800">{filteredCategories.length}</b>/
                {overview.total} danh mục
              </>
            ) : (
              "Đang tải dữ liệu..."
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500 sm:hidden">
          <span>
            {hasLoadedCategorySnapshot
              ? `${filteredCategories.length}/${overview.total} danh mục`
              : "Đang tải dữ liệu..."}
          </span>
          {(search || activeFilterCount > 0) && (
            <button
              type="button"
              onClick={resetFilters}
              className="font-bold text-blue-600"
            >
              Xóa lọc
            </button>
          )}
        </div>

        <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Loại"
            disabled={!hasLoadedCategorySnapshot}
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as TypeFilter)}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "income", label: "Thu nhập" },
              { value: "expense", label: "Chi tiêu" },
            ]}
          />
          <FilterSelect
            label="Loại danh mục"
            disabled={!hasLoadedCategorySnapshot}
            value={groupFilter}
            onChange={(value) => setGroupFilter(value as GroupFilter)}
            options={[
              { value: "all", label: "Tất cả nhóm" },
              ...GROUP_ORDER.map((group) => ({
                value: group,
                label: hasLoadedCategorySnapshot
                  ? `${GROUP_META[group].label} (${groupStats[group].count})`
                  : GROUP_META[group].label,
              })),
            ]}
          />
          <FilterSelect
            label="Trạng thái"
            disabled={!hasLoadedCategorySnapshot}
            value={activityFilter}
            onChange={(value) => setActivityFilter(value as ActivityFilter)}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "active", label: "Đang sử dụng" },
              { value: "inactive", label: "Chưa sử dụng" },
            ]}
          />
          <FilterSelect
            label="Sắp xếp"
            disabled={!hasLoadedCategorySnapshot}
            value={sortBy}
            onChange={(value) => setSortBy(value as SortOption)}
            options={[
              { value: "usage", label: "Dùng nhiều nhất" },
              { value: "amount", label: "Tổng tiền cao nhất" },
              { value: "name", label: "Tên A–Z" },
            ]}
          />
        </div>
      </section>

      {isFilterOpen && (
        <div className="fixed inset-0 z-90 flex items-end bg-slate-900/35 sm:hidden" role="presentation" onClick={() => setIsFilterOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bộ lọc danh mục"
            className="w-full rounded-t-4xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Bộ lọc danh mục</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} bộ lọc đang áp dụng`
                    : "Lọc và sắp xếp danh sách"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="flex size-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
                aria-label="Đóng bộ lọc"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-3">
              <FilterSelect
                label="Loại"
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as TypeFilter)}
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "income", label: "Thu nhập" },
                  { value: "expense", label: "Chi tiêu" },
                ]}
              />
              <FilterSelect
                label="Loại danh mục"
                value={groupFilter}
                onChange={(value) => setGroupFilter(value as GroupFilter)}
                options={[
                  { value: "all", label: "Tất cả nhóm" },
                  ...GROUP_ORDER.map((group) => ({
                    value: group,
                    label: `${GROUP_META[group].label} (${groupStats[group].count})`,
                  })),
                ]}
              />
              <FilterSelect
                label="Trạng thái"
                value={activityFilter}
                onChange={(value) => setActivityFilter(value as ActivityFilter)}
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "active", label: "Đang sử dụng" },
                  { value: "inactive", label: "Chưa sử dụng" },
                ]}
              />
              <FilterSelect
                label="Sắp xếp"
                value={sortBy}
                onChange={(value) => setSortBy(value as SortOption)}
                options={[
                  { value: "usage", label: "Dùng nhiều nhất" },
                  { value: "amount", label: "Tổng tiền cao nhất" },
                  { value: "name", label: "Tên A–Z" },
                ]}
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 flex-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="min-h-11 flex-1 rounded-2xl bg-blue-600 text-sm font-bold text-white"
              >
                Xem {filteredCategories.length} danh mục
              </button>
            </div>
          </div>
        </div>
      )}

      <section>
        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {filteredCategories.map((category) => {
            const meta = GROUP_META[category.group];
            return (
              <article
                key={category.id}
                className="group rounded-3xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:border-blue-200 hover:shadow-md sm:rounded-4xl sm:p-5 lg:hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm sm:size-11 sm:rounded-2xl ${meta.iconBg}`}
                    >
                      {category.group === "income" ? (
                        <Tag size={16} />
                      ) : (
                        <Folder size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="whitespace-nowrap text-[clamp(12px,3.6vw,14px)] font-black leading-5 tracking-[-0.025em] text-slate-900 sm:whitespace-normal sm:text-base sm:leading-tight sm:tracking-normal sm:wrap-anywhere">
                        {category.name}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:mt-1 sm:gap-1.5">
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 font-bold sm:px-2 ${meta.bg} ${meta.color} ${meta.border}`}
                        >
                          {meta.shortLabel}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${category.isActive ? "text-emerald-700" : "text-slate-400"}`}
                        >
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${category.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                          />
                          <span>
                            {category.isActive ? "Đang sử dụng" : "Chưa sử dụng"}
                          </span>
                        </span>
                        {category.isRecurring && (
                          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-cyan-700">
                            <Repeat2 size={10} />
                            Định kỳ
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <details className="relative shrink-0 sm:hidden">
                    <summary
                      className="flex size-8 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 text-slate-500 [&::-webkit-details-marker]:hidden"
                      aria-label={`Thao tác cho ${category.name}`}
                    >
                      <MoreHorizontal size={16} />
                    </summary>
                    <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => openEditForm(category)}
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Edit3 size={14} />
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category)}
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={14} />
                        Xóa
                      </button>
                    </div>
                  </details>

                  <div className="hidden shrink-0 gap-1.5 opacity-100 sm:flex lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditForm(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      aria-label={`Sửa ${category.name}`}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                      aria-label={`Xóa ${category.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4 border-t border-slate-100 pt-2.5 sm:mt-4 sm:grid-cols-2 sm:rounded-2xl sm:border-0 sm:bg-slate-50 sm:p-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Giao dịch
                    </p>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900 sm:text-xl">
                      {category.count}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Tổng tiền
                    </p>
                    <p
                      className={`mt-0.5 whitespace-nowrap text-xs font-black tabular-nums tracking-tight sm:text-base ${category.type === "income" ? "text-emerald-600" : category.total > 0 ? "text-slate-900" : "text-slate-300"}`}
                    >
                      {category.total > 0 ? formatVND(category.total) : "—"}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}

          {/* FINANCE-DATA-1B: an initial read failure must not present as
              "Không tìm thấy danh mục" with a misleading "clear filter" CTA. */}
          {!hasLoadedCategorySnapshot && isLoadingCategories && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 text-center sm:p-12 md:col-span-2 xl:col-span-3">
              <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                <Folder size={22} />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Đang tải dữ liệu danh mục...
              </h3>
            </div>
          )}

          {!hasLoadedCategorySnapshot &&
            !isLoadingCategories &&
            categoriesLoadError && (
              <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-8 text-center sm:p-12 md:col-span-2 xl:col-span-3">
                <div className="flex size-14 items-center justify-center rounded-3xl bg-rose-100 text-rose-500">
                  <Folder size={22} />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-700">
                  Không thể tải dữ liệu danh mục
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {categoriesLoadError}
                </p>
              </div>
            )}

          {hasLoadedCategorySnapshot && filteredCategories.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-8 text-center sm:p-12 md:col-span-2 xl:col-span-3">
                <div className="flex size-14 items-center justify-center rounded-3xl bg-blue-100 text-blue-500">
                  <Folder size={22} />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-800">
                  Không tìm thấy danh mục
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Thử đổi từ khóa hoặc xóa bộ lọc hiện tại.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
        </div>
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex min-h-0 items-stretch justify-center overflow-hidden bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-dvh min-h-0 w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa danh mục" : "Thêm danh mục"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Danh mục sẽ được dùng khi phân loại giao dịch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSubmitting}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              aria-busy={isSubmitting}
              className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain px-4 py-3 scroll-pb-[calc(6rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] sm:max-h-[calc(100dvh-8rem)] sm:p-6"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-black text-slate-700">
                  Tên danh mục
                </span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="VD: Ăn uống, Lương, Di chuyển..."
                  autoFocus
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base outline-none transition focus:border-blue-400 focus:bg-white sm:min-h-10 sm:text-sm"
                />
              </label>

              <div className="mt-3">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Loại danh mục
                </span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
                  {GROUP_ORDER.map((group) => {
                    const meta = GROUP_META[group];
                    const selected = form.group === group;
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            group,
                            type: getTypeFromGroup(group),
                          }))
                        }
                        className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition sm:flex-row sm:items-start sm:gap-3 sm:p-2.5 sm:text-left ${selected ? `${meta.border} ${meta.bg} ring-2 ring-blue-100` : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}
                      >
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-white ${meta.iconBg}`}
                        >
                          {group === "income" ? (
                            <Tag size={14} />
                          ) : (
                            <Folder size={14} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[11px] font-black sm:text-sm ${selected ? meta.color : "text-slate-700"}`}
                          >
                            {meta.label}
                          </span>
                          <span className="mt-0.5 hidden text-[11px] leading-4 text-slate-400 sm:block">
                            {meta.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-cyan-100 bg-cyan-50/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                      <Repeat2 size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        Khoản định kỳ
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        Bật để khoản này xuất hiện trong “Sắp đến hạn trong 30
                        ngày” trên Dashboard.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.isRecurring}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        isRecurring: !current.isRecurring,
                      }))
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      form.isRecurring ? "bg-cyan-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${
                        form.isRecurring ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {form.isRecurring && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700">
                        <Repeat2 size={13} /> Chu kỳ
                      </span>
                      <select
                        value={form.recurrence}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recurrence: event.target
                              .value as RecurrenceFrequency,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-base font-bold text-slate-700 outline-none focus:border-cyan-400 sm:text-sm"
                      >
                        <option value="daily">Hàng ngày</option>
                        <option value="weekly">Hàng tuần</option>
                        <option value="monthly">Hàng tháng</option>
                        <option value="yearly">Hàng năm</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-black text-slate-700">
                        Số tiền mặc định
                      </span>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(form.defaultAmount)}
                          onChange={(event) => {
                            const rawAmount = event.target.value.replace(
                              /\D/g,
                              "",
                            );

                            setForm((current) => ({
                              ...current,
                              defaultAmount: rawAmount,
                            }));
                          }}
                          placeholder="0"
                          autoComplete="off"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 pr-12 text-right text-base font-bold tabular-nums outline-none focus:border-cyan-400 sm:text-sm"
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                          ₫
                        </span>
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700">
                        <WalletCards size={13} /> Ví mặc định
                      </span>
                      <select
                        value={form.defaultWalletId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            defaultWalletId: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-base font-bold text-slate-700 outline-none focus:border-cyan-400 sm:text-sm"
                      >
                        <option value="">Chọn ví</option>
                        {wallets.map((wallet) => (
                          <option key={wallet.id} value={wallet.id}>
                            {wallet.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700">
                        <CalendarDays size={13} /> Ngày chạy tiếp theo
                      </span>
                      <input
                        type="date"
                        value={form.nextRunDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            nextRunDate: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-base outline-none focus:border-cyan-400 sm:text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>

              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />

              <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex shrink-0 gap-3 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mt-6 sm:border-t-0 sm:px-0 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSubmitting}
                  className="min-h-11 flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-11 flex-1 rounded-2xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-blue-400 disabled:shadow-none"
                >
                  {isSubmitting
                    ? "Đang lưu..."
                    : form.id
                      ? "Lưu thay đổi"
                      : "Thêm danh mục"}
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

function OverviewCardSkeleton() {
  return (
    <div
      className="h-[72px] min-w-[136px] snap-start animate-pulse rounded-2xl border border-slate-200 bg-slate-50 sm:h-[94px] sm:min-w-0 sm:rounded-3xl"
      aria-hidden="true"
    />
  );
}

function OverviewCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "income" | "expense" | "active" | "unused";
}) {
  const toneClass = {
    default: "border-blue-100 bg-blue-50 text-blue-700",
    income: "border-emerald-100 bg-emerald-50 text-emerald-700",
    expense: "border-orange-100 bg-orange-50 text-orange-700",
    active: "border-cyan-100 bg-cyan-50 text-cyan-700",
    unused: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];

  return (
    <div className={`min-w-[136px] snap-start rounded-2xl border p-3 sm:min-w-0 sm:rounded-3xl sm:p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-1.5 sm:gap-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.02em] opacity-70 sm:text-[10px] sm:tracking-wide">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-black tabular-nums sm:mt-1 sm:text-2xl">{value}</p>
        </div>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm sm:size-10 sm:rounded-2xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
