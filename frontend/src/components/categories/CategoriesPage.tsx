"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Folder,
  Layers3,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

import type {
  Category,
  CategoryPlanningGroup,
  CategoryType,
  Transaction,
} from "@/src/types/finance";

import {
  addCategory,
  deleteCategory,
  getCategories,
  getTransactions,
  updateCategory,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

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
};

const emptyForm: FormState = {
  name: "",
  type: "expense",
  group: "variable",
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

function inferCategoryGroup(
  category: Pick<Category, "name" | "type" | "planningGroup">,
): CategoryGroup | null {
  if (category.planningGroup === "income") return "income";
  if (category.planningGroup === "fixed") return "fixed";
  if (category.planningGroup === "variable") return "variable";
  if (
    category.planningGroup === "saving" ||
    category.planningGroup === "investment"
  ) {
    return null;
  }
  if (category.type === "income") return "income";

  const name = normalizeText(category.name);
  if (
    [
      "tiet kiem",
      "quy khan cap",
      "du phong",
      "saving",
      "trading",
      "capital",
      "dau tu",
      "co phieu",
      "crypto",
      "etf",
      "vang",
    ].some((keyword) => name.includes(keyword))
  ) {
    return null;
  }
  if (
    [
      "nha",
      "dien",
      "nuoc",
      "internet",
      "wifi",
      "bao hiem",
      "hoc phi",
      "tra gop",
      "vay",
      "phi",
    ].some((keyword) => name.includes(keyword))
  ) {
    return "fixed";
  }
  return "variable";
}

function getTypeFromGroup(group: CategoryGroup): CategoryType {
  return group === "income" ? "income" : "expense";
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    const [categoryData, transactionData] = await Promise.all([
      getCategories(),
      getTransactions(),
    ]);
    setCategories(categoryData);
    setTransactions(transactionData);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void reloadData(), 0);
    return () => window.clearTimeout(timer);
  }, [reloadData]);

  useRealtimeTable(["categories", "transactions"], reloadData);

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

  const enrichedCategories = useMemo(
    () =>
      categories.flatMap((category) => {
        const group = inferCategoryGroup(category);
        if (!group) return [];
        const usage = transactionSummaryByCategory.get(category.id) ?? {
          count: 0,
          total: 0,
        };
        return [
          {
            ...category,
            group,
            count: usage.count,
            total: usage.total,
            isActive: usage.count > 0,
          },
        ];
      }),
    [categories, transactionSummaryByCategory],
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

  const hasActiveFilters =
    search.trim().length > 0 ||
    typeFilter !== "all" ||
    groupFilter !== "all" ||
    activityFilter !== "all" ||
    sortBy !== "usage";

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setGroupFilter("all");
    setActivityFilter("all");
    setSortBy("usage");
  }

  function openCreateForm(group: CategoryGroup = "variable") {
    setSaveError(null);
    setForm({
      name: "",
      group,
      type: getTypeFromGroup(group),
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
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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

    const category: Category = {
      id: form.id ?? crypto.randomUUID(),
      name,
      type: getTypeFromGroup(form.group),
      planningGroup: form.group,
    };

    setSaveError(null);
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
  }

  function handleDelete(category: Category) {
    const usage = transactionSummaryByCategory.get(category.id);
    if ((usage?.count ?? 0) > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa “${category.name}” vì đang có ${usage?.count ?? 0} giao dịch liên kết.`,
      });
      return;
    }

    setPendingAction({
      title: `Xóa danh mục “${category.name}”?`,
      description:
        "Danh mục chưa có giao dịch và sẽ bị xóa vĩnh viễn khỏi tài khoản.",
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
    <div className="space-y-5 overflow-x-hidden pb-24 md:pb-0">
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">
              Category Management
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
              Danh mục thu chi
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Tạo và quản lý danh mục thu nhập, chi phí cố định và chi phí biến
              đổi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateForm("variable")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/70 transition hover:bg-blue-700 active:scale-95"
          >
            <Plus size={17} />
            Thêm danh mục
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        </div>
      </section>

      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              Loại danh mục
            </h2>
            <p className="text-xs text-slate-500">
              Chọn một loại để lọc nhanh hoặc tạo danh mục giao dịch mới.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {GROUP_ORDER.map((group) => {
            const meta = GROUP_META[group];
            const stat = groupStats[group];
            const selected = groupFilter === group;
            return (
              <div
                key={group}
                className={
                  "rounded-3xl border p-4 transition " +
                  (selected
                    ? `${meta.border} ${meta.bg} ring-2 ring-blue-100`
                    : "border-slate-200 bg-white hover:border-blue-200")
                }
              >
                <button
                  type="button"
                  onClick={() => setGroupFilter(selected ? "all" : group)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex size-9 items-center justify-center rounded-2xl text-white ${meta.iconBg}`}
                    >
                      {group === "income" ? (
                        <Tag size={16} />
                      ) : (
                        <Folder size={16} />
                      )}
                    </div>
                    <span className="text-2xl font-black text-slate-900">
                      {stat.count}
                    </span>
                  </div>
                  <p className={`mt-3 text-sm font-black ${meta.color}`}>
                    {meta.label}
                  </p>
                  <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500">
                    {meta.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{stat.active} đang dùng</span>
                    <span>
                      {stat.amount > 0
                        ? formatVND(stat.amount)
                        : "Chưa phát sinh"}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openCreateForm(group)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Plus size={12} />
                  Thêm vào nhóm
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-4xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm danh mục..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
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
          <div className="text-xs text-slate-500">
            Hiển thị{" "}
            <b className="text-slate-800">{filteredCategories.length}</b>/
            {overview.total} danh mục
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </section>

      <section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCategories.map((category) => {
            const meta = GROUP_META[category.group];
            return (
              <article
                key={category.id}
                className="group rounded-4xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${meta.iconBg}`}
                    >
                      {category.group === "income" ? (
                        <Tag size={18} />
                      ) : (
                        <Folder size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {category.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.color} ${meta.border}`}
                        >
                          {meta.shortLabel}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${category.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}
                        >
                          {category.isActive ? "Đang sử dụng" : "Chưa sử dụng"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
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

                <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Giao dịch
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {category.count}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Tổng tiền
                    </p>
                    <p
                      className={`mt-1 truncate text-sm font-black ${category.type === "income" ? "text-emerald-600" : category.total > 0 ? "text-slate-900" : "text-slate-300"}`}
                    >
                      {category.total > 0 ? formatVND(category.total) : "—"}
                    </p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-1 text-xs text-slate-500">
                  {meta.description}
                </p>
              </article>
            );
          })}

          {filteredCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
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
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:rounded-4xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
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
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200"
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-5 sm:p-6"
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </label>

              <div className="mt-5">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Loại danh mục
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
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
                        className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${selected ? `${meta.border} ${meta.bg} ring-2 ring-blue-100` : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}
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
                            className={`block text-sm font-black ${selected ? meta.color : "text-slate-700"}`}
                          >
                            {meta.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">
                            {meta.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98]"
                >
                  {form.id ? "Lưu thay đổi" : "Thêm danh mục"}
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
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
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
