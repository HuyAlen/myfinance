"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

import { useAuth } from "@/src/components/auth/AuthProvider";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";
import {
  useDateFilter,
  type DateFilterMode,
} from "../layout/DateFilterProvider";
import { signOut } from "@/src/lib/auth";

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
  "/": { title: "Tổng quan", desc: "Financial Overview & Insights" },
  "/transactions": { title: "Giao Dịch", desc: "Thu chi & lịch sử giao dịch" },
  "/wallets": { title: "Ví Tiền", desc: "Quản lý tài khoản & nguồn tiền" },
  "/budgets": { title: "Ngân Sách", desc: "Kế hoạch & kiểm soát chi tiêu" },
  "/goals": { title: "Mục Tiêu", desc: "Theo dõi tiến độ mục tiêu tài chính" },
  "/reports": {
    title: "Báo cáo",
    desc: "Phân tích dòng tiền & sức khoẻ tài chính",
  },
  "/savings": {
    title: "Tiết kiệm",
    desc: "Sổ tiết kiệm, quỹ khẩn cấp & tiền gửi",
  },
  "/investments": { title: "Đầu Tư", desc: "Danh mục & hiệu suất đầu tư" },
  "/debts": {
    title: "Nợ & Khoản Vay",
    desc: "Theo dõi và lập kế hoạch trả nợ",
  },
  "/categories": { title: "Danh Mục", desc: "Phân loại thu chi" },
  "/ai-insights": { title: "AI Advisor", desc: "Tư vấn tài chính thông minh" },
  "/settings": { title: "Cài Đặt", desc: "Tuỳ chỉnh ứng dụng" },
  "/help": {
    title: "Hướng Dẫn",
    desc: "Onboarding, tính năng & câu hỏi thường gặp",
  },
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
  wallets: WalletType[];
  categories: Category[];
  goals: Goal[];
  budgets: Budget[];
  debts: Debt[];
  investments: Investment[];
};

const EMPTY: AppData = {
  transactions: [],
  wallets: [],
  categories: [],
  goals: [],
  budgets: [],
  debts: [],
  investments: [],
};

// ─── Build search results ─────────────────────────────────────────────────────
function buildSearchResults(query: string, data: AppData): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const out: SearchResult[] = [];

  data.transactions
    .filter((t) => t.note?.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((t) =>
      out.push({
        id: "tx-" + t.id,
        label: t.note || "Giao dịch",
        sub: t.date + " · " + (t.type === "income" ? "Thu nhập" : "Chi tiêu"),
        href: "/transactions",
        kind: "transaction",
      }),
    );

  data.wallets
    .filter((w) => w.name.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((w) =>
      out.push({
        id: "wa-" + w.id,
        label: w.name,
        sub: "Ví tiền",
        href: "/wallets",
        kind: "wallet",
      }),
    );

  data.categories
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, 2)
    .forEach((c) =>
      out.push({
        id: "ca-" + c.id,
        label: c.name,
        sub: c.type === "income" ? "Thu nhập" : "Chi tiêu",
        href: "/categories",
        kind: "category",
      }),
    );

  data.goals
    .filter((g) => g.name.toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((g) =>
      out.push({
        id: "go-" + g.id,
        label: g.name,
        sub: "Mục tiêu tài chính",
        href: "/goals",
        kind: "goal",
      }),
    );

  data.debts
    .filter((d) => d.name.toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((d) =>
      out.push({
        id: "de-" + d.id,
        label: d.name,
        sub: "Khoản nợ",
        href: "/debts",
        kind: "debt",
      }),
    );

  data.investments
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.symbol ?? "").toLowerCase().includes(q),
    )
    .slice(0, 1)
    .forEach((i) =>
      out.push({
        id: "in-" + i.id,
        label: i.name,
        sub: i.symbol ? i.symbol + " · Đầu tư" : "Đầu tư",
        href: "/investments",
        kind: "investment",
      }),
    );

  return out.slice(0, 8);
}

