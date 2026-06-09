"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { SaveError } from "@/src/components/ui/SaveError";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Edit3,
  Folder,
  Lightbulb,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";

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
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  type: CategoryType;
  group: CategoryGroup;
};

const emptyForm: FormState = { name: "", type: "expense", group: "variable" };

type ActivityFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "income" | "expense";
type CategoryGroup = CategoryPlanningGroup;
type GroupFilter = "all" | CategoryGroup;

function getTypeFromGroup(group: CategoryGroup): CategoryType {
  return group === "income" ? "income" : "expense";
}

type GroupMeta = {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  bar: string;
};

const GROUP_META: Record<CategoryGroup, GroupMeta> = {
  income: {
    label: "Thu nhập",
    shortLabel: "Thu nhập",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    bar: "#10b981",
  },
  fixed: {
    label: "Chi phí cố định",
    shortLabel: "Cố định",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    bar: "#6366f1",
  },
  variable: {
    label: "Chi phí biến đổi",
    shortLabel: "Biến đổi",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-100",
    bar: "#f97316",
  },
  saving: {
    label: "Tiết kiệm",
    shortLabel: "Tiết kiệm",
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-100",
    bar: "#06b6d4",
  },
  investment: {
    label: "Đầu tư",
    shortLabel: "Đầu tư",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-100",
    bar: "#8b5cf6",
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
): CategoryGroup {
  if (category.planningGroup) return category.planningGroup;
  if (category.type === "income") return "income";

  const name = normalizeText(category.name);

  const investmentKeywords = [
    "trading",
    "capital",
    "dau tu",
    "co phieu",
    "chung khoan",
    "crypto",
    "coin",
    "etf",
    "vang",
    "quy",
  ];
  if (investmentKeywords.some((keyword) => name.includes(keyword))) {
    return "investment";
  }

  const savingKeywords = [
    "tiet kiem",
    "quy khan cap",
    "du phong",
    "saving",
    "emergency",
  ];
  if (savingKeywords.some((keyword) => name.includes(keyword))) {
    return "saving";
  }

  const fixedKeywords = [
    "nha",
    "thue nha",
    "phong tro",
    "dien",
    "nuoc",
    "internet",
    "wifi",
    "quan ly",
    "gui xe",
    "bao hiem",
    "hoc phi",
    "con cai",
    "sua",
    "ta",
    "y te",
    "thuoc",
    "tra gop",
    "vay",
    "phi",
  ];
  if (fixedKeywords.some((keyword) => name.includes(keyword))) {
    return "fixed";
  }

  return "variable";
}

function getGroupAmount(
  transactions: Transaction[],
  categories: Category[],
  group: CategoryGroup,
) {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  return transactions.reduce((sum, transaction) => {
    const category = categoryById.get(transaction.categoryId);
    if (!category) return sum;
    if (inferCategoryGroup(category) !== group) return sum;
    return sum + transaction.amount;
  }, 0);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<CategoryType>("expense");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  // NEW: filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  async function reloadData() {
    const [c, t] = await Promise.all([getCategories(), getTransactions()]);
    setCategories(c);
    setTransactions(t);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  useRealtimeTable(["categories", "transactions"], reloadData);

  // ── PRESERVED: stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const incomeCategories = categories.filter((c) => c.type === "income");
    const expenseCategories = categories.filter((c) => c.type === "expense");
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const fixedExpense = getGroupAmount(transactions, categories, "fixed");
    const variableExpense = getGroupAmount(
      transactions,
      categories,
      "variable",
    );
    const savingAmount = getGroupAmount(transactions, categories, "saving");
    const investmentAmount = getGroupAmount(
      transactions,
      categories,
      "investment",
    );
    const savingAndInvestment = savingAmount + investmentAmount;

    return {
      incomeCount: incomeCategories.length,
      expenseCount: expenseCategories.length,
      totalIncome,
      totalExpense,
      fixedExpense,
      variableExpense,
      savingAmount,
      investmentAmount,
      savingAndInvestment,
      fixedRatio:
        totalIncome > 0 ? Math.round((fixedExpense / totalIncome) * 100) : 0,
      variableRatio:
        totalIncome > 0 ? Math.round((variableExpense / totalIncome) * 100) : 0,
      savingInvestmentRatio:
        totalIncome > 0
          ? Math.round((savingAndInvestment / totalIncome) * 100)
          : 0,
    };
  }, [categories, transactions]);

  // ── PRESERVED: getCategoryUsage ───────────────────────────────────────────
  function getCategoryUsage(categoryId: string) {
    const related = transactions.filter((t) => t.categoryId === categoryId);
    return {
      count: related.length,
      total: related.reduce((s, t) => s + t.amount, 0),
    };
  }

  // ── NEW: per-category enriched data ───────────────────────────────────────
  const enriched = useMemo(
    () =>
      categories.map((c) => {
        const usage = getCategoryUsage(c.id);
        const group = inferCategoryGroup(c);
        const groupTotal =
          group === "income"
            ? stats.totalIncome
            : group === "fixed"
              ? stats.fixedExpense
              : group === "variable"
                ? stats.variableExpense
                : group === "saving"
                  ? stats.savingAmount
                  : stats.investmentAmount;
        const typeTotal =
          c.type === "income" ? stats.totalIncome : stats.totalExpense;
        const pct =
          typeTotal > 0 ? Math.round((usage.total / typeTotal) * 100) : 0;
        const groupPct =
          groupTotal > 0 ? Math.round((usage.total / groupTotal) * 100) : 0;
        const status: "high" | "active" | "inactive" =
          usage.count >= 10 ? "high" : usage.count > 0 ? "active" : "inactive";
        return { ...c, ...usage, group, groupPct, pct, status };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, transactions, stats],
  );

  // ── NEW: active category count ────────────────────────────────────────────
  const activeCount = useMemo(
    () => enriched.filter((c) => c.count > 0).length,
    [enriched],
  );

  const groupStats = useMemo(() => {
    const base = {
      income: { count: 0, amount: stats.totalIncome },
      fixed: { count: 0, amount: stats.fixedExpense },
      variable: { count: 0, amount: stats.variableExpense },
      saving: { count: 0, amount: stats.savingAmount },
      investment: { count: 0, amount: stats.investmentAmount },
    } satisfies Record<CategoryGroup, { count: number; amount: number }>;

    for (const category of enriched) {
      base[category.group].count += 1;
    }

    return base;
  }, [enriched, stats]);

  const planningScore = useMemo(() => {
    const fixedScore =
      stats.fixedRatio <= 40
        ? 100
        : stats.fixedRatio <= 55
          ? 75
          : stats.fixedRatio <= 70
            ? 45
            : 20;
    const variableScore =
      stats.variableRatio <= 35
        ? 100
        : stats.variableRatio <= 50
          ? 70
          : stats.variableRatio <= 65
            ? 45
            : 20;
    const savingScore =
      stats.savingInvestmentRatio >= 30
        ? 100
        : stats.savingInvestmentRatio >= 20
          ? 80
          : stats.savingInvestmentRatio >= 10
            ? 50
            : 20;
    const hygieneScore =
      categories.length > 0
        ? Math.round((activeCount / categories.length) * 100)
        : 0;

    return Math.round(
      fixedScore * 0.3 +
        variableScore * 0.25 +
        savingScore * 0.3 +
        hygieneScore * 0.15,
    );
  }, [activeCount, categories.length, stats]);

  const healthScore = planningScore;
  const healthGrade =
    healthScore >= 80
      ? { gradient: "from-indigo-500 to-indigo-600", label: "Xuất sắc" }
      : healthScore >= 60
        ? { gradient: "from-emerald-500 to-teal-500", label: "Tốt" }
        : healthScore >= 45
          ? { gradient: "from-amber-400 to-orange-500", label: "Trung bình" }
          : { gradient: "from-rose-500 to-red-500", label: "Cần tối ưu" };

  // ── NEW: filtered cards ───────────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    return enriched
      .filter((c) => {
        if (typeFilter !== "all" && c.type !== typeFilter) return false;
        if (groupFilter !== "all" && c.group !== groupFilter) return false;
        if (activityFilter === "active" && c.count === 0) return false;
        if (activityFilter === "inactive" && c.count > 0) return false;
        if (search && !c.name.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [enriched, typeFilter, groupFilter, activityFilter, search]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    typeFilter !== "all" ||
    groupFilter !== "all" ||
    activityFilter !== "all";

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setGroupFilter("all");
    setActivityFilter("all");
  }

  // ── NEW: top categories by type ───────────────────────────────────────────
  const topExpense = useMemo(
    () =>
      enriched
        .filter((c) => c.type === "expense" && c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [enriched],
  );
  const topIncome = useMemo(
    () =>
      enriched
        .filter((c) => c.type === "income" && c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [enriched],
  );

  const controllableRisk = useMemo(
    () =>
      enriched
        .filter((c) => c.group === "variable" && c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
    [enriched],
  );

  // ── NEW: AI insights ──────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const out: {
      tone: "good" | "info" | "warning";
      title: string;
      body: string;
    }[] = [];
    const inactive = enriched.filter((c) => c.count === 0);
    const rare = enriched.filter((c) => c.count === 1 || c.count === 2);
    const highUse = enriched.filter((c) => c.status === "high");

    out.push({
      tone:
        stats.fixedRatio <= 40
          ? "good"
          : stats.fixedRatio <= 55
            ? "info"
            : "warning",
      title: "Chi phí cố định " + stats.fixedRatio + "% thu nhập",
      body:
        stats.fixedRatio <= 40
          ? "Cấu trúc cố định đang an toàn. Bạn còn đủ linh hoạt để tiết kiệm và xử lý biến động."
          : stats.fixedRatio <= 55
            ? "Chi phí cố định ở mức cần theo dõi. Hạn chế thêm cam kết cố định mới."
            : "Chi phí cố định cao. Nên rà soát nhà ở, điện nước, phí quản lý hoặc các khoản định kỳ.",
    });

    out.push({
      tone:
        stats.savingInvestmentRatio >= 30
          ? "good"
          : stats.savingInvestmentRatio >= 20
            ? "info"
            : "warning",
      title: "Tiết kiệm & đầu tư " + stats.savingInvestmentRatio + "%",
      body:
        stats.savingInvestmentRatio >= 30
          ? "Bạn đang phân bổ tốt cho tương lai. Có thể ưu tiên quỹ khẩn cấp hoặc đầu tư dài hạn."
          : stats.savingInvestmentRatio >= 20
            ? "Đạt chuẩn 20%. Duy trì đều đặn sẽ giúp cải thiện sức khỏe tài chính."
            : "Tỷ lệ tiết kiệm còn thấp. Cân nhắc giảm nhóm chi phí biến đổi trước.",
    });

    if (controllableRisk.length > 0) {
      out.push({
        tone: "warning",
        title: "Danh mục biến đổi cần theo dõi",
        body:
          controllableRisk
            .map((c) => c.name + " " + formatVND(c.total))
            .join(" · ") +
          " — Đây là nhóm có thể kiểm soát tốt nhất trong tháng.",
      });
    }

    if (inactive.length > 0) {
      out.push({
        tone: "warning",
        title: inactive.length + " danh mục chưa sử dụng",
        body:
          inactive
            .map((c) => c.name)
            .slice(0, 5)
            .join(", ") + " — Cân nhắc ẩn hoặc gộp để giữ danh sách gọn gàng.",
      });
    }
    if (rare.length > 0) {
      out.push({
        tone: "warning",
        title: rare.length + " danh mục ít dùng",
        body:
          rare
            .map((c) => c.name)
            .slice(0, 4)
            .join(", ") +
          " — Chỉ có 1–2 giao dịch, kiểm tra lại có cần thiết không.",
      });
    }
    for (const c of highUse.slice(0, 2)) {
      out.push({
        tone: "info",
        title: "Danh mục hoạt động cao · " + c.name,
        body:
          c.count +
          " giao dịch, tổng " +
          formatVND(c.total) +
          ". Đây là danh mục quan trọng trong chi tiêu của bạn.",
      });
    }
    if (stats.incomeCount === 0) {
      out.push({
        tone: "warning",
        title: "Chưa có danh mục thu nhập",
        body: "Hãy tạo ít nhất một danh mục thu nhập để phân loại các khoản tiền vào.",
      });
    }
    return out.slice(0, 5);
  }, [
    enriched,
    controllableRisk,
    stats.fixedRatio,
    stats.savingInvestmentRatio,
    stats.incomeCount,
  ]);

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm(type: CategoryType = activeTab) {
    const group: CategoryGroup = type === "income" ? "income" : "variable";
    setForm({ name: "", type, group });
    setIsFormOpen(true);
  }

  function openEditForm(category: Category) {
    const group = inferCategoryGroup(category);
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
    if (!form.name.trim()) {
      setSaveError("Vui lòng nhập tên danh mục");
      return;
    }
    const category: Category = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
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
    setActiveTab(category.type);
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  function handleDelete(category: Category) {
    const usage = getCategoryUsage(category.id);
    if (usage.count > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa danh mục “${category.name}” vì đang có ${usage.count} giao dịch liên kết. Hãy phân loại lại các giao dịch trước.`,
      });
      return;
    }
    setPendingAction({
      title: `Xóa danh mục “${category.name}”?`,
      description:
        "Hành động này không thể hoàn tác. Danh mục sẽ bị xóa khỏi tài khoản.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteCategory(category.id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa danh mục: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa danh mục thành công." });
        await reloadData();
      },
    });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 overflow-x-hidden pb-24 md:space-y-6 md:pb-0">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-4xl border border-blue-100 shadow-sm">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Category Intelligence
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Danh mục thu chi
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Phân loại thu nhập, chi phí cố định, chi phí biến đổi, tiết kiệm
                và đầu tư.
              </p>
            </div>
            <button
              onClick={() => openCreateForm(activeTab)}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={17} />
              Thêm danh mục
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Chi phí cố định"
              value={stats.fixedRatio + "%"}
              sub={formatVND(stats.fixedExpense) + " / thu nhập"}
              gradient="from-indigo-500 to-indigo-600"
              iconBg="bg-indigo-400/30"
              icon={<Folder size={16} />}
            />
            <KpiCard
              label="Chi phí biến đổi"
              value={stats.variableRatio + "%"}
              sub={formatVND(stats.variableExpense) + " có thể kiểm soát"}
              gradient="from-orange-400 to-rose-500"
              iconBg="bg-white/20"
              icon={<ArrowDownRight size={16} />}
            />
            <KpiCard
              label="Tiết kiệm & đầu tư"
              value={stats.savingInvestmentRatio + "%"}
              sub={formatVND(stats.savingAndInvestment) + " cho tương lai"}
              gradient="from-cyan-500 to-blue-600"
              iconBg="bg-cyan-400/30"
              icon={<ArrowUpRight size={16} />}
            />
            <KpiCard
              label="Đang hoạt động"
              value={String(activeCount)}
              sub={
                categories.length +
                " danh mục · " +
                (categories.length - activeCount) +
                " chưa dùng"
              }
              gradient="from-emerald-500 to-teal-500"
              iconBg="bg-emerald-400/30"
              icon={<Zap size={16} />}
            />
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-linear-to-br p-4 shadow-sm " +
                healthGrade.gradient
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Planning Health
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {healthScore}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(healthScore, 100) + "%" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">
                {healthGrade.label}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Financial Planning Structure
          ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-cyan-500 text-white shadow-sm shadow-blue-100">
                <Sparkles size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Cấu trúc tài chính
                </h2>
                <p className="text-xs text-slate-500">
                  Phân bổ theo fixed cost · variable cost · saving/investment
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-right">
              <p className="text-[10px] font-black uppercase text-slate-400">
                Thu nhập
              </p>
              <p className="text-sm font-black text-slate-900">
                {formatVND(stats.totalIncome)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                key: "fixed" as CategoryGroup,
                ratio: stats.fixedRatio,
                amount: stats.fixedExpense,
                target: "An toàn: < 40%",
              },
              {
                key: "variable" as CategoryGroup,
                ratio: stats.variableRatio,
                amount: stats.variableExpense,
                target: "Nên giữ: 20–35%",
              },
              {
                key: "investment" as CategoryGroup,
                ratio: stats.savingInvestmentRatio,
                amount: stats.savingAndInvestment,
                target: "Tốt: ≥ 20%",
              },
            ].map((item) => {
              const meta =
                item.key === "investment"
                  ? GROUP_META.investment
                  : GROUP_META[item.key];
              const status =
                item.key === "fixed"
                  ? item.ratio <= 40
                    ? "Tốt"
                    : item.ratio <= 55
                      ? "Theo dõi"
                      : "Rủi ro"
                  : item.key === "variable"
                    ? item.ratio <= 35
                      ? "Ổn"
                      : item.ratio <= 50
                        ? "Theo dõi"
                        : "Cao"
                    : item.ratio >= 30
                      ? "Rất tốt"
                      : item.ratio >= 20
                        ? "Đạt chuẩn"
                        : "Cần tăng";

              return (
                <div
                  key={item.key}
                  className={
                    "rounded-2xl border p-4 " + meta.bg + " " + meta.border
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={"text-xs font-black " + meta.color}>
                      {meta.label}
                    </p>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black text-slate-500">
                      {status}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-900">
                    {item.ratio}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatVND(item.amount)}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: Math.min(item.ratio, 100) + "%",
                        background: meta.bar,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-slate-400">
                    {item.target}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-sm shadow-rose-100">
              <AlertTriangle size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Top kiểm soát
              </h2>
              <p className="text-xs text-slate-500">Ưu tiên chi phí biến đổi</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {controllableRisk.length > 0 ? (
              controllableRisk.map((category, index) => (
                <div key={category.id} className="rounded-2xl bg-rose-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {index + 1}. {category.name}
                      </p>
                      <p className="mt-0.5 text-xs text-rose-600">
                        {category.count} giao dịch · {formatVND(category.total)}
                      </p>
                    </div>
                    <p className="text-sm font-black text-rose-600">
                      {category.groupPct}%
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                Chưa có chi phí biến đổi đáng kể trong kỳ này.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Category Analytics (Top Spenders + Earners)
          ══════════════════════════════════════════════════════════════════ */}
      {(topExpense.length > 0 || topIncome.length > 0) && (
        <section className="grid gap-5 xl:grid-cols-2">
          {/* Top expense */}
          {topExpense.length > 0 && (
            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-sm shadow-rose-100">
                  <ArrowDownRight size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Top chi tiêu
                  </h2>
                  <p className="text-xs text-slate-500">
                    Danh mục chi nhiều nhất
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {topExpense.map((c, i) => {
                  const shade =
                    ["#f43f5e", "#f97316", "#fb923c", "#fca5a5", "#fecdd3"][
                      i
                    ] ?? "#f43f5e";
                  return (
                    <div key={c.id}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex size-5 items-center justify-center rounded-lg text-[10px] font-black text-white"
                            style={{ background: shade }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-bold text-slate-700">
                            {c.name}
                          </span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            {c.count} gd
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-rose-600">
                            {c.pct}%
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatVND(c.total)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: c.pct + "%", background: shade }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top income */}
          {topIncome.length > 0 && (
            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-100">
                  <ArrowUpRight size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Top thu nhập
                  </h2>
                  <p className="text-xs text-slate-500">
                    Danh mục thu nhiều nhất
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {topIncome.map((c, i) => {
                  const shade =
                    ["#10b981", "#06b6d4", "#22c55e", "#86efac", "#bbf7d0"][
                      i
                    ] ?? "#10b981";
                  return (
                    <div key={c.id}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex size-5 items-center justify-center rounded-lg text-[10px] font-black text-white"
                            style={{ background: shade }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-bold text-slate-700">
                            {c.name}
                          </span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            {c.count} gd
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-600">
                            {c.pct}%
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatVND(c.total)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: c.pct + "%", background: shade }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Smart Category Insights
          ══════════════════════════════════════════════════════════════════ */}
      {insights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">Smart Insights</p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              {insights.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight, i) => {
              const styles = {
                good: {
                  card: "border-emerald-200 bg-emerald-50",
                  icon: "bg-emerald-100 text-emerald-600",
                  title: "text-emerald-800",
                  body: "text-emerald-700",
                  Icon: Sparkles,
                },
                info: {
                  card: "border-blue-200 bg-blue-50",
                  icon: "bg-blue-100 text-blue-600",
                  title: "text-blue-800",
                  body: "text-blue-700",
                  Icon: Lightbulb,
                },
                warning: {
                  card: "border-amber-200 bg-amber-50",
                  icon: "bg-amber-100 text-amber-600",
                  title: "text-amber-800",
                  body: "text-amber-700",
                  Icon: AlertTriangle,
                },
              };
              const s = styles[insight.tone];
              return (
                <div key={i} className={"rounded-2xl border p-4 " + s.card}>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={
                        "flex size-7 shrink-0 items-center justify-center rounded-xl " +
                        s.icon
                      }
                    >
                      <s.Icon size={13} />
                    </div>
                    <p className={"text-xs font-black " + s.title}>
                      {insight.title}
                    </p>
                  </div>
                  <p className={"text-xs leading-5 " + s.body}>
                    {insight.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Search + Filters + Category Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Filter bar V9.3 · compact dropdown filters */}
        <div className="mb-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm danh mục..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:shadow-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-700">
                  Hiển thị {filteredCategories.length} danh mục
                </span>
                <span>•</span>
                <span>{stats.incomeCount} thu nhập</span>
                <span>•</span>
                <span>{stats.expenseCount} chi tiêu</span>
                {hasActiveFilters && (
                  <>
                    <span>•</span>
                    <button
                      onClick={resetFilters}
                      className="font-bold text-blue-600 hover:text-blue-700"
                    >
                      Xóa bộ lọc
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FilterSelect
                label="Loại danh mục"
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as TypeFilter)}
                options={[
                  { value: "all", label: `Tất cả (${categories.length})` },
                  { value: "income", label: `Thu nhập (${stats.incomeCount})` },
                  {
                    value: "expense",
                    label: `Chi tiêu (${stats.expenseCount})`,
                  },
                ]}
              />

              <FilterSelect
                label="Phân loại tài chính"
                value={groupFilter}
                onChange={(value) => setGroupFilter(value as GroupFilter)}
                options={[
                  { value: "all", label: `Tất cả (${categories.length})` },
                  {
                    value: "fixed",
                    label: `Cố định (${groupStats.fixed.count})`,
                  },
                  {
                    value: "variable",
                    label: `Biến đổi (${groupStats.variable.count})`,
                  },
                  {
                    value: "saving",
                    label: `Tiết kiệm (${groupStats.saving.count})`,
                  },
                  {
                    value: "investment",
                    label: `Đầu tư (${groupStats.investment.count})`,
                  },
                ]}
              />

              <FilterSelect
                label="Trạng thái"
                value={activityFilter}
                onChange={(value) => setActivityFilter(value as ActivityFilter)}
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "active", label: "Đang dùng" },
                  { value: "inactive", label: "Chưa dùng" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCategories.map((category) => {
            const isIncome = category.type === "income";
            const isHigh = category.status === "high";
            const isInactive = category.status === "inactive";

            const statusBadge = isHigh
              ? "bg-blue-100 text-blue-700 border-blue-200"
              : isInactive
                ? "bg-slate-100 text-slate-500 border-slate-200"
                : isIncome
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-rose-100 text-rose-600 border-rose-200";
            const statusLabel = isHigh
              ? "Hoạt động cao"
              : isInactive
                ? "Chưa sử dụng"
                : "Đang dùng";

            const groupMeta = GROUP_META[category.group];
            const typePill =
              groupMeta.bg + " " + groupMeta.color + " " + groupMeta.border;

            const barColor = groupMeta.bar;

            return (
              <div
                key={category.id}
                className={
                  "group rounded-4xl border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " +
                  (isHigh
                    ? "border-blue-100"
                    : isInactive
                      ? "border-slate-100"
                      : isIncome
                        ? "border-emerald-100"
                        : "border-rose-100")
                }
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon type={category.type} group={category.group} />
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {category.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            typePill
                          }
                        >
                          {groupMeta.shortLabel}
                        </span>
                        <span
                          className={
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            statusBadge
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEditForm(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 2-col mini stats */}
                <div className="mt-5 grid grid-cols-1 gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2">
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Giao dịch
                    </p>
                    <p
                      className={
                        "mt-0.5 text-lg font-black " +
                        (category.count > 0
                          ? "text-slate-900"
                          : "text-slate-300")
                      }
                    >
                      {category.count}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Tổng tiền
                    </p>
                    <p
                      className={
                        "mt-0.5 text-sm font-black " +
                        (isIncome
                          ? "text-emerald-600"
                          : category.total > 0
                            ? "text-rose-600"
                            : "text-slate-300")
                      }
                    >
                      {category.total > 0
                        ? category.total >= 1_000_000
                          ? Math.round(category.total / 1_000_000) + "M"
                          : Math.round(category.total / 1_000) + "K"
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Usage bar */}
                {category.total > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Tỷ trọng nhóm</span>
                      <span className="font-black text-slate-700">
                        {category.groupPct}%
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: category.groupPct + "%",
                          background: barColor,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Mobile edit row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(category)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-100 py-2 text-xs font-bold text-rose-500"
                  >
                    <Trash2 size={12} />
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Folder size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                {search ? "Không tìm thấy danh mục" : "Chưa có danh mục nào"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                {search
                  ? "Thử từ khoá khác hoặc bỏ bộ lọc."
                  : "Tạo danh mục đầu tiên để phân loại giao dịch."}
              </p>
              {!search && (
                <button
                  onClick={() => openCreateForm(activeTab)}
                  className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                >
                  <Plus size={15} />
                  Thêm danh mục
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:rounded-4xl"
            style={{
              maxHeight:
                "calc(var(--app-height, 100dvh) - env(safe-area-inset-top) - 8px)",
            }}
          >
            {/* Modal header */}
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 p-4 pb-4 sm:p-6 sm:pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa danh mục" : "Thêm danh mục"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Danh mục sẽ được dùng khi thêm giao dịch.
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
                {/* Name input */}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-slate-700">
                    Tên danh mục
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="VD: Ăn uống, Lương, Di chuyển..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                  />
                </label>

                {/* Financial group selector */}
                <div>
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Nhóm tài chính
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          group: "income" as CategoryGroup,
                          icon: <ArrowUpRight size={15} />,
                          description: "Lương, thưởng, thu nhập khác",
                        },
                        {
                          group: "fixed" as CategoryGroup,
                          icon: <Folder size={15} />,
                          description: "Nhà ở, điện, nước, phí định kỳ",
                        },
                        {
                          group: "variable" as CategoryGroup,
                          icon: <ArrowDownRight size={15} />,
                          description: "Ăn uống, mua sắm, giải trí",
                        },
                        {
                          group: "saving" as CategoryGroup,
                          icon: <Sparkles size={15} />,
                          description: "Quỹ khẩn cấp, tiết kiệm dài hạn",
                        },
                        {
                          group: "investment" as CategoryGroup,
                          icon: <ArrowUpRight size={15} />,
                          description: "Trading, cổ phiếu, ETF, vàng",
                        },
                      ] as const
                    ).map((option) => {
                      const meta = GROUP_META[option.group];
                      const selected = form.group === option.group;
                      return (
                        <button
                          key={option.group}
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              group: option.group,
                              type: getTypeFromGroup(option.group),
                            }))
                          }
                          className={
                            "flex items-start gap-3 rounded-2xl border p-3 text-left transition-all " +
                            (selected
                              ? meta.border +
                                " " +
                                meta.bg +
                                " shadow-sm ring-2 ring-blue-100"
                              : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40")
                          }
                        >
                          <span
                            className={
                              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl " +
                              (selected
                                ? meta.bg + " " + meta.color
                                : "bg-slate-100 text-slate-500")
                            }
                          >
                            {option.icon}
                          </span>
                          <span className="min-w-0">
                            <span
                              className={
                                "block text-sm font-black " +
                                (selected ? meta.color : "text-slate-700")
                              }
                            >
                              {meta.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 rounded-2xl bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-700">
                    Nhóm này sẽ được lưu vào Supabase và dùng trực tiếp cho AI
                    Budget, Dashboard, 50/30/20, chi phí cố định và Planning
                    Health.
                  </p>
                </div>
              </div>

              {/* Actions */}
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
                  className={
                    "flex-1 rounded-2xl py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[.98] " +
                    (form.type === "income"
                      ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:shadow-sm"
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

function KpiCard({
  label,
  value,
  sub,
  gradient,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={"rounded-2xl bg-linear-to-br p-4 shadow-sm " + gradient}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
          {label}
        </p>
        <div
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-lg text-white " +
            iconBg
          }
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-white/70">{sub}</p>
    </div>
  );
}

function CategoryIcon({
  type,
  group,
}: {
  type: CategoryType;
  group?: CategoryGroup;
}) {
  const resolvedGroup = group ?? (type === "income" ? "income" : "variable");
  const className =
    resolvedGroup === "income"
      ? "bg-linear-to-br from-emerald-500 to-teal-400"
      : resolvedGroup === "fixed"
        ? "bg-linear-to-br from-indigo-500 to-blue-500"
        : resolvedGroup === "investment"
          ? "bg-linear-to-br from-violet-500 to-purple-500"
          : resolvedGroup === "saving"
            ? "bg-linear-to-br from-cyan-500 to-blue-500"
            : "bg-linear-to-br from-rose-500 to-orange-400";
  return (
    <div
      className={
        "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm " +
        className
      }
    >
      {resolvedGroup === "income" ? <Tag size={20} /> : <Folder size={20} />}
    </div>
  );
}
