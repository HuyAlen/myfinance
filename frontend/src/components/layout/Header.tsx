"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Folder,
  Landmark,
  LogOut,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Target,
  User,
  Wallet,
  X,
} from "lucide-react";

import { useAuth }    from "@/src/components/auth/AuthProvider";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";
import { signOut }    from "@/src/lib/auth";

import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getTransactions,
  getWallets,
} from "@/src/services/finance/financeStorage";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet as WalletType,
} from "@/src/types/finance";

// ─── Page meta ────────────────────────────────────────────────────────────────
const PAGE_META: Record<string, { title: string; desc: string }> = {
  "/":             { title: "Tổng quan",        desc: "Financial Overview & Insights" },
  "/transactions": { title: "Giao Dịch",        desc: "Thu chi & lịch sử giao dịch" },
  "/wallets":      { title: "Ví Tiền",           desc: "Quản lý tài khoản & nguồn tiền" },
  "/budgets":      { title: "Ngân Sách",         desc: "Kế hoạch & kiểm soát chi tiêu" },
  "/goals":        { title: "Mục Tiêu",          desc: "Theo dõi tiến độ mục tiêu tài chính" },
  "/reports":      { title: "Báo cáo",           desc: "Phân tích dòng tiền & sức khoẻ tài chính" },
  "/investments":  { title: "Đầu Tư",            desc: "Danh mục & hiệu suất đầu tư" },
  "/debts":        { title: "Nợ & Khoản Vay",    desc: "Theo dõi và lập kế hoạch trả nợ" },
  "/categories":   { title: "Danh Mục",          desc: "Phân loại thu chi" },
  "/ai-insights":  { title: "AI Advisor",        desc: "Tư vấn tài chính thông minh" },
  "/settings":     { title: "Cài Đặt",           desc: "Tuỳ chỉnh ứng dụng" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type SearchResult = {
  id: string;
  label: string;
  sub: string;
  href: string;
  kind: "transaction" | "wallet" | "category" | "goal" | "debt" | "investment";
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: "warning" | "success" | "info";
  read: boolean;
};

type AppData = {
  transactions: Transaction[];
  wallets:      WalletType[];
  categories:   Category[];
  goals:        Goal[];
  budgets:      Budget[];
  debts:        Debt[];
  investments:  Investment[];
};

const EMPTY: AppData = { transactions: [], wallets: [], categories: [], goals: [], budgets: [], debts: [], investments: [] };

// ─── Build search results ─────────────────────────────────────────────────────
function buildSearchResults(query: string, data: AppData): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const out: SearchResult[] = [];

  data.transactions
    .filter((t) => t.note?.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((t) => out.push({ id: "tx-" + t.id, label: t.note || "Giao dịch", sub: t.date + " · " + (t.type === "income" ? "Thu nhập" : "Chi tiêu"), href: "/transactions", kind: "transaction" }));

  data.wallets
    .filter((w) => w.name.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((w) => out.push({ id: "wa-" + w.id, label: w.name, sub: "Ví tiền", href: "/wallets", kind: "wallet" }));

  data.categories
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((c) => out.push({ id: "ca-" + c.id, label: c.name, sub: c.type === "income" ? "Thu nhập" : "Chi tiêu", href: "/categories", kind: "category" }));

  data.goals
    .filter((g) => g.name.toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((g) => out.push({ id: "go-" + g.id, label: g.name, sub: "Mục tiêu tài chính", href: "/goals", kind: "goal" }));

  data.debts
    .filter((d) => d.name.toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((d) => out.push({ id: "de-" + d.id, label: d.name, sub: "Khoản nợ", href: "/debts", kind: "debt" }));

  data.investments
    .filter((i) => i.name.toLowerCase().includes(q) || (i.symbol ?? "").toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((i) => out.push({ id: "in-" + i.id, label: i.name, sub: i.symbol ? i.symbol + " · Đầu tư" : "Đầu tư", href: "/investments", kind: "investment" }));

  return out.slice(0, 8);
}

// ─── Build notifications ──────────────────────────────────────────────────────
function buildNotifications(data: AppData): NotificationItem[] {
  const out: NotificationItem[] = [];
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"

  // Budget alerts
  for (const budget of data.budgets.filter((b) => b.month === currentMonth)) {
    const cat   = data.categories.find((c) => c.id === budget.categoryId);
    const label = cat?.name ?? "Danh mục";
    const spent = data.transactions
      .filter((t) => t.type === "expense" && t.categoryId === budget.categoryId && t.date.startsWith(budget.month))
      .reduce((s, t) => s + t.amount, 0);
    const pct = budget.limitAmount > 0 ? (spent / budget.limitAmount) * 100 : 0;

    if (pct >= 100) {
      out.push({ id: "bover-" + budget.id, title: "Vượt ngân sách · " + label, body: "Đã chi " + Math.round(pct) + "% ngân sách tháng này.", href: "/budgets", tone: "warning", read: false });
    } else if (pct >= 80) {
      out.push({ id: "bnear-" + budget.id, title: "Gần vượt ngân sách · " + label, body: "Đã dùng " + Math.round(pct) + "% giới hạn tháng này.", href: "/budgets", tone: "warning", read: false });
    }
  }

  // Goal milestones
  for (const g of data.goals) {
    if (g.targetAmount > 0 && g.currentAmount >= g.targetAmount) {
      out.push({ id: "gdone-" + g.id, title: "Mục tiêu hoàn thành · " + g.name, body: "Chúc mừng! Bạn đã đạt được mục tiêu này.", href: "/goals", tone: "success", read: false });
    } else if (g.targetAmount > 0 && g.currentAmount / g.targetAmount >= 0.75) {
      out.push({ id: "gnear-" + g.id, title: "Sắp đạt mục tiêu · " + g.name, body: Math.round((g.currentAmount / g.targetAmount) * 100) + "% hoàn thành — gần tới đích rồi!", href: "/goals", tone: "success", read: false });
    }
  }

  // Debt risk (< 15% paid off)
  for (const d of data.debts) {
    const paidPct = d.totalAmount > 0 ? (1 - d.remainingAmount / d.totalAmount) * 100 : 100;
    if (paidPct < 15 && d.remainingAmount > 0) {
      out.push({ id: "drisk-" + d.id, title: "Nợ chưa thanh toán · " + d.name, body: "Mới hoàn trả " + Math.round(paidPct) + "%. Cân nhắc tăng tốc trả nợ.", href: "/debts", tone: "warning", read: false });
    }
  }

  // Negative cash flow this month
  const thisMonthTx = data.transactions.filter((t) => t.date.startsWith(currentMonth));
  const income  = thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = thisMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  if (thisMonthTx.length > 0 && expense > income) {
    out.push({ id: "cashflow", title: "Dòng tiền âm tháng này", body: "Chi tiêu vượt thu nhập. Kiểm tra lại ngân sách và các khoản chi.", href: "/reports", tone: "warning", read: false });
  }

  return out.slice(0, 8);
}

// ─── Month helpers ────────────────────────────────────────────────────────────
function getLast12Months(): { value: string; label: string }[] {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
      label: d.toLocaleDateString("vi-VN", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

// ─── KindIcon ─────────────────────────────────────────────────────────────────
function KindIcon({ kind }: { kind: SearchResult["kind"] }) {
  const cls = "shrink-0 text-slate-400";
  switch (kind) {
    case "transaction": return <ReceiptText    size={14} className={cls} />;
    case "wallet":      return <Wallet         size={14} className={cls} />;
    case "category":    return <Folder         size={14} className={cls} />;
    case "goal":        return <Target         size={14} className={cls} />;
    case "debt":        return <Landmark       size={14} className={cls} />;
    case "investment":  return <BriefcaseBusiness size={14} className={cls} />;
    default:            return <Search         size={14} className={cls} />;
  }
}

const KIND_LABELS: Record<SearchResult["kind"], string> = {
  transaction: "Giao dịch",
  wallet:      "Ví tiền",
  category:    "Danh mục",
  goal:        "Mục tiêu",
  debt:        "Nợ",
  investment:  "Đầu tư",
};

// ─── Realtime status chip ─────────────────────────────────────────────────────
function RealtimeStatusChip() {
  const { status, lastSync } = useRealtime();
  const connected = status === "SUBSCRIBED";
  const timeStr   = lastSync
    ? lastSync.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
      title={connected ? "Realtime đang kết nối" : "Đang kết nối..."}
    >
      <span className={["size-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse"].join(" ")} />
      <span className="hidden text-slate-500 sm:block">
        {timeStr ? "Đồng bộ: " + timeStr : connected ? "Đã kết nối" : "Đang kết nối..."}
      </span>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
type HeaderProps = { onMenuOpen: () => void; sidebarOpen?: boolean };

export default function Header({ onMenuOpen, sidebarOpen = false }: HeaderProps) {
  const { user } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  // UI toggles
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [notifOpen,    setNotifOpen]      = useState(false);
  const [searchFocus,  setSearchFocus]    = useState(false);
  const [monthOpen,    setMonthOpen]      = useState(false);
  const [searchQuery,  setSearchQuery]    = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // App data (loaded once for search + notifications)
  const [appData,   setAppData]   = useState<AppData>(EMPTY);
  const [notifList, setNotifList] = useState<NotificationItem[]>([]);
  const loadedRef = useRef(false);

  // Derived
  const pageMeta      = PAGE_META[pathname] ?? { title: "MyFinance", desc: "" };
  const avatarLetter  = user?.email?.[0]?.toUpperCase() ?? "U";
  const displayEmail  = user?.email ?? "";
  const unreadCount   = notifList.filter((n) => !n.read).length;
  const searchResults = buildSearchResults(searchQuery, appData);
  const showDrop      = searchFocus && searchQuery.trim().length > 0;
  const months12      = getLast12Months();
  const monthLabel    = months12.find((m) => m.value === selectedMonth)?.label
    ?? new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  // Load all data once on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const [transactions, wallets, categories, goals, budgets, debts, investments] = await Promise.all([
        getTransactions(), getWallets(), getCategories(), getGoals(), getBudgets(), getDebts(), getInvestments(),
      ]);
      const data: AppData = { transactions, wallets, categories, goals, budgets, debts, investments };
      setAppData(data);
      setNotifList(buildNotifications(data));
    })();
  }, []);

  // Handlers
  async function handleLogout() {
    setDropdownOpen(false);
    await signOut();
    router.replace("/login");
  }

  function handleSelectMonth(month: string) {
    setSelectedMonth(month);
    setMonthOpen(false);
    // Persist month in URL so pages can read via useSearchParams().get("month")
    router.replace(pathname + "?month=" + month);
  }

  function handleNotifClick(href: string, id: string) {
    setNotifList((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setNotifOpen(false);
    router.push(href);
  }

  function handleMarkAllRead() {
    setNotifList((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleAIAdvisor() {
    if (pathname === "/ai-insights") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push("/ai-insights");
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSearchQuery("");
      setSearchFocus(false);
    } else if (e.key === "Enter" && searchResults.length > 0) {
      router.push(searchResults[0].href);
      setSearchQuery("");
      setSearchFocus(false);
    }
  }

  function closeAll() {
    setDropdownOpen(false);
    setNotifOpen(false);
    setMonthOpen(false);
    setSearchFocus(false);
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">

        {/* ══ LEFT ══ */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Hamburger mobile */}
          <button onClick={onMenuOpen} aria-label="Mở menu" aria-expanded={sidebarOpen} aria-controls="sidebar"
            className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden">
            <span className="flex h-[22px] w-[22px] flex-col items-center justify-center gap-[5px]">
              <span className={["h-[2px] w-[18px] rounded-full bg-current origin-center transition-all duration-300", sidebarOpen ? "translate-y-[7px] rotate-45" : ""].join(" ")} />
              <span className={["h-[2px] w-[18px] rounded-full bg-current transition-all duration-300",               sidebarOpen ? "opacity-0 scale-x-0"       : ""].join(" ")} />
              <span className={["h-[2px] w-[18px] rounded-full bg-current origin-center transition-all duration-300", sidebarOpen ? "-translate-y-[7px] -rotate-45" : ""].join(" ")} />
            </span>
          </button>

          {/* Page title */}
          <div className="min-w-0">
            <h2 className="truncate text-base font-black tracking-tight text-slate-900 sm:text-lg">{pageMeta.title}</h2>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{pageMeta.desc}</p>
          </div>
        </div>

        {/* ══ CENTER: Global Search ══ */}
        <div className="relative hidden flex-1 max-w-sm md:block">
          {/* click-outside backdrop */}
          {showDrop && (
            <div className="fixed inset-0 z-40" onClick={() => { setSearchFocus(false); setSearchQuery(""); }} />
          )}

          <div className={["flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm shadow-sm transition-all", searchFocus ? "border-blue-300 bg-white shadow-md" : "border-slate-200 bg-slate-50"].join(" ")}>
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              className="w-full bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
              placeholder="Tìm giao dịch, ví, mục tiêu..."
              value={searchQuery}
              onFocus={() => setSearchFocus(true)}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchFocus(true); }}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchFocus(false); }}
                className="text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {showDrop && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
              {searchResults.length > 0 ? (
                <>
                  {searchResults.map((r) => (
                    <button key={r.id}
                      onClick={() => { router.push(r.href); setSearchQuery(""); setSearchFocus(false); }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-blue-50">
                      <KindIcon kind={r.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{r.label}</p>
                        <p className="text-xs text-slate-400">{r.sub}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        {KIND_LABELS[r.kind]}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
                    Enter — mở kết quả đầu tiên · Esc — đóng
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-8 text-sm">
                  <Search size={24} className="mb-2 text-slate-200" />
                  <p className="text-slate-400">Không tìm thấy kết quả</p>
                  <p className="mt-0.5 text-xs text-slate-300">Thử từ khóa khác</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT ══ */}
        <div className="flex items-center gap-2">

          {/* Month picker */}
          <div className="relative hidden md:block">
            <button onClick={() => { setMonthOpen((v) => !v); setDropdownOpen(false); setNotifOpen(false); }}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-700">
              {monthLabel}
              <ChevronDown size={11} className={["text-slate-400 transition-transform duration-200", monthOpen ? "rotate-180" : ""].join(" ")} />
            </button>
            {monthOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMonthOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-52 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                  {months12.map((m) => (
                    <button key={m.value} onClick={() => handleSelectMonth(m.value)}
                      className={"flex w-full items-center justify-between px-4 py-2.5 text-sm transition hover:bg-blue-50 " + (m.value === selectedMonth ? "bg-blue-50 font-black text-blue-700" : "text-slate-600 font-medium")}>
                      <span>{m.label}</span>
                      {m.value === selectedMonth && <span className="size-1.5 rounded-full bg-blue-500" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* AI Advisor */}
          <button onClick={handleAIAdvisor}
            className="hidden items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-200/60 transition hover:opacity-90 active:scale-[.98] md:flex">
            <Sparkles size={14} />
            AI Cố vấn
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen((v) => !v); setDropdownOpen(false); setMonthOpen(false); }}
              className="relative rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
              aria-label="Thông báo"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-900">Thông báo</p>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-600">{unreadCount} mới</span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifList.length > 0 ? notifList.map((n) => {
                      const dot = n.tone === "warning" ? "bg-amber-400" : n.tone === "success" ? "bg-emerald-500" : "bg-blue-500";
                      const bg  = n.read ? "" : n.tone === "warning" ? "bg-amber-50" : n.tone === "success" ? "bg-emerald-50" : "bg-blue-50";
                      return (
                        <button key={n.id} onClick={() => handleNotifClick(n.href, n.id)}
                          className={"flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 " + bg}>
                          <span className={"mt-1.5 size-2 shrink-0 rounded-full " + dot + (n.read ? " opacity-30" : "")} />
                          <div className="min-w-0 flex-1">
                            <p className={"text-xs font-bold " + (n.read ? "text-slate-400" : "text-slate-800")}>{n.title}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{n.body}</p>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="flex flex-col items-center py-10">
                        <Bell size={28} className="mb-2 text-slate-200" />
                        <p className="text-sm text-slate-400">Không có thông báo mới</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Realtime status */}
          <RealtimeStatusChip />

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={() => { setDropdownOpen((v) => !v); setNotifOpen(false); setMonthOpen(false); }}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition hover:bg-slate-50 active:scale-[.98]"
            >
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-black text-white">
                {avatarLetter}
              </div>
              <span className="hidden max-w-[140px] truncate text-sm font-semibold text-slate-700 md:block">
                {displayEmail}
              </span>
              <ChevronDown size={13} className={["text-slate-400 transition-transform duration-200", dropdownOpen ? "rotate-180" : ""].join(" ")} />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                  {/* User info */}
                  <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-cyan-50 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-black text-white shadow-sm">
                        {avatarLetter}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{displayEmail}</p>
                        <p className="text-[11px] text-slate-500">Tài khoản cá nhân</p>
                      </div>
                    </div>
                  </div>

                  {/* Profile */}
                  <Link href="/settings" onClick={closeAll}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50">
                    <User size={15} className="text-slate-400" />
                    Hồ sơ cá nhân
                  </Link>

                  {/* Settings */}
                  <Link href="/settings" onClick={closeAll}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50">
                    <Settings size={15} className="text-slate-400" />
                    Cài đặt
                  </Link>

                  {/* Logout */}
                  <button onClick={handleLogout}
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">
                    <LogOut size={15} />
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