// ─── Build notifications ──────────────────────────────────────────────────────
function buildNotifications(data: AppData): NotificationItem[] {
  const out: NotificationItem[] = [];
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"

  // Budget alerts
  for (const budget of data.budgets.filter((b) => b.month === currentMonth)) {
    const cat = data.categories.find((c) => c.id === budget.categoryId);
    const label = cat?.name ?? "Danh mục";
    const spent = data.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.categoryId === budget.categoryId &&
          t.date.startsWith(budget.month),
      )
      .reduce((s, t) => s + t.amount, 0);
    const pct = budget.limitAmount > 0 ? (spent / budget.limitAmount) * 100 : 0;

    if (pct >= 100) {
      out.push({
        id: "bover-" + budget.id,
        title: "Vượt ngân sách · " + label,
        body: "Đã chi " + Math.round(pct) + "% ngân sách tháng này.",
        href: "/budgets",
        tone: "warning",
        read: false,
      });
    } else if (pct >= 80) {
      out.push({
        id: "bnear-" + budget.id,
        title: "Gần vượt ngân sách · " + label,
        body: "Đã dùng " + Math.round(pct) + "% giới hạn tháng này.",
        href: "/budgets",
        tone: "warning",
        read: false,
      });
    }
  }

  // Goal milestones
  for (const g of data.goals) {
    if (g.targetAmount > 0 && g.currentAmount >= g.targetAmount) {
      out.push({
        id: "gdone-" + g.id,
        title: "Mục tiêu hoàn thành · " + g.name,
        body: "Chúc mừng! Bạn đã đạt được mục tiêu này.",
        href: "/goals",
        tone: "success",
        read: false,
      });
    } else if (g.targetAmount > 0 && g.currentAmount / g.targetAmount >= 0.75) {
      out.push({
        id: "gnear-" + g.id,
        title: "Sắp đạt mục tiêu · " + g.name,
        body:
          Math.round((g.currentAmount / g.targetAmount) * 100) +
          "% hoàn thành — gần tới đích rồi!",
        href: "/goals",
        tone: "success",
        read: false,
      });
    }
  }

  // Debt risk (< 15% paid off)
  for (const d of data.debts) {
    const paidPct =
      d.totalAmount > 0 ? (1 - d.remainingAmount / d.totalAmount) * 100 : 100;
    if (paidPct < 15 && d.remainingAmount > 0) {
      out.push({
        id: "drisk-" + d.id,
        title: "Nợ chưa thanh toán · " + d.name,
        body:
          "Mới hoàn trả " +
          Math.round(paidPct) +
          "%. Cân nhắc tăng tốc trả nợ.",
        href: "/debts",
        tone: "warning",
        read: false,
      });
    }
  }

  // Negative cash flow this month
  const thisMonthTx = data.transactions.filter((t) =>
    t.date.startsWith(currentMonth),
  );
  const income = thisMonthTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = thisMonthTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  if (thisMonthTx.length > 0 && expense > income) {
    out.push({
      id: "cashflow",
      title: "Dòng tiền âm tháng này",
      body: "Chi tiêu vượt thu nhập. Kiểm tra lại ngân sách và các khoản chi.",
      href: "/reports",
      tone: "warning",
      read: false,
    });
  }

  return out.slice(0, 8);
}

// ─── KindIcon ─────────────────────────────────────────────────────────────────
function KindIcon({ kind }: { kind: SearchResult["kind"] }) {
  const cls = "shrink-0 text-slate-400";
  switch (kind) {
    case "transaction":
      return <ReceiptText size={14} className={cls} />;
    case "wallet":
      return <Wallet size={14} className={cls} />;
    case "category":
      return <Folder size={14} className={cls} />;
    case "goal":
      return <Target size={14} className={cls} />;
    case "debt":
      return <Landmark size={14} className={cls} />;
    case "investment":
      return <BriefcaseBusiness size={14} className={cls} />;
    default:
      return <Search size={14} className={cls} />;
  }
}

