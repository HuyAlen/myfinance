"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  LayoutList,
  Lightbulb,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts";

import type {
  Budget,
  Category,
  RecurrenceFrequency,
  Transaction,
  TransactionType,
  Wallet,
} from "@/src/types/finance";
import {
  addTransaction,
  deleteTransaction,
  getBudgets,
  getCategories,
  getTransactions,
  getWallets,
  initFinanceDemoData,
  updateTransaction,
} from "@/src/services/finance/financeStorage";
import {
  formatVND,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import { detectSpendingAnomalies } from "@/src/services/finance/analytics/spendingAnalytics";
import { computeMonthlyForecast } from "@/src/services/finance/analytics/forecastAnalytics";
import { computeSmartBudget } from "@/src/services/finance/analytics/smartBudget";
import {
  CurrencyInput,
  formatCurrencyInput,
  parseCurrencyInput,
} from "@/src/components/ui/CurrencyInput";

// ─── Types ────────────────────────────────────────────────────────────────────
type SortKey = "date" | "amount" | "category" | "wallet";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "timeline";

type FormState = {
  id?: string;
  type: TransactionType;
  amount: string;
  categoryId: string;
  walletId: string;
  transferToWalletId: string;
  note: string;
  date: string;
  isRecurring: boolean;
  recurrence: RecurrenceFrequency;
};

const emptyForm: FormState = {
  type: "expense",
  amount: "",
  categoryId: "",
  walletId: "",
  transferToWalletId: "",
  note: "",
  date: new Date().toISOString().slice(0, 10),
  isRecurring: false,
  recurrence: "monthly",
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    const [txns, cats, wlts, bdgs] = await Promise.all([
      getTransactions(),
      getCategories(),
      getWallets(),
      getBudgets(),
    ]);
    setTransactions(txns);
    setCategories(cats);
    setWallets(wlts);
    setBudgets(bdgs);
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);
  useRealtimeTable(["transactions", "wallets", "categories"], reloadData);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      const wal = wallets.find((w) => w.id === t.walletId);
      const searchText = [t.note, cat?.name, wal?.name, String(t.amount)]
        .join(" ")
        .toLowerCase();
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (keyword && !searchText.includes(keyword.toLowerCase())) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      if (walletFilter && t.walletId !== walletFilter) return false;
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (amountMin && t.amount < Number(amountMin)) return false;
      if (amountMax && t.amount > Number(amountMax)) return false;
      return true;
    });
  }, [
    transactions,
    categories,
    wallets,
    keyword,
    typeFilter,
    dateFrom,
    dateTo,
    walletFilter,
    categoryFilter,
    amountMin,
    amountMax,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "amount") cmp = a.amount - b.amount;
      else if (sortKey === "category") {
        const ca = categories.find((c) => c.id === a.categoryId)?.name ?? "";
        const cb = categories.find((c) => c.id === b.categoryId)?.name ?? "";
        cmp = ca.localeCompare(cb);
      } else {
        const wa = wallets.find((w) => w.id === a.walletId)?.name ?? "";
        const wb = wallets.find((w) => w.id === b.walletId)?.name ?? "";
        cmp = wa.localeCompare(wb);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, categories, wallets]);

  const totalIncome = useMemo(() => getTotalIncome(filtered), [filtered]);
  const totalExpense = useMemo(() => getTotalExpense(filtered), [filtered]);
  const netCashFlow = totalIncome - totalExpense;

  const currentYear = new Date().getFullYear().toString();
  const yearTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentYear)),
    [transactions, currentYear],
  );
  const monthlyTrend = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, "0");
        const mx = yearTxns.filter((t) =>
          t.date.startsWith(currentYear + "-" + m),
        );
        const inc = getTotalIncome(mx);
        const exp = getTotalExpense(mx);
        return {
          month: "T" + (i + 1),
          thu: inc / 1e6,
          chi: exp / 1e6,
          net: (inc - exp) / 1e6,
        };
      }),
    [yearTxns, currentYear],
  );

  const anomalies = useMemo(
    () => detectSpendingAnomalies(transactions, categories, 6),
    [transactions, categories],
  );
  const smartBudget = useMemo(
    () => computeSmartBudget(transactions, categories, budgets, 3),
    [transactions, categories, budgets],
  );
  const forecast = useMemo(
    () => computeMonthlyForecast(transactions, 6),
    [transactions],
  );

  const recurringGroups = useMemo(() => {
    const groups = new Map<
      string,
      { note: string; amount: number; count: number; months: string[] }
    >();
    for (const t of transactions.filter((tx) => tx.type === "expense")) {
      const key = t.categoryId + "::" + t.note.toLowerCase().trim();
      const month = t.date.slice(0, 7);
      if (!groups.has(key))
        groups.set(key, {
          note: t.note,
          amount: t.amount,
          count: 0,
          months: [],
        });
      const g = groups.get(key)!;
      if (!g.months.includes(month)) {
        g.months.push(month);
        g.count = g.months.length;
      }
    }
    return Array.from(groups.values())
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [transactions]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of sorted) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date)!.push(t);
    }
    return Array.from(groups.entries()).map(([date, txns]) => ({ date, txns }));
  }, [sorted]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length && sorted.length > 0)
      setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((t) => t.id)));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm("Xóa " + selectedIds.size + " giao dịch đã chọn?")) return;
    for (const id of selectedIds) await deleteTransaction(id);
    setSelectedIds(new Set());
    await reloadData();
  }

  function exportCSV() {
    const toExport =
      selectedIds.size > 0
        ? sorted.filter((t) => selectedIds.has(t.id))
        : sorted;
    const rows = [
      ["Ngày", "Loại", "Ghi chú", "Danh mục", "Ví", "Số tiền"],
      ...toExport.map((t) => {
        const cat = categories.find((c) => c.id === t.categoryId)?.name ?? "";
        const wal = wallets.find((w) => w.id === t.walletId)?.name ?? "";
        return [
          t.date,
          t.type === "income"
            ? "Thu"
            : t.type === "transfer"
              ? "Chuyển"
              : "Chi",
          t.note,
          cat,
          wal,
          String(t.amount),
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((v) => '"' + v + '"').join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  );

  function openCreateForm() {
    setForm({
      ...emptyForm,
      categoryId: categories.find((c) => c.type === "expense")?.id ?? "",
      walletId: wallets[0]?.id ?? "",
    });
    setIsFormOpen(true);
  }

  function openEditForm(t: Transaction) {
    setForm({
      id: t.id,
      type: t.type,
      amount: String(t.amount),
      categoryId: t.categoryId,
      walletId: t.walletId,
      transferToWalletId: t.transferToWalletId ?? "",
      note: t.note,
      date: t.date,
      isRecurring: t.isRecurring ?? false,
      recurrence: t.recurrence ?? "monthly",
    });
    setIsFormOpen(true);
  }

  function handleTypeChange(type: TransactionType) {
    setForm((prev) => ({
      ...prev,
      type,
      categoryId:
        type === "transfer"
          ? ""
          : (categories.find((c) => c.type === type)?.id ?? ""),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      alert("Vui lòng nhập số tiền hợp lệ");
      return;
    }
    if (form.type === "transfer") {
      if (!form.walletId) {
        alert("Vui lòng chọn ví nguồn");
        return;
      }
      if (!form.transferToWalletId) {
        alert("Vui lòng chọn ví đích");
        return;
      }
      if (form.walletId === form.transferToWalletId) {
        alert("Ví nguồn và ví đích phải khác nhau");
        return;
      }
    } else {
      if (!form.categoryId) {
        alert("Vui lòng chọn danh mục");
        return;
      }
      if (!form.walletId) {
        alert("Vui lòng chọn ví tiền");
        return;
      }
    }
    const transaction: Transaction = {
      id: form.id ?? crypto.randomUUID(),
      type: form.type,
      amount,
      categoryId: form.type === "transfer" ? "" : form.categoryId,
      walletId: form.walletId,
      transferToWalletId:
        form.type === "transfer" ? form.transferToWalletId : undefined,
      note:
        form.note ||
        (form.type === "transfer" ? "Chuyển tiền" : "Giao dịch mới"),
      date: form.date,
      isRecurring: form.isRecurring || undefined,
      recurrence: form.isRecurring ? form.recurrence : undefined,
    };
    if (form.id) await updateTransaction(transaction);
    else await addTransaction(transaction);
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa giao dịch này?")) return;
    await deleteTransaction(id);
    await reloadData();
  }

  function clearFilters() {
    setKeyword("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setWalletFilter("");
    setCategoryFilter("");
    setAmountMin("");
    setAmountMax("");
  }

  const hasActiveFilters = !!(
    keyword ||
    typeFilter !== "all" ||
    dateFrom ||
    dateTo ||
    walletFilter ||
    categoryFilter ||
    amountMin ||
    amountMax
  );
  const activeFilterCount = [
    dateFrom,
    dateTo,
    walletFilter,
    categoryFilter,
    amountMin,
    amountMax,
  ].filter(Boolean).length;
  const savingRate =
    totalIncome > 0
      ? Math.round((Math.max(0, netCashFlow) / totalIncome) * 100)
      : 0;
  const totalPot = totalIncome + totalExpense;
  const incomePct =
    totalPot > 0
      ? Math.min(Math.round((totalIncome / totalPot) * 100), 100)
      : 50;

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ════════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="relative bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          {/* Top row */}
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Money Command Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Giao dịch
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {sorted.length !== transactions.length
                  ? sorted.length + " / " + transactions.length + " giao dịch"
                  : transactions.length + " giao dịch"}
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Thêm giao dịch</span>
              <span className="sm:hidden">Thêm</span>
            </button>
          </div>

          {/* Net cash flow — center focus */}
          <div className="relative mt-7 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Dòng tiền ròng
            </p>
            <p
              className={
                "mt-2 text-5xl font-black tracking-tight sm:text-6xl " +
                (netCashFlow >= 0 ? "text-emerald-600" : "text-rose-500")
              }
            >
              {netCashFlow >= 0 ? "+" : ""}
              {formatVND(netCashFlow)}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                {savingRate}% tiết kiệm
              </span>
              {netCashFlow >= 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  <TrendingUp size={11} />
                  Dương
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
                  <TrendingDown size={11} />
                  Âm
                </span>
              )}
            </div>
          </div>

          {/* Income vs Expense visual bar */}
          <div className="relative mt-6">
            <div className="mb-2 flex justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 font-bold text-emerald-600">
                <ArrowUpRight size={12} />
                Thu {Math.round(totalIncome / 1e6)}M
              </span>
              <span className="flex items-center gap-1.5 font-bold text-rose-500">
                Chi {Math.round(totalExpense / 1e6)}M
                <ArrowDownRight size={12} />
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-blue-100">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
                style={{ width: incomePct + "%" }}
              />
            </div>
          </div>

          {/* KPI chips strip — horizontal scroll */}
          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/60 px-4 py-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                Thu nhập
              </p>
              <p className="mt-1 truncate text-sm font-black text-emerald-700">
                {formatVND(totalIncome)}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100/60 px-4 py-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">
                Chi tiêu
              </p>
              <p className="mt-1 truncate text-sm font-black text-rose-600">
                {formatVND(totalExpense)}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/60 px-4 py-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-600">
                Giao dịch
              </p>
              <p className="mt-1 text-sm font-black text-blue-700">
                {sorted.length}
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-cyan-100/60 px-4 py-3.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-cyan-600">
                Danh mục
              </p>
              <p className="mt-1 text-sm font-black text-cyan-700">
                {
                  new Set(
                    filtered
                      .filter((t) => t.type === "expense")
                      .map((t) => t.categoryId),
                  ).size
                }
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 · Smart Filter Command Bar (sticky)
          ════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20">
        <div className="rounded-[2rem] border border-slate-200 bg-white/95 shadow-md shadow-slate-200/80 backdrop-blur-md">
          {/* Main bar */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
            {/* Search */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-sm">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm giao dịch, danh mục, ví tiền..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {keyword && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                    {sorted.length}
                  </span>
                  <button
                    onClick={() => setKeyword("")}
                    className="text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Type filter pills — color-coded */}
            <div className="flex gap-0.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(["all", "income", "expense", "transfer"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={
                    "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-150 " +
                    (typeFilter === t
                      ? t === "income"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : t === "expense"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800")
                  }
                >
                  {t === "all"
                    ? "Tất cả"
                    : t === "income"
                      ? "Thu"
                      : t === "transfer"
                        ? "Chuyển"
                        : "Chi"}
                </button>
              ))}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1.5">
              {/* Filter toggle with badge */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={
                  "relative flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all " +
                  (showFilters || hasActiveFilters
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
                }
              >
                <SlidersHorizontal size={13} />
                Lọc
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Export */}
              <button
                onClick={exportCSV}
                title="Xuất CSV"
                className="flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              >
                <Download size={14} />
              </button>

              {/* View mode toggle */}
              <div className="flex gap-0.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setViewMode("table")}
                  title="Table view"
                  className={
                    "rounded-xl p-1.5 transition-all " +
                    (viewMode === "table"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-600")
                  }
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode("timeline")}
                  title="Timeline view"
                  className={
                    "rounded-xl p-1.5 transition-all " +
                    (viewMode === "timeline"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-600")
                  }
                >
                  <LayoutList size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-5 py-2.5">
              {typeFilter !== "all" && (
                <FilterChip
                  label={
                    typeFilter === "income"
                      ? "Thu nhập"
                      : typeFilter === "transfer"
                        ? "Chuyển tiền"
                        : "Chi tiêu"
                  }
                  onRemove={() => setTypeFilter("all")}
                  color={
                    typeFilter === "income"
                      ? "emerald"
                      : typeFilter === "transfer"
                        ? "slate"
                        : "rose"
                  }
                />
              )}
              {dateFrom && (
                <FilterChip
                  label={"Từ " + dateFrom}
                  onRemove={() => setDateFrom("")}
                />
              )}
              {dateTo && (
                <FilterChip
                  label={"Đến " + dateTo}
                  onRemove={() => setDateTo("")}
                />
              )}
              {walletFilter && (
                <FilterChip
                  label={
                    wallets.find((w) => w.id === walletFilter)?.name ?? "Ví"
                  }
                  onRemove={() => setWalletFilter("")}
                />
              )}
              {categoryFilter && (
                <FilterChip
                  label={
                    categories.find((c) => c.id === categoryFilter)?.name ??
                    "Danh mục"
                  }
                  onRemove={() => setCategoryFilter("")}
                />
              )}
              {amountMin && (
                <FilterChip
                  label={"≥ " + Number(amountMin).toLocaleString()}
                  onRemove={() => setAmountMin("")}
                />
              )}
              {amountMax && (
                <FilterChip
                  label={"≤ " + Number(amountMax).toLocaleString()}
                  onRemove={() => setAmountMax("")}
                />
              )}
              <button
                onClick={clearFilters}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100"
              >
                Xóa tất cả
              </button>
            </div>
          )}

          {/* Advanced filter drawer */}
          {showFilters && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Từ ngày
                  </p>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Đến ngày
                  </p>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Ví tiền
                  </p>
                  <select
                    value={walletFilter}
                    onChange={(e) => setWalletFilter(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">Tất cả ví</option>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Danh mục
                  </p>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Số tiền tối thiểu
                  </p>
                  <CurrencyInput
                    value={amountMin}
                    onChange={setAmountMin}
                    placeholder="0"
                    showPrefix={false}
                    className="[&_input]:bg-white [&_input]:py-2.5 [&_input]:px-4"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Số tiền tối đa
                  </p>
                  <CurrencyInput
                    value={amountMax}
                    onChange={setAmountMax}
                    placeholder="Không giới hạn"
                    showPrefix={false}
                    className="[&_input]:bg-white [&_input]:py-2.5 [&_input]:px-4"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 · Cash Flow Analytics
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-600">
            Phân tích dòng tiền
          </p>
          <span className="ml-auto text-xs text-slate-400">
            12 tháng {currentYear}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TrendPanel
            title="Thu nhập"
            color="#10b981"
            dataKey="thu"
            data={monthlyTrend}
            chartType="area"
          />
          <TrendPanel
            title="Chi tiêu"
            color="#f43f5e"
            dataKey="chi"
            data={monthlyTrend}
            chartType="line"
          />
          <TrendPanel
            title="Dòng tiền"
            color="#2563eb"
            dataKey="net"
            data={monthlyTrend}
            chartType="bar"
          />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 · AI Transaction Insights (shown before feed for context)
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Bot size={14} className="text-violet-600" />
          <p className="text-sm font-black text-slate-600">
            Phân tích thông minh
          </p>
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto no-scrollbar px-1 pb-1">
          {/* Spending */}
          <IntelCard
            icon={<Sparkles size={14} />}
            title="Chi tiêu"
            accent="blue"
            body={
              smartBudget.violations.length > 0
                ? smartBudget.violations.length +
                  " danh mục vượt ngân sách. Điểm: " +
                  smartBudget.adherenceScore +
                  "/100."
                : "Ngân sách ổn định. Điểm tuân thủ: " +
                  smartBudget.adherenceScore +
                  "/100."
            }
            tone={
              smartBudget.adherenceScore >= 80
                ? "good"
                : smartBudget.adherenceScore >= 60
                  ? "warning"
                  : "danger"
            }
          />
          {/* Saving */}
          <IntelCard
            icon={<Zap size={14} />}
            title="Tiết kiệm"
            accent="emerald"
            body={
              recurringGroups.length > 0
                ? "Phát hiện " +
                  recurringGroups.length +
                  " khoản định kỳ, tổng ~" +
                  formatVND(recurringGroups.reduce((s, g) => s + g.amount, 0)) +
                  "/tháng."
                : "Dự báo tháng tới: tiết kiệm " +
                  formatVND(forecast.projectedSaving) +
                  "."
            }
            tone={netCashFlow >= 0 ? "good" : "danger"}
          />
          {/* Alerts */}
          <IntelCard
            icon={<AlertTriangle size={14} />}
            title="Cảnh báo"
            accent="amber"
            body={
              anomalies.length > 0
                ? anomalies[0].categoryName +
                  " tháng " +
                  anomalies[0].month +
                  " cao hơn TB " +
                  anomalies[0].deviationPercent +
                  "%."
                : "Không phát hiện bất thường 6 tháng qua."
            }
            tone={
              anomalies.filter((a) => a.severity === "high").length > 0
                ? "danger"
                : anomalies.length > 0
                  ? "warning"
                  : "good"
            }
          />
          {/* Anomaly cards */}
          {anomalies.slice(0, 2).map((a) => (
            <IntelCard
              key={a.categoryId + "-" + a.month}
              icon={<AlertTriangle size={14} />}
              title={a.categoryName}
              accent={a.severity === "high" ? "rose" : "amber"}
              body={
                "Tháng " +
                a.month +
                ": " +
                formatVND(a.amount) +
                " (+" +
                a.deviationPercent +
                "% so với TB)"
              }
              tone={a.severity === "high" ? "danger" : "warning"}
            />
          ))}
          {/* Recurring */}
          {recurringGroups.slice(0, 2).map((g, i) => (
            <IntelCard
              key={i}
              icon={<RefreshCw size={14} />}
              title="Định kỳ"
              accent="blue"
              body={
                g.note +
                " — " +
                g.count +
                " tháng · " +
                formatVND(g.amount) +
                "/lần"
              }
              tone="good"
            />
          ))}
          {/* Budget violations */}
          {smartBudget.violations.slice(0, 2).map((v) => (
            <IntelCard
              key={v.categoryId}
              icon={<AlertTriangle size={14} />}
              title={v.categoryName}
              accent="rose"
              body={
                "Chi " +
                formatVND(v.actualSpend) +
                ", vượt " +
                v.overagePercent +
                "% ngân sách"
              }
              tone="danger"
            />
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          Bulk Action Bar (sticky, only when rows selected)
          ════════════════════════════════════════════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div className="sticky top-20 z-30">
          <div className="overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-600 shadow-xl shadow-blue-900/30">
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="flex size-8 items-center justify-center rounded-xl bg-white/20 text-sm font-black text-white">
                {selectedIds.size}
              </div>
              <p className="text-sm font-bold text-white">giao dịch đã chọn</p>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-white/25 active:scale-95"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-rose-600 active:scale-95"
                >
                  <Trash2 size={12} />
                  Xóa
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-xl bg-white/15 p-2 transition-all hover:bg-white/25"
                >
                  <X size={13} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 · Transaction Feed
          ════════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        {/* Feed header */}
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/40 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-blue-700">
              {sorted.length} giao dịch
            </p>
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                Đã lọc
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>Sắp xếp:</span>
            {(["date", "amount", "category", "wallet"] as SortKey[]).map(
              (k) => (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={
                    "flex items-center gap-0.5 rounded-lg px-2 py-1 font-bold transition-colors " +
                    (sortKey === k
                      ? "bg-blue-100 text-blue-700"
                      : "text-slate-400 hover:text-slate-600")
                  }
                >
                  {k === "date"
                    ? "Ngày"
                    : k === "amount"
                      ? "Tiền"
                      : k === "category"
                        ? "Danh mục"
                        : "Ví"}
                  {sortKey === k &&
                    (sortDir === "asc" ? (
                      <ChevronUp size={10} />
                    ) : (
                      <ChevronDown size={10} />
                    ))}
                </button>
              ),
            )}
          </div>
        </div>

        {viewMode === "table" ? (
          <>
            {/* Desktop column header */}
            <div className="hidden grid-cols-[36px_1fr_130px_120px_100px_150px_88px] items-center border-b border-blue-100 bg-blue-50/30 px-6 py-3 text-xs font-black uppercase tracking-wide text-blue-400 lg:grid">
              <div>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === sorted.length && sorted.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="cursor-pointer rounded"
                />
              </div>
              <div>Ghi chú</div>
              <div>Danh mục</div>
              <div>Ví tiền</div>
              <div>Ngày</div>
              <div>Số tiền</div>
              <div className="text-right">Thao tác</div>
            </div>

            <div className="divide-y divide-slate-100/80">
              {sorted.map((t) => {
                const cat = categories.find((c) => c.id === t.categoryId);
                const wal = wallets.find((w) => w.id === t.walletId);
                const dstWal = t.transferToWalletId
                  ? wallets.find((w) => w.id === t.transferToWalletId)
                  : undefined;
                const isSelected = selectedIds.has(t.id);
                const isSwiped = swipedId === t.id;
                const isIncome = t.type === "income";
                const isTransfer = t.type === "transfer";

                return (
                  <div key={t.id} className="relative overflow-hidden">
                    {/* Swipe actions — mobile only */}
                    <div
                      className={
                        "absolute inset-y-0 right-0 z-10 flex items-center gap-2 bg-white px-4 transition-transform duration-200 lg:hidden " +
                        (isSwiped ? "translate-x-0" : "translate-x-full")
                      }
                    >
                      <button
                        onClick={() => {
                          openEditForm(t);
                          setSwipedId(null);
                        }}
                        className="flex size-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 transition-all active:scale-90"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => {
                          handleDelete(t.id);
                          setSwipedId(null);
                        }}
                        className="flex size-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 transition-all active:scale-90"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div
                      className={
                        "grid gap-3 px-6 py-4 transition-all duration-200 hover:bg-blue-50/30 lg:grid-cols-[36px_1fr_130px_120px_100px_150px_88px] lg:items-center " +
                        (isSelected ? "bg-blue-50" : "") +
                        " " +
                        (isSwiped ? "-translate-x-24 lg:translate-x-0" : "")
                      }
                      onTouchStart={(e) => {
                        touchStartX.current = e.touches[0].clientX;
                      }}
                      onTouchEnd={(e) => {
                        const delta =
                          touchStartX.current - e.changedTouches[0].clientX;
                        if (delta > 55) setSwipedId(t.id);
                        else if (delta < -25) setSwipedId(null);
                      }}
                    >
                      {/* Checkbox (desktop) */}
                      <div className="hidden items-center lg:flex">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(t.id)}
                          className="cursor-pointer rounded"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* Note + icon */}
                      <div className="flex items-center gap-3.5">
                        <div
                          className={
                            "flex size-11 shrink-0 items-center justify-center rounded-2xl " +
                            (isIncome
                              ? "bg-emerald-100 text-emerald-600"
                              : isTransfer
                                ? "bg-blue-100 text-blue-600"
                                : "bg-rose-100 text-rose-600")
                          }
                        >
                          {isIncome ? (
                            <ArrowUpRight size={18} strokeWidth={2.5} />
                          ) : isTransfer ? (
                            <ArrowLeftRight size={18} strokeWidth={2.5} />
                          ) : (
                            <ArrowDownRight size={18} strokeWidth={2.5} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[200px] truncate text-sm font-bold text-slate-900">
                            {t.note}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400 lg:hidden">
                            {isTransfer
                              ? (wal?.name ?? "—") +
                                " → " +
                                (dstWal?.name ?? "—")
                              : (cat?.name ?? "—") +
                                " · " +
                                (wal?.name ?? "—")}{" "}
                            · {t.date}
                          </p>
                        </div>
                      </div>

                      {/* Category pill (desktop) */}
                      <div className="hidden lg:block">
                        {isTransfer ? (
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                            Chuyển khoản
                          </span>
                        ) : (
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                            {cat?.name ?? "—"}
                          </span>
                        )}
                      </div>

                      {/* Wallet badge (desktop) */}
                      <div className="hidden lg:block">
                        {isTransfer ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {wal?.name ?? "—"} → {dstWal?.name ?? "—"}
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {wal?.name ?? "—"}
                          </span>
                        )}
                      </div>

                      {/* Date badge (desktop) */}
                      <div className="hidden lg:block">
                        <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs text-slate-400">
                          {t.date}
                        </span>
                      </div>

                      {/* Amount (desktop) */}
                      <div
                        className={
                          "hidden text-base font-black lg:block " +
                          (isIncome
                            ? "text-emerald-600"
                            : isTransfer
                              ? "text-blue-600"
                              : "text-rose-500")
                        }
                      >
                        {isIncome ? "+" : isTransfer ? "⇄" : "−"}
                        {formatVND(t.amount)}
                      </div>

                      {/* Actions (desktop) */}
                      <div className="hidden items-center justify-end gap-1.5 lg:flex">
                        <button
                          onClick={() => openEditForm(t)}
                          className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Mobile: amount + actions row */}
                      <div className="flex items-center justify-between lg:hidden">
                        <span
                          className={
                            "text-base font-black " +
                            (isIncome
                              ? "text-emerald-600"
                              : isTransfer
                                ? "text-blue-600"
                                : "text-rose-500")
                          }
                        >
                          {isIncome ? "+" : isTransfer ? "⇄" : "−"}
                          {formatVND(t.amount)}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openEditForm(t)}
                            className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sorted.length === 0 && (
                <EmptyState
                  hasFilters={hasActiveFilters}
                  onClear={clearFilters}
                  onAdd={openCreateForm}
                />
              )}
            </div>
          </>
        ) : (
          /* ── Timeline View ─────────────────────────────────────────────── */
          <div className="divide-y divide-slate-100">
            {timelineGroups.length === 0 && (
              <EmptyState
                hasFilters={hasActiveFilters}
                onClear={clearFilters}
                onAdd={openCreateForm}
              />
            )}
            {timelineGroups.map(({ date, txns }) => {
              const dayInc = txns
                .filter((t) => t.type === "income")
                .reduce((s, t) => s + t.amount, 0);
              const dayExp = txns
                .filter((t) => t.type === "expense")
                .reduce((s, t) => s + t.amount, 0);
              return (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 bg-blue-50/50 px-6 py-3">
                    <span className="text-sm font-black text-slate-700">
                      {date}
                    </span>
                    <div className="flex-1 border-t border-slate-200" />
                    <div className="flex gap-2">
                      {dayInc > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">
                          +
                          {Math.round(dayInc / 1e3) >= 1000
                            ? (dayInc / 1e6).toFixed(1) + "M"
                            : Math.round(dayInc / 1e3) + "K"}
                        </span>
                      )}
                      {dayExp > 0 && (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
                          −
                          {Math.round(dayExp / 1e3) >= 1000
                            ? (dayExp / 1e6).toFixed(1) + "M"
                            : Math.round(dayExp / 1e3) + "K"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Transactions for this date */}
                  {txns.map((t) => {
                    const cat = categories.find((c) => c.id === t.categoryId);
                    const wal = wallets.find((w) => w.id === t.walletId);
                    const tDstWal = t.transferToWalletId
                      ? wallets.find((w) => w.id === t.transferToWalletId)
                      : undefined;
                    const isIncome = t.type === "income";
                    const isTransferRow = t.type === "transfer";
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-blue-50/30"
                      >
                        <div
                          className={
                            "flex size-10 shrink-0 items-center justify-center rounded-2xl " +
                            (isIncome
                              ? "bg-emerald-100 text-emerald-600"
                              : isTransferRow
                                ? "bg-blue-100 text-blue-600"
                                : "bg-rose-100 text-rose-600")
                          }
                        >
                          {isIncome ? (
                            <ArrowUpRight size={16} strokeWidth={2.5} />
                          ) : isTransferRow ? (
                            <ArrowLeftRight size={16} strokeWidth={2.5} />
                          ) : (
                            <ArrowDownRight size={16} strokeWidth={2.5} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {t.note}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {isTransferRow
                              ? (wal?.name ?? "—") +
                                " → " +
                                (tDstWal?.name ?? "—")
                              : (cat?.name ?? "—") + " · " + (wal?.name ?? "—")}
                          </p>
                        </div>
                        <span
                          className={
                            "shrink-0 text-base font-black " +
                            (isIncome
                              ? "text-emerald-600"
                              : isTransferRow
                                ? "text-blue-600"
                                : "text-rose-500")
                          }
                        >
                          {isIncome ? "+" : isTransferRow ? "⇄" : "−"}
                          {formatVND(t.amount)}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => openEditForm(t)}
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-slate-200 hover:text-blue-600"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-slate-200 hover:text-rose-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── CRUD Form Modal ─────────────────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa giao dịch" : "Thêm giao dịch"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Nhập thông tin khoản thu hoặc chi.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {/* Type selector — segmented control */}
              <div className="mb-5">
                <p className="mb-2 text-sm font-black text-slate-700">
                  Loại giao dịch
                </p>
                <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                  <button
                    type="button"
                    onClick={() => handleTypeChange("income")}
                    className={
                      "rounded-xl py-2.5 text-sm font-bold transition-all " +
                      (form.type === "income"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    ↑ Thu
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange("expense")}
                    className={
                      "rounded-xl py-2.5 text-sm font-bold transition-all " +
                      (form.type === "expense"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    ↓ Chi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange("transfer")}
                    className={
                      "rounded-xl py-2.5 text-sm font-bold transition-all " +
                      (form.type === "transfer"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    ⇄ Chuyển
                  </button>
                </div>
              </div>

              {/* Amount — prominent input */}
              <div className="mb-4">
                <p className="mb-2 text-sm font-black text-slate-700">
                  Số tiền
                </p>
                <div
                  className={
                    "relative rounded-2xl border-2 transition-colors " +
                    (form.type === "income"
                      ? "border-emerald-200 focus-within:border-emerald-400"
                      : form.type === "transfer"
                        ? "border-blue-200 focus-within:border-blue-400"
                        : "border-rose-200 focus-within:border-rose-400")
                  }
                >
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">
                    ₫
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(form.amount)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        amount: parseCurrencyInput(e.target.value),
                      }))
                    }
                    placeholder="0"
                    className="w-full rounded-2xl bg-transparent py-4 pl-10 pr-4 text-xl font-black text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput
                  label="Ngày"
                  type="date"
                  value={form.date}
                  onChange={(v) => setForm((p) => ({ ...p, date: v }))}
                />
                {form.type === "transfer" ? (
                  <>
                    <FormSelect
                      label="Ví nguồn"
                      value={form.walletId}
                      onChange={(v) => setForm((p) => ({ ...p, walletId: v }))}
                      options={wallets.map((w) => ({
                        label: w.name,
                        value: w.id,
                      }))}
                    />
                    <FormSelect
                      label="Ví đích"
                      value={form.transferToWalletId}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, transferToWalletId: v }))
                      }
                      options={wallets
                        .filter((w) => w.id !== form.walletId)
                        .map((w) => ({ label: w.name, value: w.id }))}
                    />
                  </>
                ) : (
                  <>
                    <FormSelect
                      label="Danh mục"
                      value={form.categoryId}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, categoryId: v }))
                      }
                      options={filteredCategories.map((c) => ({
                        label: c.name,
                        value: c.id,
                      }))}
                    />
                    <FormSelect
                      label="Ví tiền"
                      value={form.walletId}
                      onChange={(v) => setForm((p) => ({ ...p, walletId: v }))}
                      options={wallets.map((w) => ({
                        label: w.name,
                        value: w.id,
                      }))}
                    />
                  </>
                )}
                <div className="sm:col-span-2">
                  <FormInput
                    label="Ghi chú"
                    value={form.note}
                    onChange={(v) => setForm((p) => ({ ...p, note: v }))}
                    placeholder={
                      form.type === "transfer"
                        ? "Chuyển tiền..."
                        : "Ăn trưa, lương tháng..."
                    }
                  />
                </div>
              </div>

              {/* Recurring toggle */}
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">Định kỳ</p>
                  <p className="text-xs text-slate-400">Lặp lại tự động</p>
                </div>
                <div className="flex items-center gap-3">
                  {form.isRecurring && (
                    <select
                      value={form.recurrence}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          recurrence: e.target.value as RecurrenceFrequency,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
                    >
                      <option value="daily">Hàng ngày</option>
                      <option value="weekly">Hàng tuần</option>
                      <option value="monthly">Hàng tháng</option>
                      <option value="yearly">Hàng năm</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({ ...p, isRecurring: !p.isRecurring }))
                    }
                    className={
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
                      (form.isRecurring ? "bg-blue-600" : "bg-slate-300")
                    }
                  >
                    <span
                      className={
                        "inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform " +
                        (form.isRecurring ? "translate-x-6" : "translate-x-1")
                      }
                    />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex gap-3">
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
                      ? "bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600"
                      : form.type === "transfer"
                        ? "bg-blue-600 shadow-blue-200 hover:bg-blue-700"
                        : "bg-rose-500 shadow-rose-200 hover:bg-rose-600")
                  }
                >
                  {form.id
                    ? "Lưu thay đổi"
                    : form.type === "transfer"
                      ? "Chuyển tiền"
                      : "Thêm giao dịch"}
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

function FilterChip({
  label,
  onRemove,
  color = "slate",
}: {
  label: string;
  onRemove: () => void;
  color?: "slate" | "emerald" | "rose";
}) {
  const styles = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div
      className={
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold " +
        styles[color]
      }
    >
      {label}
      <button
        onClick={onRemove}
        className="text-current opacity-60 hover:opacity-100"
      >
        <X size={10} />
      </button>
    </div>
  );
}

type TrendDataPoint = { month: string; thu: number; chi: number; net: number };

function TrendPanel({
  title,
  color,
  dataKey,
  data,
  chartType,
}: {
  title: string;
  color: string;
  dataKey: "thu" | "chi" | "net";
  data: TrendDataPoint[];
  chartType: "area" | "line" | "bar";
}) {
  const last = data.at(-1)?.[dataKey] ?? 0;
  const prev = data.at(-2)?.[dataKey] ?? 0;
  const delta =
    prev !== 0 ? Math.round(((last - prev) / Math.abs(prev)) * 100) : 0;
  const isUp = delta > 0;
  const isGood = dataKey !== "chi" ? isUp : !isUp;

  const cardBg =
    dataKey === "thu"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white"
      : dataKey === "chi"
        ? "border-rose-200 bg-gradient-to-br from-rose-50/60 to-white"
        : "border-blue-200 bg-gradient-to-br from-blue-50/60 to-white";

  return (
    <div
      className={
        "rounded-[2rem] border p-5 shadow-sm transition-shadow hover:shadow-md " +
        cardBg
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{title}</p>
        {prev !== 0 && (
          <span
            className={
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold " +
              (isGood
                ? "bg-emerald-50 text-emerald-600"
                : "bg-rose-50 text-rose-500")
            }
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-2.5 text-2xl font-black" style={{ color }}>
        {last.toFixed(1)}M
      </p>
      <div className="mt-3.5 h-24">
        <ResponsiveContainer width="100%" height={96} minWidth={0}>
          {chartType === "area" ? (
            <AreaChart
              data={data}
              margin={{ top: 3, right: 3, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={"grad-" + dataKey}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                fill={"url(#grad-" + dataKey + ")"}
                dot={false}
              />
            </AreaChart>
          ) : chartType === "line" ? (
            <LineChart
              data={data}
              margin={{ top: 3, right: 3, bottom: 0, left: 0 }}
            >
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 3, right: 3, bottom: 0, left: 0 }}
              barCategoryGap={5}
            >
              <Bar
                dataKey={dataKey}
                fill={color}
                radius={[4, 4, 0, 0]}
                fillOpacity={0.85}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function IntelCard({
  icon,
  title,
  accent,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  accent: "blue" | "emerald" | "rose" | "amber";
  body: string;
  tone: "good" | "warning" | "danger";
}) {
  const accentMap = {
    blue: "border-l-blue-500 bg-blue-50/60",
    emerald: "border-l-emerald-500 bg-emerald-50/60",
    rose: "border-l-rose-500 bg-rose-50/60",
    amber: "border-l-amber-500 bg-amber-50/60",
  };
  const iconMap = {
    blue: "bg-blue-100 text-blue-600",
    emerald: "bg-emerald-100 text-emerald-600",
    rose: "bg-rose-100 text-rose-600",
    amber: "bg-amber-100 text-amber-600",
  };
  return (
    <div
      className={
        "flex w-64 shrink-0 flex-col gap-2 rounded-2xl border-l-[3px] border-r border-t border-b border-slate-200 p-4 shadow-sm " +
        accentMap[accent]
      }
    >
      <div className="flex items-center gap-2">
        <div
          className={
            "flex size-7 shrink-0 items-center justify-center rounded-xl " +
            iconMap[accent]
          }
        >
          {icon}
        </div>
        <p className="text-xs font-black text-slate-800">{title}</p>
      </div>
      <p className="text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
  onAdd,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex size-20 items-center justify-center rounded-[2rem] bg-blue-50 shadow-inner">
        {hasFilters ? (
          <Search size={28} className="text-blue-300" />
        ) : (
          <ArrowDownRight size={28} className="text-blue-300" />
        )}
      </div>
      <h3 className="mt-5 text-base font-black text-slate-700">
        {hasFilters ? "Không tìm thấy kết quả" : "Chưa có giao dịch"}
      </h3>
      <p className="mt-2 max-w-[240px] text-sm leading-6 text-slate-400">
        {hasFilters
          ? "Hãy thay đổi bộ lọc hoặc từ khóa tìm kiếm."
          : "Bắt đầu bằng cách ghi lại khoản thu hoặc chi đầu tiên."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && (
          <button
            onClick={onClear}
            className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
          >
            Xóa bộ lọc
          </button>
        )}
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
        >
          <Plus size={15} />
          Thêm giao dịch
        </button>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:shadow-sm"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white"
      >
        <option value="">Chọn</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
