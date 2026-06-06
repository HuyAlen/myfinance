"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
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

import type { Category, CategoryType, Transaction } from "@/src/types/finance";

import {
  addCategory,
  deleteCategory,
  getCategories,
  getTransactions,
  initFinanceDemoData,
  updateCategory,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  type: CategoryType;
};

const emptyForm: FormState = { name: "", type: "expense" };

type ActivityFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "income" | "expense";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<CategoryType>("expense");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // NEW: filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  async function reloadData() {
    const [c, t] = await Promise.all([getCategories(), getTransactions()]);
    setCategories(c);
    setTransactions(t);
  }

  useEffect(() => { initFinanceDemoData().then(reloadData); }, []);
  useRealtimeTable(["categories", "transactions"], reloadData);

  // ── PRESERVED: stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const incomeCategories  = categories.filter((c) => c.type === "income");
    const expenseCategories = categories.filter((c) => c.type === "expense");
    const totalIncome  = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { incomeCount: incomeCategories.length, expenseCount: expenseCategories.length, totalIncome, totalExpense };
  }, [categories, transactions]);

  // ── PRESERVED: getCategoryUsage ───────────────────────────────────────────
  function getCategoryUsage(categoryId: string) {
    const related = transactions.filter((t) => t.categoryId === categoryId);
    return { count: related.length, total: related.reduce((s, t) => s + t.amount, 0) };
  }

  // ── NEW: per-category enriched data ───────────────────────────────────────
  const enriched = useMemo(() =>
    categories.map((c) => {
      const usage = getCategoryUsage(c.id);
      const typeTotal = c.type === "income" ? stats.totalIncome : stats.totalExpense;
      const pct = typeTotal > 0 ? Math.round((usage.total / typeTotal) * 100) : 0;
      const status: "high" | "active" | "inactive" =
        usage.count >= 10 ? "high" : usage.count > 0 ? "active" : "inactive";
      return { ...c, ...usage, pct, status };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [categories, transactions, stats]);

  // ── NEW: active category count ────────────────────────────────────────────
  const activeCount = useMemo(
    () => enriched.filter((c) => c.count > 0).length,
    [enriched],
  );
  const healthScore = categories.length > 0 ? Math.round((activeCount / categories.length) * 100) : 0;
  const healthGrade =
    healthScore >= 80 ? { gradient: "from-indigo-500 to-indigo-600", label: "Xuất sắc" }
    : healthScore >= 50 ? { gradient: "from-amber-400 to-orange-500", label: "Trung bình" }
    : { gradient: "from-rose-500 to-red-500", label: "Cần tối ưu" };

  // ── NEW: filtered cards ───────────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    return enriched.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (activityFilter === "active"   && c.count === 0) return false;
      if (activityFilter === "inactive" && c.count > 0)  return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.total - a.total);
  }, [enriched, typeFilter, activityFilter, search]);

  // ── NEW: top categories by type ───────────────────────────────────────────
  const topExpense = useMemo(
    () => enriched.filter((c) => c.type === "expense" && c.total > 0).sort((a, b) => b.total - a.total).slice(0, 5),
    [enriched],
  );
  const topIncome = useMemo(
    () => enriched.filter((c) => c.type === "income" && c.total > 0).sort((a, b) => b.total - a.total).slice(0, 5),
    [enriched],
  );

  // ── NEW: AI insights ──────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const out: { tone: "good" | "info" | "warning"; title: string; body: string }[] = [];
    const inactive = enriched.filter((c) => c.count === 0);
    const rare     = enriched.filter((c) => c.count === 1 || c.count === 2);
    const highUse  = enriched.filter((c) => c.status === "high");

    if (inactive.length > 0) {
      out.push({ tone: "warning", title: inactive.length + " danh mục chưa sử dụng", body: inactive.map((c) => c.name).slice(0, 5).join(", ") + " — Cân nhắc xóa để giữ danh sách gọn gàng." });
    }
    if (rare.length > 0) {
      out.push({ tone: "warning", title: rare.length + " danh mục ít dùng", body: rare.map((c) => c.name).slice(0, 4).join(", ") + " — Chỉ có 1–2 giao dịch, kiểm tra lại có cần thiết không." });
    }
    for (const c of highUse.slice(0, 2)) {
      out.push({ tone: "info", title: "Danh mục hoạt động cao · " + c.name, body: c.count + " giao dịch, tổng " + formatVND(c.total) + ". Đây là danh mục quan trọng trong chi tiêu của bạn." });
    }
    if (activeCount === categories.length && categories.length > 0) {
      out.push({ tone: "good", title: "Tất cả danh mục đang hoạt động!", body: "Danh mục của bạn được tổ chức tốt — " + categories.length + " danh mục đều có giao dịch liên kết." });
    }
    if (stats.incomeCount === 0) {
      out.push({ tone: "warning", title: "Chưa có danh mục thu nhập", body: "Hãy tạo ít nhất một danh mục thu nhập để phân loại các khoản tiền vào." });
    }
    return out.slice(0, 5);
  }, [enriched, activeCount, categories.length, stats.incomeCount]);

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm(type: CategoryType = activeTab) {
    setForm({ name: "", type });
    setIsFormOpen(true);
  }

  function openEditForm(category: Category) {
    setForm({ id: category.id, name: category.name, type: category.type });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { alert("Vui lòng nhập tên danh mục"); return; }
    const category: Category = { id: form.id ?? crypto.randomUUID(), name: form.name.trim(), type: form.type };
    if (form.id) await updateCategory(category);
    else await addCategory(category);
    await reloadData();
    setActiveTab(category.type);
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(category: Category) {
    const usage = getCategoryUsage(category.id);
    if (usage.count > 0) {
      alert("Không thể xóa danh mục \"" + category.name + "\" vì đang có " + usage.count + " giao dịch liên kết.\nHãy xóa hoặc phân loại lại các giao dịch đó trước khi xóa danh mục.");
      return;
    }
    if (!confirm("Bạn có chắc muốn xóa danh mục \"" + category.name + "\"?")) return;
    await deleteCategory(category.id);
    await reloadData();
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">Category Intelligence</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Danh mục thu chi</h1>
              <p className="mt-1 text-sm text-slate-500">Tạo và quản lý nhóm thu nhập, chi tiêu dùng cho giao dịch.</p>
            </div>
            <button
              onClick={() => openCreateForm(activeTab)}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95">
              <Plus size={17} />Thêm danh mục
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng danh mục"
              value={String(categories.length)}
              sub={activeCount + " đang hoạt động · " + (categories.length - activeCount) + " chưa dùng"}
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<Folder size={16} />}
            />
            <KpiCard
              label="Danh mục thu nhập"
              value={String(stats.incomeCount)}
              sub={formatVND(stats.totalIncome) + " tổng thu"}
              gradient="from-emerald-500 to-emerald-600"
              iconBg="bg-emerald-400/30"
              icon={<ArrowUpRight size={16} />}
            />
            <KpiCard
              label="Danh mục chi tiêu"
              value={String(stats.expenseCount)}
              sub={formatVND(stats.totalExpense) + " tổng chi"}
              gradient="from-rose-400 to-rose-500"
              iconBg="bg-white/20"
              icon={<ArrowDownRight size={16} />}
            />
            <KpiCard
              label="Đang hoạt động"
              value={String(activeCount)}
              sub={healthScore + "% danh mục có giao dịch"}
              gradient="from-cyan-500 to-cyan-600"
              iconBg="bg-cyan-400/30"
              icon={<Zap size={16} />}
            />
            {/* Health score */}
            <div className={"col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br p-4 shadow-sm " + healthGrade.gradient}>
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">Category Health</p>
              <p className="mt-1 text-3xl font-black text-white">
                {healthScore}<span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-1.5 rounded-full bg-white" style={{ width: Math.min(healthScore, 100) + "%" }} />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">{healthGrade.label}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Category Analytics (Top Spenders + Earners)
          ══════════════════════════════════════════════════════════════════ */}
      {(topExpense.length > 0 || topIncome.length > 0) && (
        <section className="grid gap-5 xl:grid-cols-2">
          {/* Top expense */}
          {topExpense.length > 0 && (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm shadow-rose-100">
                  <ArrowDownRight size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Top chi tiêu</h2>
                  <p className="text-xs text-slate-500">Danh mục chi nhiều nhất</p>
                </div>
              </div>
              <div className="space-y-4">
                {topExpense.map((c, i) => {
                  const shade = ["#f43f5e","#f97316","#fb923c","#fca5a5","#fecdd3"][i] ?? "#f43f5e";
                  return (
                    <div key={c.id}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ background: shade }}>{i + 1}</span>
                          <span className="font-bold text-slate-700">{c.name}</span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{c.count} gd</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-rose-600">{c.pct}%</span>
                          <span className="text-xs text-slate-400">{formatVND(c.total)}</span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-2 rounded-full transition-all duration-500" style={{ width: c.pct + "%", background: shade }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top income */}
          {topIncome.length > 0 && (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-100">
                  <ArrowUpRight size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Top thu nhập</h2>
                  <p className="text-xs text-slate-500">Danh mục thu nhiều nhất</p>
                </div>
              </div>
              <div className="space-y-4">
                {topIncome.map((c, i) => {
                  const shade = ["#10b981","#06b6d4","#22c55e","#86efac","#bbf7d0"][i] ?? "#10b981";
                  return (
                    <div key={c.id}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ background: shade }}>{i + 1}</span>
                          <span className="font-bold text-slate-700">{c.name}</span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{c.count} gd</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-600">{c.pct}%</span>
                          <span className="text-xs text-slate-400">{formatVND(c.total)}</span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-2 rounded-full transition-all duration-500" style={{ width: c.pct + "%", background: shade }} />
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
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{insights.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight, i) => {
              const styles = {
                good:    { card: "border-emerald-200 bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", title: "text-emerald-800", body: "text-emerald-700", Icon: Sparkles },
                info:    { card: "border-blue-200 bg-blue-50",       icon: "bg-blue-100 text-blue-600",       title: "text-blue-800",    body: "text-blue-700",    Icon: Lightbulb },
                warning: { card: "border-amber-200 bg-amber-50",     icon: "bg-amber-100 text-amber-600",     title: "text-amber-800",   body: "text-amber-700",   Icon: AlertTriangle },
              };
              const s = styles[insight.tone];
              return (
                <div key={i} className={"rounded-2xl border p-4 " + s.card}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className={"flex size-7 shrink-0 items-center justify-center rounded-xl " + s.icon}>
                      <s.Icon size={13} />
                    </div>
                    <p className={"text-xs font-black " + s.title}>{insight.title}</p>
                  </div>
                  <p className={"text-xs leading-5 " + s.body}>{insight.body}</p>
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
        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm danh mục..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Type filter pills */}
          <div className="flex gap-1.5">
            {([
              { val: "all",     label: "Tất cả",   count: categories.length },
              { val: "income",  label: "Thu nhập",  count: stats.incomeCount },
              { val: "expense", label: "Chi tiêu",  count: stats.expenseCount },
            ] as { val: TypeFilter; label: string; count: number }[]).map((p) => (
              <button key={p.val} onClick={() => setTypeFilter(p.val)}
                className={"flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all " + (
                  typeFilter === p.val
                    ? p.val === "income"  ? "border-emerald-300 bg-emerald-600 text-white shadow-sm"
                    : p.val === "expense" ? "border-rose-300 bg-rose-500 text-white shadow-sm"
                    : "border-blue-300 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                )}>
                {p.label}
                <span className={"rounded-full px-1.5 py-0.5 text-[9px] font-black " + (typeFilter === p.val ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{p.count}</span>
              </button>
            ))}
          </div>

          {/* Activity filter pills */}
          <div className="flex gap-1.5">
            {([
              { val: "all",      label: "Tất cả" },
              { val: "active",   label: "Đang dùng" },
              { val: "inactive", label: "Chưa dùng" },
            ] as { val: ActivityFilter; label: string }[]).map((p) => (
              <button key={p.val} onClick={() => setActivityFilter(p.val)}
                className={"rounded-2xl border px-3 py-2 text-xs font-bold transition-all " + (
                  activityFilter === p.val
                    ? "border-blue-300 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                )}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Result count + Add button */}
          <div className="flex items-center gap-3 ml-auto">
            {search && (
              <span className="text-xs text-slate-400">{filteredCategories.length} kết quả</span>
            )}
            <button onClick={() => openCreateForm(activeTab)}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              <Plus size={13} />Thêm
            </button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCategories.map((category) => {
            const isIncome  = category.type === "income";
            const isHigh    = category.status === "high";
            const isInactive = category.status === "inactive";

            const statusBadge = isHigh
              ? "bg-blue-100 text-blue-700 border-blue-200"
              : isInactive
                ? "bg-slate-100 text-slate-500 border-slate-200"
                : isIncome
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-rose-100 text-rose-600 border-rose-200";
            const statusLabel = isHigh ? "Hoạt động cao" : isInactive ? "Chưa sử dụng" : "Đang dùng";

            const typePill = isIncome
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-rose-50 text-rose-600 border-rose-100";

            const barColor = isIncome ? "#10b981" : "#f43f5e";

            return (
              <div key={category.id}
                className={"group rounded-[2rem] border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " + (isHigh ? "border-blue-100" : isInactive ? "border-slate-100" : isIncome ? "border-emerald-100" : "border-rose-100")}>

                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon type={category.type} />
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">{category.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " + typePill}>
                          {isIncome ? "Thu nhập" : "Chi tiêu"}
                        </span>
                        <span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " + statusBadge}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => openEditForm(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDelete(category)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 2-col mini stats */}
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3">
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Giao dịch</p>
                    <p className={"mt-0.5 text-lg font-black " + (category.count > 0 ? "text-slate-900" : "text-slate-300")}>{category.count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Tổng tiền</p>
                    <p className={"mt-0.5 text-sm font-black " + (isIncome ? "text-emerald-600" : category.total > 0 ? "text-rose-600" : "text-slate-300")}>
                      {category.total > 0 ? (category.total >= 1_000_000 ? Math.round(category.total / 1_000_000) + "M" : Math.round(category.total / 1_000) + "K") : "—"}
                    </p>
                  </div>
                </div>

                {/* Usage bar */}
                {category.total > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Tỷ trọng loại</span>
                      <span className="font-black text-slate-700">{category.pct}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: category.pct + "%", background: barColor }} />
                    </div>
                  </div>
                )}

                {/* Mobile edit row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button onClick={() => openEditForm(category)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500">
                    <Edit3 size={12} />Sửa
                  </button>
                  <button onClick={() => handleDelete(category)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-100 py-2 text-xs font-bold text-rose-500">
                    <Trash2 size={12} />Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Folder size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                {search ? "Không tìm thấy danh mục" : "Chưa có danh mục nào"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                {search ? "Thử từ khoá khác hoặc bỏ bộ lọc." : "Tạo danh mục đầu tiên để phân loại giao dịch."}
              </p>
              {!search && (
                <button onClick={() => openCreateForm(activeTab)}
                  className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">
                  <Plus size={15} />Thêm danh mục
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">{form.id ? "Sửa danh mục" : "Thêm danh mục"}</h2>
                <p className="mt-0.5 text-sm text-slate-400">Danh mục sẽ được dùng khi thêm giao dịch.</p>
              </div>
              <button onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                {/* Name input */}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-slate-700">Tên danh mục</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="VD: Ăn uống, Lương, Di chuyển..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                  />
                </label>

                {/* Type selector */}
                <div>
                  <span className="mb-2 block text-sm font-black text-slate-700">Loại danh mục</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setForm((p) => ({ ...p, type: "expense" }))}
                      className={"flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold transition-all " + (
                        form.type === "expense"
                          ? "border-rose-300 bg-rose-50 text-rose-600 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      )}>
                      <ArrowDownRight size={15} />Chi tiêu
                    </button>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, type: "income" }))}
                      className={"flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold transition-all " + (
                        form.type === "income"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-600 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      )}>
                      <ArrowUpRight size={15} />Thu nhập
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit"
                  className={"flex-1 rounded-2xl py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[.98] " + (
                    form.type === "income"
                      ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700"
                  )}>
                  {form.id ? "Lưu thay đổi" : "Thêm danh mục"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, gradient, iconBg, icon }: {
  label: string; value: string; sub: string; gradient: string; iconBg: string; icon: React.ReactNode;
}) {
  return (
    <div className={"rounded-2xl bg-gradient-to-br p-4 shadow-sm " + gradient}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-white/80">{label}</p>
        <div className={"flex size-6 shrink-0 items-center justify-center rounded-lg text-white " + iconBg}>{icon}</div>
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-white/70">{sub}</p>
    </div>
  );
}

function CategoryIcon({ type }: { type: CategoryType }) {
  const className = type === "income"
    ? "bg-gradient-to-br from-emerald-500 to-teal-400"
    : "bg-gradient-to-br from-rose-500 to-orange-400";
  return (
    <div className={"flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm " + className}>
      {type === "income" ? <Tag size={20} /> : <Folder size={20} />}
    </div>
  );
}
