"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
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
  Moon,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  PiggyBank,
  User,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/AuthProvider";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { useTheme } from "@/src/components/theme/ThemeProvider";
import {
  useRealtime,
  useRealtimeTable,
} from "@/src/components/realtime/RealtimeProvider";
import {
  useDateFilter,
  type DateFilterMode,
} from "../layout/DateFilterProvider";
import { signOut } from "@/src/lib/auth";
import {
  buildFinanceNotifications,
  getCurrentLocalMonthKey,
} from "@/src/lib/notifications/financeNotifications";
import {
  advanceNotificationFirstSeen,
  sortNotificationsNewestFirst,
  type NotificationFirstSeenMap,
} from "@/src/lib/notifications/notificationOrdering";
import { runWhenIdle } from "@/src/lib/performance/runWhenIdle";
import {
  buildDebtsHref,
  buildGoalsHref,
  buildInvestmentsHref,
  buildSavingsHref,
  buildWalletsHref,
} from "@/src/lib/navigation/financeNavigation";

import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getForexAccounts,
  getSavings,
  getTransactions,
  getWallets,
} from "@/src/services/finance/financeStorage";

import type {
  Budget,
  Category,
  Debt,
  ForexAccount,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet as WalletType,
} from "@/src/types/finance";

// NOTIF-FRESHNESS-1: same coalescing window Dashboard/Transactions/Wallets
// already use for their own realtime-triggered reloads — several
// independent per-table events from one multi-table write land close
// together and should fold into a single reload, not one per event.
const HEADER_REALTIME_REFRESH_DEBOUNCE_MS = 100;

// ─── Page meta ────────────────────────────────────────────────────────────────
const PAGE_META: Record<string, { title: string; desc: string }> = {
  "/": { title: "Tổng quan", desc: "Tổng quan & phân tích tài chính" },
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
  "/investments": {
    title: "Đầu Tư",
    desc: "Portfolio, Forex & hiệu suất đầu tư",
  },
  "/debts": {
    title: "Nợ & Khoản Vay",
    desc: "Theo dõi và lập kế hoạch trả nợ",
  },
  "/categories": { title: "Danh Mục", desc: "Phân loại thu chi" },
  "/ai-insights": { title: "AI Advisor", desc: "Tư vấn tài chính thông minh" },
  "/settings": { title: "Cài Đặt", desc: "Tuỳ chỉnh ứng dụng" },
  "/activity": {
    title: "Hoạt động",
    desc: "Lịch sử thay đổi tài chính & người thực hiện",
  },
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
  kind:
    | "transaction"
    | "wallet"
    | "saving"
    | "category"
    | "goal"
    | "debt"
    | "investment";
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
  forexAccounts: ForexAccount[];
  savings: SavingAccount[];
};

const EMPTY: AppData = {
  transactions: [],
  wallets: [],
  categories: [],
  goals: [],
  budgets: [],
  debts: [],
  investments: [],
  forexAccounts: [],
  savings: [],
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
        href: buildWalletsHref({ walletId: w.id }),
        kind: "wallet",
      }),
    );

  data.savings
    .filter((saving) => saving.name.toLowerCase().includes(q))
    .slice(0, 1)
    .forEach((saving) =>
      out.push({
        id: "sa-" + saving.id,
        label: saving.name,
        sub: "Khoản tiết kiệm",
        href: buildSavingsHref({ savingId: saving.id }),
        kind: "saving",
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
        href: buildGoalsHref({ goalId: g.id }),
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
        href: buildDebtsHref({ debtId: d.id }),
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
        sub: i.symbol ? i.symbol + " · Portfolio" : "Portfolio",
        href: buildInvestmentsHref({ investmentId: i.id }),
        kind: "investment",
      }),
    );

  data.forexAccounts
    .filter(
      (account) =>
        account.name.toLowerCase().includes(q) ||
        account.broker.toLowerCase().includes(q) ||
        (account.accountNumber ?? "").toLowerCase().includes(q),
    )
    .slice(0, 1)
    .forEach((account) =>
      out.push({
        id: "fx-" + account.id,
        label: account.name,
        sub: `${account.broker} · Forex`,
        href: buildInvestmentsHref({ forexAccountId: account.id }),
        kind: "investment",
      }),
    );

  return out.slice(0, 8);
}