const KIND_LABELS: Record<SearchResult["kind"], string> = {
  transaction: "Giao dịch",
  wallet: "Ví tiền",
  category: "Danh mục",
  goal: "Mục tiêu",
  debt: "Nợ",
  investment: "Đầu tư",
};

const NOTIFICATION_STORAGE_KEY = "myfinance_read_notifications";

function readNotificationIds(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistNotificationIds(ids: Iterable<string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      NOTIFICATION_STORAGE_KEY,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Ignore localStorage errors.
  }
}

// ─── Realtime status chip ─────────────────────────────────────────────────────
function RealtimeStatusChip() {
  const { status, lastSync } = useRealtime();
  const connected = status === "SUBSCRIBED";
  const timeStr = lastSync
    ? lastSync.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-500 shadow-sm"
      title={
        connected
          ? timeStr
            ? "Đã đồng bộ lúc " + timeStr
            : "Realtime đang kết nối"
          : "Đang kết nối..."
      }
    >
      <span
        className={[
          "size-2 rounded-full",
          connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse",
        ].join(" ")}
      />
      <span className="hidden sm:block">
        {connected ? "Online" : "Sync..."}
      </span>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
type HeaderProps = { onMenuOpen: () => void; sidebarOpen?: boolean };

export default function Header({
  onMenuOpen,
  sidebarOpen = false,
}: HeaderProps) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const {
    filterMode,
    setFilterMode,
    selectedMonth,
    selectedQuarter,
    selectedYear,
    setSelectedMonth,
    setSelectedQuarter,
    setSelectedYearFilter,
    setCustomRange,
    dateRange,
  } = useDateFilter();

  // UI toggles
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customStart, setCustomStart] = useState(dateRange.startDate);
  const [customEnd, setCustomEnd] = useState(dateRange.endDate);

  // App data (loaded once for search + notifications)
  const [appData, setAppData] = useState<AppData>(EMPTY);
  const [notifList, setNotifList] = useState<NotificationItem[]>([]);
  const loadedRef = useRef(false);

  // Derived
  const pageMeta = PAGE_META[pathname] ?? { title: "MyFinance", desc: "" };
  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? "U";
  const displayEmail = user?.email ?? "";
  const displayName = displayEmail
    ? displayEmail.split("@")[0].replace(/[._-]+/g, " ")
    : "Tài khoản";
  const compactName = displayName
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const unreadCount = notifList.filter((n) => !n.read).length;
  const searchResults = buildSearchResults(searchQuery, appData);
  const showDrop = searchFocus && searchQuery.trim().length > 0;

  // Load all data once on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const [
        transactions,
        wallets,
        categories,
        goals,
        budgets,
        debts,
        investments,
      ] = await Promise.all([
        getTransactions(),
        getWallets(),
        getCategories(),
        getGoals(),
        getBudgets(),
        getDebts(),
        getInvestments(),
      ]);
      const data: AppData = {
        transactions,
        wallets,
        categories,
        goals,
        budgets,
        debts,
        investments,
      };
      setAppData(data);

      const readIds = readNotificationIds();
      setNotifList(
        buildNotifications(data).map((notification) => ({
          ...notification,
          read: readIds.has(notification.id),
        })),
      );
    })();
  }, []);

  // Handlers
  async function handleLogout() {
    setDropdownOpen(false);
    await signOut();
    router.replace("/login");
  }

  function updateUrlFilter(key: string, value: string) {
    router.replace(`${pathname}?${key}=${encodeURIComponent(value)}`);
  }

  function handleSelectMonth(month: string) {
    setSelectedMonth(month);
    setMonthOpen(false);
    updateUrlFilter("month", month);
  }

  function handleSelectQuarter(quarter: string) {
    setSelectedQuarter(quarter);
    setMonthOpen(false);
    updateUrlFilter("quarter", quarter);
  }

  function handleSelectYear(year: string) {
    setSelectedYearFilter(Number(year));
    setMonthOpen(false);
    updateUrlFilter("year", year);
  }

  function formatCompactMonth(monthKey: string) {
    const [year, month] = monthKey.split("-");
    return `${month}/${year}`;
  }

  function formatTimelineLabel() {
    if (filterMode === "month") return formatCompactMonth(selectedMonth);
    if (filterMode === "quarter") return selectedQuarter.replace("-Q", " · Q");
    if (filterMode === "year") return String(selectedYear);
    return "Tùy chọn";
  }

  const selectedMonthNumber = Number(selectedMonth.split("-")[1] ?? "1");
  const selectedQuarterNumber = Number(selectedQuarter.split("-Q")[1] ?? "1");

  const monthOptionsForYear = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const value = `${selectedYear}-${String(month).padStart(2, "0")}`;
      return {
        value,
        label: `${String(month).padStart(2, "0")}/${selectedYear}`,
      };
    });
  }, [selectedYear]);

  const quarterOptionsForYear = useMemo(() => {
    return [1, 2, 3, 4].map((quarter) => {
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      return {
        value: `${selectedYear}-Q${quarter}`,
        label: `Quý ${quarter}/${selectedYear}`,
        subLabel: `Tháng ${startMonth} - ${endMonth}/${selectedYear}`,
      };
    });
  }, [selectedYear]);

  const yearOptionsAroundSelected = useMemo(() => {
    return Array.from({ length: 9 }, (_, index) =>
      String(selectedYear - 4 + index),
    );
  }, [selectedYear]);

  function shiftMonthYear(offset: number) {
    const nextYear = selectedYear + offset;
    const nextMonth = `${nextYear}-${String(selectedMonthNumber).padStart(2, "0")}`;
    setSelectedMonth(nextMonth);
    updateUrlFilter("month", nextMonth);
  }

  function shiftQuarterYear(offset: number) {
    const nextYear = selectedYear + offset;
    const nextQuarter = `${nextYear}-Q${selectedQuarterNumber}`;
    setSelectedQuarter(nextQuarter);
    updateUrlFilter("quarter", nextQuarter);
  }

  function shiftMonth(offset: number) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextMonth);
    updateUrlFilter("month", nextMonth);
  }

  function shiftQuarter(offset: number) {
    const [yearRaw, quarterRaw] = selectedQuarter.split("-Q");
    const absolute = Number(yearRaw) * 4 + Number(quarterRaw) - 1 + offset;
    const year = Math.floor(absolute / 4);
    const quarter = (absolute % 4) + 1;
    const nextQuarter = `${year}-Q${quarter}`;
    setSelectedQuarter(nextQuarter);
    updateUrlFilter("quarter", nextQuarter);
  }

  function shiftYear(offset: number) {
    const nextYear = selectedYear + offset;
    setSelectedYearFilter(nextYear);
    updateUrlFilter("year", String(nextYear));
  }

  function handleTimelineStep(offset: number) {
    if (filterMode === "quarter") {
      shiftQuarter(offset);
      return;
    }

    if (filterMode === "year") {
      shiftYear(offset);
      return;
    }

    if (filterMode === "custom") {
      setMonthOpen(true);
      return;
    }

    shiftMonth(offset);
  }

  function handleApplyCurrentMode() {
    setMonthOpen(false);

    if (filterMode === "quarter") {
      updateUrlFilter("quarter", selectedQuarter);
      return;
    }

    if (filterMode === "year") {
      updateUrlFilter("year", String(selectedYear));
      return;
    }

    if (filterMode === "custom") {
      handleApplyCustomRange();
      return;
    }

    updateUrlFilter("month", selectedMonth);
  }

  function handleApplyCustomRange() {
    setCustomRange(customStart, customEnd);
    setMonthOpen(false);
    updateUrlFilter("range", `${customStart}_${customEnd}`);
  }

  function handleNotifClick(href: string, id: string) {
    const readIds = readNotificationIds();
    readIds.add(id);
    persistNotificationIds(readIds);

    setNotifList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setNotifOpen(false);
    router.push(href);
  }

  function handleMarkAllRead() {
    setNotifList((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persistNotificationIds(next.map((n) => n.id));
      return next;
    });
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
    <header className="sticky top-0 z-30 h-auto shrink-0 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-xl sm:px-6 lg:h-18 lg:px-8">
      <div className="flex h-18 items-center justify-between gap-3 sm:gap-5 lg:h-full">
        {/* ══ LEFT ══ */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {/* Hamburger mobile */}
          <button
            onClick={onMenuOpen}
            aria-label="Mở menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            className="min-h-11 min-w-11 rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          >
            <span className="flex h-5.5 w-5.5 flex-col items-center justify-center gap-1.25">
              <span
                className={[
                  "h-0.5 w-4.5 rounded-full bg-current origin-center transition-all duration-300",
                  sidebarOpen ? "translate-y-1.75 rotate-45" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-0.5 w-4.5 rounded-full bg-current transition-all duration-300",
                  sidebarOpen ? "opacity-0 scale-x-0" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-0.5 w-4.5 rounded-full bg-current origin-center transition-all duration-300",
                  sidebarOpen ? "-translate-y-1.75 -rotate-45" : "",
                ].join(" ")}
              />
            </span>
          </button>

          {/* Page title */}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-black tracking-tight text-slate-900 sm:text-[22px] sm:leading-7">
              {pageMeta.title}
            </h2>
            <p className="hidden truncate text-[11px] font-medium text-slate-400 lg:block">
              {pageMeta.desc}
            </p>
          </div>
        </div>

        {/* ══ CENTER: Global Search ══ */}
        <div className="relative hidden w-full max-w-115 flex-1 lg:block">
          {/* click-outside backdrop */}
          {showDrop && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setSearchFocus(false);
                setSearchQuery("");
              }}
            />
          )}

          <div
            className={[
              "flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm shadow-sm transition-all",
              searchFocus
                ? "border-blue-300 bg-white shadow-md"
                : "border-slate-200 bg-slate-50",
            ].join(" ")}
          >
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              className="w-full bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
              placeholder="Tìm giao dịch, ví, mục tiêu..."
              value={searchQuery}
              onFocus={() => setSearchFocus(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchFocus(true);
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchFocus(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
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
                    <button
                      key={r.id}
                      onClick={() => {
                        router.push(r.href);
                        setSearchQuery("");
                        setSearchFocus(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-blue-50"
                    >
                      <KindIcon kind={r.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">
                          {r.label}
                        </p>
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
                  <p className="mt-0.5 text-xs text-slate-300">
                    Thử từ khóa khác
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT ══ */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Period timeline picker */}
          <div className="relative hidden md:block">
            <div
              className={[
                "flex h-11 items-center overflow-hidden rounded-2xl border bg-slate-50/90 shadow-sm transition",
                monthOpen
                  ? "border-blue-300 shadow-md shadow-blue-100"
                  : "border-slate-200 hover:border-blue-200 hover:bg-white",
              ].join(" ")}
              title="Kỳ báo cáo dùng chung cho toàn bộ ứng dụng"
            >
              <button
                type="button"
                onClick={() => handleTimelineStep(-1)}
                className="flex h-11 w-9 items-center justify-center text-slate-400 transition hover:bg-white hover:text-blue-600"
                aria-label="Kỳ trước"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMonthOpen((v) => !v);
                  setDropdownOpen(false);
                  setNotifOpen(false);
                }}
                className="flex h-11 min-w-33 items-center justify-center gap-2 border-x border-slate-200 px-3 text-sm font-black text-slate-900 transition hover:bg-white"
                aria-haspopup="dialog"
                aria-expanded={monthOpen}
              >
                <CalendarDays size={15} className="text-blue-600" />
                <span className="whitespace-nowrap">
                  {formatTimelineLabel()}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleTimelineStep(1)}
                className="flex h-11 w-9 items-center justify-center text-slate-400 transition hover:bg-white hover:text-blue-600"
                aria-label="Kỳ sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {monthOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMonthOpen(false)}
                />
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-90 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-200/70"
                  role="dialog"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        Kỳ báo cáo
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-400">
                        Áp dụng cho Dashboard, Giao dịch, Ngân sách và Báo cáo
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                      {formatTimelineLabel()}
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 text-xs font-black">
                    {(
                      [
                        ["month", "Tháng"],
                        ["quarter", "Quý"],
                        ["year", "Năm"],
                        ["custom", "Tùy chọn"],
                      ] as Array<[DateFilterMode, string]>
                    ).map(([mode, label]) => {
                      const active = filterMode === mode;

                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setFilterMode(mode);
                            if (mode === "custom") {
                              setCustomStart(dateRange.startDate);
                              setCustomEnd(dateRange.endDate);
                            }
                          }}
                          className={[
                            "rounded-xl px-2 py-2 transition",
                            active
                              ? "bg-white text-blue-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-900",
                          ].join(" ")}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {filterMode === "month" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        <button
                          type="button"
                          onClick={() => shiftMonthYear(-1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm trước"
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <div className="text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            Đang xem
                          </p>
                          <p className="text-lg font-black text-slate-900">
                            {selectedYear}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => shiftMonthYear(1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm sau"
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {monthOptionsForYear.map((m) => {
                          const active = m.value === selectedMonth;

                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => handleSelectMonth(m.value)}
                              className={[
                                "rounded-2xl border px-3 py-2.5 text-sm font-black transition",
                                active
                                  ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                              ].join(" ")}
                            >
                              {formatCompactMonth(m.value)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {filterMode === "quarter" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        <button
                          type="button"
                          onClick={() => shiftQuarterYear(-1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm trước"
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <div className="text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            Đang xem
                          </p>
                          <p className="text-lg font-black text-slate-900">
                            {selectedYear}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => shiftQuarterYear(1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm sau"
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {quarterOptionsForYear.map((q) => {
                          const active = q.value === selectedQuarter;

                          return (
                            <button
                              key={q.value}
                              type="button"
                              onClick={() => handleSelectQuarter(q.value)}
                              className={[
                                "rounded-2xl border px-3 py-2.5 text-left transition",
                                active
                                  ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                              ].join(" ")}
                            >
                              <span className="block text-sm font-black">
                                {q.label}
                              </span>
                              <span
                                className={[
                                  "block text-[11px] font-semibold",
                                  active ? "text-blue-100" : "text-slate-400",
                                ].join(" ")}
                              >
                                {q.subLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {filterMode === "year" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        <button
                          type="button"
                          onClick={() => shiftYear(-1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm trước"
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <div className="text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            Đang xem
                          </p>
                          <p className="text-lg font-black text-slate-900">
                            {selectedYear}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => shiftYear(1)}
                          className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-blue-600"
                          aria-label="Năm sau"
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {yearOptionsAroundSelected.map((year) => {
                          const active = Number(year) === selectedYear;

                          return (
                            <button
                              key={year}
                              type="button"
                              onClick={() => handleSelectYear(year)}
                              className={[
                                "rounded-2xl border px-3 py-2.5 text-sm font-black transition",
                                active
                                  ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                              ].join(" ")}
                            >
                              {year}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {filterMode === "custom" && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs font-bold text-slate-500">
                          Từ ngày
                          <input
                            type="date"
                            value={customStart}
                            onChange={(event) =>
                              setCustomStart(event.target.value)
                            }
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300"
                          />
                        </label>
                        <label className="text-xs font-bold text-slate-500">
                          Đến ngày
                          <input
                            type="date"
                            value={customEnd}
                            onChange={(event) =>
                              setCustomEnd(event.target.value)
                            }
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleApplyCurrentMode}
                    className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
                  >
                    Áp dụng kỳ báo cáo
                  </button>
                </div>
              </>
            )}
          </div>

          {/* AI Advisor */}
          <button
            onClick={handleAIAdvisor}
            className="hidden h-11 items-center gap-2 rounded-2xl bg-linear-to-r from-blue-600 to-cyan-500 px-3 text-xs font-black text-white shadow-lg shadow-blue-200/60 transition hover:opacity-90 active:scale-[.98] md:flex"
            title="Mở AI cố vấn tài chính"
          >
            <Sparkles size={14} />
            <span className="hidden xl:inline">AI</span>
            <span className="hidden rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide xl:inline">
              Beta
            </span>
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setDropdownOpen(false);
                setMonthOpen(false);
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white p-0 text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
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
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotifOpen(false)}
                />
                <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      <p className="text-sm font-black text-slate-900">
                        Thông báo
                      </p>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-600">
                          {unreadCount} mới
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifList.length > 0 ? (
                      notifList.map((n) => {
                        const dot =
                          n.tone === "warning"
                            ? "bg-amber-400"
                            : n.tone === "success"
                              ? "bg-emerald-500"
                              : "bg-blue-500";
                        const bg = n.read
                          ? ""
                          : n.tone === "warning"
                            ? "bg-amber-50"
                            : n.tone === "success"
                              ? "bg-emerald-50"
                              : "bg-blue-50";
                        return (
                          <button
                            key={n.id}
                            onClick={() => handleNotifClick(n.href, n.id)}
                            className={
                              "flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 " +
                              bg
                            }
                          >
                            <span
                              className={
                                "mt-1.5 size-2 shrink-0 rounded-full " +
                                dot +
                                (n.read ? " opacity-30" : "")
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={
                                  "text-xs font-bold " +
                                  (n.read ? "text-slate-400" : "text-slate-800")
                                }
                              >
                                {n.title}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                                {n.body}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center py-10">
                        <Bell size={28} className="mb-2 text-slate-200" />
                        <p className="text-sm text-slate-400">
                          Không có thông báo mới
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Realtime status */}
          <div className="hidden sm:block">
            <RealtimeStatusChip />
          </div>

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setDropdownOpen((v) => !v);
                setNotifOpen(false);
                setMonthOpen(false);
              }}
              className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2 shadow-sm transition hover:bg-slate-50 active:scale-[.98] sm:pr-3"
            >
              <div className="flex size-8 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-cyan-500 text-sm font-black text-white">
                {avatarLetter}
              </div>
              <span className="hidden max-w-32 truncate text-sm font-bold text-slate-700 xl:block">
                {compactName}
              </span>
              <ChevronDown
                size={13}
                className={[
                  "text-slate-400 transition-transform duration-200",
                  dropdownOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
                  {/* User info */}
                  <div className="border-b border-slate-100 bg-linear-to-br from-blue-50 to-cyan-50 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-cyan-500 text-sm font-black text-white shadow-sm">
                        {avatarLetter}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">
                          {compactName}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {displayEmail}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profile */}
                  <Link
                    href="/settings"
                    onClick={closeAll}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    <User size={15} className="text-slate-400" />
                    Hồ sơ cá nhân
                  </Link>

                  {/* Settings */}
                  <Link
                    href="/settings"
                    onClick={closeAll}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    <Settings size={15} className="text-slate-400" />
                    Cài đặt
                  </Link>

                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut size={15} />
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile/PWA period picker */}
      <div className="border-t border-slate-100 bg-white/95 pb-3 pt-2 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilterMode("month");
              shiftMonth(-1);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-[.98]"
            aria-label="Tháng trước"
          >
            <ChevronLeft size={18} />
          </button>

          <label className="relative flex h-11 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 shadow-sm active:scale-[.99]">
            <CalendarDays size={16} className="shrink-0 text-blue-600" />
            <span className="pointer-events-none min-w-0 flex-1 text-center text-[16px] font-black text-slate-900">
              {formatCompactMonth(selectedMonth)}
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                setFilterMode("month");
                handleSelectMonth(event.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 scheme-light"
              aria-label="Chọn tháng báo cáo"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setFilterMode("month");
              shiftMonth(1);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-[.98]"
            aria-label="Tháng sau"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