// ─── Build notifications ──────────────────────────────────────────────────────
// NOTIF-CORRECTNESS-1: the actual rule engine now lives in
// buildFinanceNotifications (src/lib/notifications/financeNotifications.ts)
// — a pure, framework-free module that uses each domain's canonical
// calculation (calculateBudgetSpendingCollection, calculateGoalFundingSnapshot,
// getTotalIncome/getTotalExpense) instead of a second, locally-reimplemented
// copy that had drifted from them. This wrapper only adds the one field
// specific to Header's own presentation (`read`, always false here — the
// caller immediately overwrites it from localStorage, unchanged from before
// this ticket).
function buildNotifications(data: AppData): NotificationItem[] {
  const currentMonth = getCurrentLocalMonthKey();
  return buildFinanceNotifications({
    budgets: data.budgets,
    transactions: data.transactions,
    categories: data.categories,
    goals: data.goals,
    savings: data.savings,
    debts: data.debts,
    currentMonth,
  }).map((notification) => ({ ...notification, read: false }));
}

// ─── KindIcon ─────────────────────────────────────────────────────────────────
function KindIcon({ kind }: { kind: SearchResult["kind"] }) {
  const cls = "shrink-0 text-slate-400";
  switch (kind) {
    case "transaction":
      return <ReceiptText size={14} className={cls} />;
    case "wallet":
      return <Wallet size={14} className={cls} />;
    case "saving":
      return <PiggyBank size={14} className={cls} />;
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
  saving: "Tiết kiệm",
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

// NOTIFICATION ORDERING FIX: persists "when did this client first observe
// this notification id" (see notificationOrdering.ts's own doc comment for
// why this — not a database created_at, which doesn't exist for these
// synthesized alerts — is the correct source of truth here). Kept as its
// own key, separate from NOTIFICATION_STORAGE_KEY (read ids), since read
// state and ordering are two independent concerns that must never
// influence each other.
const NOTIFICATION_ORDER_STORAGE_KEY = "myfinance_notification_first_seen";

function readNotificationFirstSeen(): NotificationFirstSeenMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_ORDER_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: NotificationFirstSeenMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[id] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function persistNotificationFirstSeen(map: NotificationFirstSeenMap) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      NOTIFICATION_ORDER_STORAGE_KEY,
      JSON.stringify(map),
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
  const { context: householdContext } = useHousehold();
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const quickThemeTouchAtRef = useRef(0);
  const {
    filterMode,
    setFilterMode,
    selectedMonth,
    selectedQuarter,
    selectedYear,
    customStart: activeCustomStart,
    customEnd: activeCustomEnd,
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

  // App data (loaded once for search + notifications) — reloadHeaderData
  // below is the single canonical fetch+build+commit path shared by the
  // initial idle-deferred load and NOTIF-FRESHNESS-1's realtime-triggered
  // reconciliation, so there is exactly one place that can ever mutate
  // appData/notifList/hasHeaderDataLoaded.
  const [appData, setAppData] = useState<AppData>(EMPTY);
  const [notifList, setNotifList] = useState<NotificationItem[]>([]);
  const [notificationReadRevision, setNotificationReadRevision] = useState(0);
  const loadedRef = useRef(false);
  // FINANCE-DATA-1B: appData/notifList start empty until the idle load
  // below succeeds. "Không có thông báo mới" / "Không tìm thấy kết quả"
  // are visible zero-claims — without this flag they'd render the same
  // way whether the load genuinely found nothing or simply never
  // succeeded, so the two spots that show them check this first.
  const [hasHeaderDataLoaded, setHasHeaderDataLoaded] = useState(false);
  // NOTIF-FRESHNESS-1: `loadedRef` above only guards *scheduling* the one
  // idle-deferred initial load, never reload eligibility itself — a
  // realtime-triggered reload must remain callable for the component's
  // entire lifetime. This ref mirror lets the idle callback skip its own
  // fetch if a realtime-triggered reload already completed first (see the
  // idle-scheduling effect below) without adding a second piece of state.
  const hasHeaderDataLoadedRef = useRef(false);
  useEffect(() => {
    hasHeaderDataLoadedRef.current = hasHeaderDataLoaded;
  }, [hasHeaderDataLoaded]);

  // Derived
  const pageMeta = PAGE_META[pathname] ?? { title: "MyFinance", desc: "" };
  const displayEmail = user?.email ?? "";
  const metadataName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name.trim()
        : "";
  const fallbackName = displayEmail
    ? displayEmail.split("@")[0].replace(/[._-]+/g, " ")
    : "";
  const fallbackCompactName = fallbackName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const compactName = metadataName || fallbackCompactName || "Tài khoản";
  const avatarLetter =
    compactName.charAt(0).toUpperCase() ||
    displayEmail.charAt(0).toUpperCase() ||
    "U";
  // HOUSEHOLD-WORKSPACE-1: pending family invites join the global bell.
  // Read state remains a client preference only; membership/authorization is
  // always resolved by the server-side household RPCs.
  const householdInviteNotifications = useMemo<NotificationItem[]>(() => {
    void notificationReadRevision;
    const readIds = readNotificationIds();
    return (householdContext?.pendingInvites ?? []).map((invite) => {
      const id = `household-invite-${invite.id}`;
      const householdName = invite.householdName || "Gia đình MyFinance";
      const inviter = invite.invitedByEmail || "Chủ gia đình";
      return {
        id,
        title: "Lời mời gia đình",
        body: `${inviter} mời bạn tham gia ${householdName} với quyền ${
          invite.role === "viewer" ? "Chỉ xem" : "Thành viên"
        }.`,
        href: "/settings#settings-household",
        tone: "info" as const,
        read: readIds.has(id),
      };
    });
  }, [householdContext?.pendingInvites, notificationReadRevision]);
  const visibleNotifList = useMemo(
    () => [...householdInviteNotifications, ...notifList],
    [householdInviteNotifications, notifList],
  );
  const unreadCount = visibleNotifList.filter((n) => !n.read).length;
  const searchResults = buildSearchResults(searchQuery, appData);
  const showDrop = searchFocus && searchQuery.trim().length > 0;

  // NOTIF-FRESHNESS-1: the one canonical fetch+build+commit function.
  // FINANCE-DATA-1's readers reject on a genuine query failure instead of
  // resolving to [] — caught here so a failure never becomes an unhandled
  // rejection, and so that a LATER failure (after a prior success) simply
  // leaves appData/notifList/hasHeaderDataLoaded untouched: last-known-good
  // is preserved, never replaced by a fabricated empty/successful state.
  // Every field this reads (transactions/budgets/categories/goals/debts)
  // is refetched together and committed atomically in one setState burst
  // per field — never a partial/hybrid snapshot.
  const reloadHeaderData = useCallback(async () => {
    try {
      const [
        transactions,
        wallets,
        categories,
        goals,
        budgets,
        debts,
        investments,
        forexAccounts,
        savings,
      ] = await Promise.all([
        getTransactions(),
        getWallets(),
        getCategories(),
        getGoals(),
        getBudgets(),
        getDebts(),
        getInvestments(),
        getForexAccounts(),
        getSavings(),
      ]);
      const data: AppData = {
        transactions,
        wallets,
        categories,
        goals,
        budgets,
        debts,
        investments,
        forexAccounts,
        savings,
      };
      setAppData(data);

      // NOTIFICATION ORDERING FIX: newest-first, deterministic, and
      // independent of read/unread state — see notificationOrdering.ts's
      // own doc comment for why "first observed by this client" is the
      // correct substitute for a database created_at that doesn't exist
      // for these synthesized alerts. This is the ONE place the active
      // notification set is (re)computed — both the initial idle load and
      // every realtime-triggered reconciliation call this same function —
      // so there is exactly one source of truth for ordering, never a
      // second sort applied anywhere else.
      const freshNotifications = buildNotifications(data);
      const firstSeen = advanceNotificationFirstSeen(
        freshNotifications.map((notification) => notification.id),
        readNotificationFirstSeen(),
        Date.now(),
      );
      persistNotificationFirstSeen(firstSeen);
      const orderedNotifications = sortNotificationsNewestFirst(
        freshNotifications,
        firstSeen,
      );

      const readIds = readNotificationIds();
      setNotifList(
        orderedNotifications.map((notification) => ({
          ...notification,
          read: readIds.has(notification.id),
        })),
      );
      setHasHeaderDataLoaded(true);
    } catch (error) {
      console.error("[Header] data load failed:", error);
    }
  }, []);

  const reloadHeaderDataRef = useRef(reloadHeaderData);
  useEffect(() => {
    reloadHeaderDataRef.current = reloadHeaderData;
  }, [reloadHeaderData]);

  // Single-flight + trailing-reload coalescing — the same shape Dashboard/
  // Transactions/Wallets already use for their own realtime reload
  // coordinators. At most one fetch burst is ever in flight; any refresh
  // request arriving while one is running folds into exactly one
  // follow-up run instead of firing an overlapping fetch per event, and no
  // request is ever silently dropped.
  const isReloadingHeaderDataRef = useRef(false);
  const hasPendingHeaderReloadRef = useRef(false);
  const runHeaderReload = useCallback(async () => {
    if (isReloadingHeaderDataRef.current) {
      hasPendingHeaderReloadRef.current = true;
      return;
    }
    isReloadingHeaderDataRef.current = true;
    try {
      do {
        hasPendingHeaderReloadRef.current = false;
        await reloadHeaderDataRef.current();
      } while (hasPendingHeaderReloadRef.current);
    } finally {
      isReloadingHeaderDataRef.current = false;
    }
  }, []);

  const headerRefreshDebounceTimerRef = useRef<number | null>(null);
  const requestHeaderRefresh = useCallback(() => {
    if (headerRefreshDebounceTimerRef.current) {
      window.clearTimeout(headerRefreshDebounceTimerRef.current);
    }
    headerRefreshDebounceTimerRef.current = window.setTimeout(() => {
      headerRefreshDebounceTimerRef.current = null;
      void runHeaderReload();
    }, HEADER_REALTIME_REFRESH_DEBOUNCE_MS);
  }, [runHeaderReload]);

  useEffect(() => {
    return () => {
      if (headerRefreshDebounceTimerRef.current) {
        window.clearTimeout(headerRefreshDebounceTimerRef.current);
      }
    };
  }, []);

  // Notification dependencies and search-only entity dependencies both reuse
  // the app-level RealtimeProvider channel. Wallet/Investment/Forex edits must
  // refresh the global search index even when they do not create alerts.
  useRealtimeTable(
    ["transactions", "budgets", "categories", "goals", "debts", "savings"],
    requestHeaderRefresh,
  );
  useRealtimeTable(
    ["wallets", "investments", "forex_accounts"],
    requestHeaderRefresh,
  );

  // NOTIF-FRESHNESS-1 month-rollover: no realtime event fires purely from
  // the wall clock crossing into a new local calendar month, so an app
  // left open (or backgrounded) across midnight would otherwise keep
  // evaluating notifications against the old month indefinitely with zero
  // DB activity to trigger a refresh. Re-checking on tab foreground is a
  // one-shot DOM lifecycle event, not a poll/timer — it only runs on an
  // actual visibility transition, and only requests a refresh when the
  // local month key has genuinely changed since last checked.
  const lastKnownMonthKeyRef = useRef(getCurrentLocalMonthKey());
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const currentMonthKey = getCurrentLocalMonthKey();
      if (currentMonthKey === lastKnownMonthKeyRef.current) return;
      lastKnownMonthKeyRef.current = currentMonthKey;
      requestHeaderRefresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [requestHeaderRefresh]);

  // Load all data once on mount — feeds the global search index and the
  // notification bell only, neither of which is above-the-fold critical
  // content. Deferred to an idle moment so these 9 parallel full-table
  // reads don't compete with the current route's own critical data fetch
  // (e.g. Dashboard's Promise.all) for network/CPU right at startup.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    runWhenIdle(() => {
      // A realtime event can arrive and complete its own reload before
      // this idle callback ever fires (e.g. a throttled/slow
      // requestIdleCallback) — skip the redundant fetch if so; any
      // still-in-flight realtime reload is already coalescing correctly
      // via runHeaderReload's own single-flight guard regardless.
      if (hasHeaderDataLoadedRef.current) return;
      void runHeaderReload();
    });
  }, [runHeaderReload]);

  // Handlers
  async function handleLogout() {
    setDropdownOpen(false);
    await signOut();
    router.replace("/login");
  }

  function handleSelectMonth(month: string) {
    setSelectedMonth(month);
    setMonthOpen(false);
  }

  function handleSelectQuarter(quarter: string) {
    setSelectedQuarter(quarter);
    setMonthOpen(false);
  }

  function handleSelectYear(year: string) {
    setSelectedYearFilter(Number(year));
    setMonthOpen(false);
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
  }

  function shiftQuarterYear(offset: number) {
    const nextYear = selectedYear + offset;
    const nextQuarter = `${nextYear}-Q${selectedQuarterNumber}`;
    setSelectedQuarter(nextQuarter);
  }

  function shiftMonth(offset: number) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextMonth);
  }

  function shiftQuarter(offset: number) {
    const [yearRaw, quarterRaw] = selectedQuarter.split("-Q");
    const absolute = Number(yearRaw) * 4 + Number(quarterRaw) - 1 + offset;
    const year = Math.floor(absolute / 4);
    const quarter = (absolute % 4) + 1;
    const nextQuarter = `${year}-Q${quarter}`;
    setSelectedQuarter(nextQuarter);
  }

  function shiftYear(offset: number) {
    const nextYear = selectedYear + offset;
    setSelectedYearFilter(nextYear);
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
      // Refresh the local draft at the user interaction boundary instead of
      // synchronously mirroring provider state from an effect.
      setCustomStart(activeCustomStart);
      setCustomEnd(activeCustomEnd);
      setMonthOpen(true);
      return;
    }

    shiftMonth(offset);
  }

  function handleApplyCurrentMode() {
    if (filterMode === "custom") {
      handleApplyCustomRange();
      return;
    }

    // Month/quarter/year selections already update the canonical provider;
    // DateFilterProvider owns URL serialization for every consumer.
    setMonthOpen(false);
  }

  function handleApplyCustomRange() {
    setCustomRange(customStart, customEnd);
    setMonthOpen(false);
  }

  // NOTIF-UI-1: Escape closes the notification dropdown, matching the
  // existing outside-click overlay's scope exactly (only notifOpen, not the
  // other Header dropdowns) — installed only while open, cleaned up on
  // close, no permanent global listener.
  useEffect(() => {
    if (!notifOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNotifOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [notifOpen]);

  function handleNotifClick(href: string, id: string) {
    const readIds = readNotificationIds();
    readIds.add(id);
    persistNotificationIds(readIds);

    setNotifList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setNotificationReadRevision((revision) => revision + 1);
    setNotifOpen(false);
    router.push(href);
  }

  function handleMarkAllRead() {
    const readIds = readNotificationIds();
    for (const notification of visibleNotifList) readIds.add(notification.id);
    persistNotificationIds(readIds);
    setNotifList((prev) => prev.map((n) => ({ ...n, read: true })));
    setNotificationReadRevision((revision) => revision + 1);
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

  function handleQuickThemeToggle() {
    // A touchend on iOS is followed by a synthetic click. Ignore that second
    // activation so one tap always means exactly one theme transition.
    if (Date.now() - quickThemeTouchAtRef.current < 700) return;
    toggleTheme();
  }

  function handleQuickThemeTouchEnd(
    event: ReactTouchEvent<HTMLButtonElement>,
  ) {
    if (event.cancelable) event.preventDefault();
    quickThemeTouchAtRef.current = Date.now();
    toggleTheme();
  }

  function closeAll() {
    setDropdownOpen(false);
    setNotifOpen(false);
    setMonthOpen(false);
    setSearchFocus(false);
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <header className="finance-header sticky top-0 z-30 h-auto shrink-0 border-b border-[#DDE7F0] bg-white/95 px-3 backdrop-blur-xl sm:px-6 lg:h-18 lg:px-8">
      <div className="flex h-18 items-center justify-between gap-3 sm:gap-5 lg:h-full">
        {/* ══ LEFT ══ */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {/* Hamburger mobile */}
          <button
            onClick={onMenuOpen}
            aria-label="Mở menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            className="min-h-11 min-w-11 rounded-xl p-2 text-[#5F7890] transition hover:bg-[#F3F7FB] lg:hidden"
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
            <h2 className="truncate text-[15px] font-bold tracking-tight text-[#36536B] sm:text-[22px] sm:leading-7">
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
              ) : !hasHeaderDataLoaded ? (
                <div className="flex flex-col items-center py-8 text-sm">
                  <Search size={24} className="mb-2 text-slate-200" />
                  <p className="text-slate-400">Đang tải dữ liệu tìm kiếm...</p>
                </div>
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
                  if (!monthOpen && filterMode === "custom") {
                    setCustomStart(activeCustomStart);
                    setCustomEnd(activeCustomEnd);
                  }
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

          {/* Quick theme toggle: explicit light/dark switch. System mode stays
              available in Settings; the first quick-toggle press pins the
              opposite of the currently resolved device theme. */}
          <button
            type="button"
            onTouchEnd={handleQuickThemeTouchEnd}
            onClick={handleQuickThemeToggle}
            className="flex h-11 w-11 touch-manipulation select-none shrink-0 items-center justify-center rounded-2xl border border-[#DBE6EF] bg-white p-0 text-[#607A92] shadow-[0_3px_10px_rgba(54,83,107,0.06)] transition hover:bg-[#F3F8FF] hover:text-[#2F80ED] active:scale-[.96] [-webkit-tap-highlight-color:transparent]"
            aria-label={
              resolvedTheme === "dark"
                ? "Chuyển sang giao diện sáng"
                : "Chuyển sang giao diện tối"
            }
            title={
              resolvedTheme === "dark"
                ? "Chuyển sang giao diện sáng"
                : "Chuyển sang giao diện tối"
            }
            aria-pressed={resolvedTheme === "dark"}
            data-theme-toggle="quick"
            data-theme-toggle-touch="ios-safe"
          >
            {resolvedTheme === "dark" ? (
              <Sun size={17} aria-hidden="true" />
            ) : (
              <Moon size={17} aria-hidden="true" />
            )}
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setDropdownOpen(false);
                setMonthOpen(false);
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DBE6EF] bg-white p-0 text-[#607A92] shadow-[0_3px_10px_rgba(54,83,107,0.06)] transition hover:bg-[#F3F8FF] hover:text-[#2F80ED]"
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
                <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(420px,calc(100vw-24px))]">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
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
                  <div className="max-h-105 overflow-y-auto">
                    {visibleNotifList.length > 0 ? (
                      visibleNotifList.map((n) => {
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
                              "flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-50 " +
                              bg
                            }
                          >
                            <span
                              className={
                                "mt-2 size-2 shrink-0 rounded-full " +
                                dot +
                                (n.read ? " opacity-30" : "")
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={
                                  "text-sm font-semibold leading-5 " +
                                  (n.read ? "text-slate-500" : "text-slate-800")
                                }
                              >
                                {n.title}
                              </p>
                              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                                {n.body}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : !hasHeaderDataLoaded ? (
                      <div className="flex flex-col items-center py-10">
                        <Bell size={28} className="mb-2 text-slate-200" />
                        <p className="text-sm text-slate-400">
                          Đang tải thông báo...
                        </p>
                      </div>
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
              className="flex h-11 items-center gap-2 rounded-2xl border border-[#DBE6EF] bg-white py-1.5 pl-1.5 pr-2 shadow-[0_3px_10px_rgba(54,83,107,0.06)] transition hover:bg-[#F3F7FB] active:scale-[.98] sm:pr-3"
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
      <div className="border-t border-[#E2EAF2] bg-white/95 pb-3 pt-2 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilterMode("month");
              shiftMonth(-1);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#DCE6EF] bg-white text-[#61788F] shadow-[0_3px_10px_rgba(54,83,107,0.06)] transition active:scale-[.98]"
            aria-label="Tháng trước"
          >
            <ChevronLeft size={18} />
          </button>

          <label className="relative flex h-11 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-[#DCE6EF] bg-white px-3 text-sm font-semibold text-[#3F5F79] shadow-[0_3px_10px_rgba(54,83,107,0.06)] active:scale-[.99]">
            <CalendarDays size={16} className="shrink-0 text-[#2F80ED]" />
            <span className="pointer-events-none min-w-0 flex-1 text-center text-[16px] font-bold text-[#3F5F79]">
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#DCE6EF] bg-white text-[#61788F] shadow-[0_3px_10px_rgba(54,83,107,0.06)] transition active:scale-[.98]"
            aria-label="Tháng sau"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
