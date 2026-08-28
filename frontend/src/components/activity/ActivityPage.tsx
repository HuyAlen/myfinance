"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  BriefcaseBusiness,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder,
  History,
  Landmark,
  Loader2,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";
import type { Json } from "@/src/lib/database.types";
import {
  AUDIT_ENTITY_TYPES,
  getFinanceAuditEvents,
  type AuditAction,
  type AuditEntityType,
  type FinanceAuditCursor,
  type FinanceAuditEvent,
} from "@/src/services/finance/auditService";

const PAGE_SIZE = 30;

const ENTITY_META: Record<
  AuditEntityType,
  { label: string; icon: typeof WalletCards }
> = {
  wallets: { label: "Ví tiền", icon: WalletCards },
  categories: { label: "Danh mục", icon: Folder },
  transactions: { label: "Giao dịch", icon: ReceiptText },
  debts: { label: "Nợ & khoản vay", icon: Landmark },
  goals: { label: "Mục tiêu", icon: Target },
  budgets: { label: "Ngân sách", icon: ChartPie },
  investments: { label: "Đầu tư", icon: BriefcaseBusiness },
  savings: { label: "Tiết kiệm", icon: PiggyBank },
  saving_transactions: { label: "Biến động tiết kiệm", icon: ArrowLeftRight },
  forex_accounts: { label: "Tài khoản Forex", icon: BriefcaseBusiness },
  forex_cash_transactions: { label: "Dòng tiền Forex", icon: ArrowLeftRight },
};

const ACTION_META: Record<
  AuditAction,
  { label: string; badge: string; dot: string }
> = {
  insert: {
    label: "Đã tạo",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  update: {
    label: "Đã cập nhật",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  delete: {
    label: "Đã xóa",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
};

const ROLE_LABELS = {
  owner: "Chủ gia đình",
  member: "Thành viên",
  viewer: "Chỉ xem",
} as const;

const HIDDEN_FIELDS = new Set([
  "id",
  "user_id",
  "created_at",
  "updated_at",
]);

const FIELD_PRIORITY = [
  "name",
  "type",
  "amount",
  "balance",
  "totalamount",
  "remainingamount",
  "minimumpayment",
  "targetamount",
  "currentamount",
  "limitamount",
  "rolloveramount",
  "investedamount",
  "currentvalue",
  "averagecost",
  "currentprice",
  "totalAmount",
  "remainingAmount",
  "targetAmount",
  "currentAmount",
  "limitAmount",
  "investedAmount",
  "currentValue",
  "current_equity",
  "date",
  "transaction_date",
  "month",
  "note",
  "notes",
];

const MONEY_FIELDS = new Set([
  "amount",
  "balance",
  "totalamount",
  "remainingamount",
  "targetamount",
  "currentamount",
  "limitamount",
  "investedamount",
  "currentvalue",
  "totalAmount",
  "remainingAmount",
  "minimumPayment",
  "targetAmount",
  "currentAmount",
  "limitAmount",
  "rolloverAmount",
  "investedAmount",
  "currentValue",
  "averageCost",
  "currentPrice",
  "current_equity",
  "fee",
  "default_amount",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "Tên",
  type: "Loại",
  amount: "Số tiền",
  balance: "Số dư",
  currency: "Tiền tệ",
  totalamount: "Tổng nợ",
  remainingamount: "Nợ còn lại",
  interestrate: "Lãi suất",
  minimumpayment: "Thanh toán tối thiểu",
  duedate: "Ngày đến hạn",
  loantermmonths: "Kỳ hạn",
  targetamount: "Mục tiêu",
  currentamount: "Đã tích lũy",
  categoryid: "Danh mục",
  walletid: "Ví",
  transfertowalletid: "Ví nhận",
  isrecurring: "Định kỳ",
  nextrundate: "Lần chạy tiếp",
  limitamount: "Hạn mức",
  rolloveramount: "Chuyển dư",
  warningthreshold: "Cảnh báo",
  criticalthreshold: "Nguy cấp",
  investedamount: "Vốn đầu tư",
  currentvalue: "Giá trị hiện tại",
  purchasedate: "Ngày mua",
  averagecost: "Giá vốn TB",
  currentprice: "Giá hiện tại",
  totalAmount: "Tổng nợ",
  remainingAmount: "Nợ còn lại",
  interestRate: "Lãi suất",
  minimumPayment: "Thanh toán tối thiểu",
  dueDate: "Ngày đến hạn",
  loanTermMonths: "Kỳ hạn",
  targetAmount: "Mục tiêu",
  currentAmount: "Đã tích lũy",
  categoryId: "Danh mục",
  walletId: "Ví",
  transferToWalletId: "Ví nhận",
  date: "Ngày",
  month: "Tháng",
  limitAmount: "Hạn mức",
  rolloverAmount: "Chuyển dư",
  warningThreshold: "Cảnh báo",
  criticalThreshold: "Nguy cấp",
  investedAmount: "Vốn đầu tư",
  currentValue: "Giá trị hiện tại",
  current_equity: "Equity",
  quantity: "Số lượng",
  averageCost: "Giá vốn TB",
  currentPrice: "Giá hiện tại",
  wallet_id: "Ví liên kết",
  saving_id: "Khoản tiết kiệm",
  forex_account_id: "Tài khoản Forex",
  interest_rate: "Lãi suất",
  maturity_date: "Ngày đáo hạn",
  transaction_date: "Ngày giao dịch",
  transaction_time: "Giờ giao dịch",
  note: "Ghi chú",
  notes: "Ghi chú",
  status: "Trạng thái",
  broker: "Broker",
  account_number: "Số tài khoản",
  isRecurring: "Định kỳ",
  recurrence: "Chu kỳ",
  nextRunDate: "Lần chạy tiếp",
};

type AuditRecord = Record<string, Json | undefined>;
type FieldChange = {
  key: string;
  before: Json | undefined;
  after: Json | undefined;
};

function isRecord(value: Json | null): value is AuditRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function auditAction(value: string): AuditAction {
  return value === "insert" || value === "delete" ? value : "update";
}

function auditEntityType(value: string): AuditEntityType | null {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(value)
    ? (value as AuditEntityType)
    : null;
}

function valuesEqual(left: Json | undefined, right: Json | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function sortFields(keys: string[]) {
  return [...keys].sort((left, right) => {
    const leftPriority = FIELD_PRIORITY.indexOf(left);
    const rightPriority = FIELD_PRIORITY.indexOf(right);
    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority < 0) return 1;
      if (rightPriority < 0) return -1;
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right, "vi");
  });
}

function getFieldChanges(event: FinanceAuditEvent): FieldChange[] {
  const before = isRecord(event.before_data) ? event.before_data : {};
  const after = isRecord(event.after_data) ? event.after_data : {};
  const keys = sortFields(
    Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
      (key) => !HIDDEN_FIELDS.has(key),
    ),
  );

  return keys
    .filter((key) => !valuesEqual(before[key], after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAuditValue(key: string, value: Json | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") {
    return MONEY_FIELDS.has(key)
      ? formatVND(value)
      : new Intl.NumberFormat("vi-VN").format(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => String(item ?? "")).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value) ?? "—";
  if (
    (key.toLowerCase().includes("date") || key.endsWith("_at")) &&
    /^\d{4}-\d{2}-\d{2}/.test(value)
  ) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(parsed);
    }
  }
  return value;
}

function getSnapshot(event: FinanceAuditEvent): AuditRecord {
  if (isRecord(event.after_data)) return event.after_data;
  if (isRecord(event.before_data)) return event.before_data;
  return {};
}

function getEntityName(event: FinanceAuditEvent, entityLabel: string): string {
  const row = getSnapshot(event);
  for (const key of ["name", "note", "notes"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof row.amount === "number") {
    return `${entityLabel} ${formatVND(row.amount)}`;
  }
  if (typeof row.month === "string" && row.month) return row.month;
  return event.entity_id ? `#${event.entity_id.slice(0, 8)}` : entityLabel;
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = dayKey(yesterday.toISOString());
  if (key === todayKey) return "Hôm nay";
  if (key === yesterdayKey) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}


function formatEventClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toAuditBounds(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  return {
    createdFrom: start.toISOString(),
    createdTo: end.toISOString(),
  };
}

function primaryChangeLabel(event: FinanceAuditEvent) {
  const first = getFieldChanges(event)[0];
  if (!first) return "Không có trường dữ liệu hiển thị";
  const action = auditAction(event.action);
  const fieldLabel = FIELD_LABELS[first.key] ?? first.key;
  if (action === "insert") {
    return `${fieldLabel}: ${formatAuditValue(first.key, first.after)}`;
  }
  if (action === "delete") {
    return `${fieldLabel}: ${formatAuditValue(first.key, first.before)}`;
  }
  return `${fieldLabel}: ${formatAuditValue(first.key, first.before)} → ${formatAuditValue(first.key, first.after)}`;
}

export default function ActivityPage() {
  const { user } = useAuth();
  const { context, household, loading: householdLoading } = useHousehold();
  const { dateRange, filterLabel } = useDateFilter();
  useSuppressGlobalFabsWhileOpen(true);

  const [events, setEvents] = useState<FinanceAuditEvent[]>([]);
  const [entityFilter, setEntityFilter] = useState<AuditEntityType | "all">(
    "all",
  );
  const [actionFilter, setActionFilter] = useState<AuditAction | "all">("all");
  const [actorFilter, setActorFilter] = useState<string | "all">("all");
  const [cursor, setCursor] = useState<FinanceAuditCursor | null>(null);
  const [nextCursor, setNextCursor] = useState<FinanceAuditCursor | null>(null);
  const [cursorHistory, setCursorHistory] = useState<
    Array<FinanceAuditCursor | null>
  >([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const requestIdRef = useRef(0);

  const auditBounds = useMemo(
    () => toAuditBounds(dateRange.startDate, dateRange.endDate),
    [dateRange.endDate, dateRange.startDate],
  );

  const loadCursorPage = useCallback(
    async (
      targetCursor: FinanceAuditCursor | null,
      nextHistory: Array<FinanceAuditCursor | null>,
    ) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const result = await getFinanceAuditEvents({
          cursor: targetCursor,
          pageSize: PAGE_SIZE,
          entityType: entityFilter,
          action: actionFilter,
          actorUserId: actorFilter,
          createdFrom: auditBounds.createdFrom,
          createdTo: auditBounds.createdTo,
        });
        if (requestId !== requestIdRef.current) return;
        setEvents(result.events);
        setCursor(targetCursor);
        setCursorHistory(nextHistory);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
        setLoadError(null);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Không thể tải lịch sử hoạt động.",
        );
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [actionFilter, actorFilter, auditBounds, entityFilter],
  );

  useEffect(() => {
    void loadCursorPage(null, []);
  }, [loadCursorPage]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && cursorHistory.length === 0) {
        void loadCursorPage(null, []);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [cursorHistory.length, loadCursorPage]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileFiltersOpen]);

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of context?.members ?? []) {
      map.set(member.userId, member.email || member.userId);
    }
    for (const event of events) {
      if (!map.has(event.actor_user_id)) {
        map.set(
          event.actor_user_id,
          event.actor_email || `Thành viên ${event.actor_user_id.slice(0, 8)}`,
        );
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [context?.members, events]);

  const selectedFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (entityFilter !== "all") labels.push(ENTITY_META[entityFilter].label);
    if (actionFilter !== "all") labels.push(ACTION_META[actionFilter].label);
    if (actorFilter !== "all") {
      const actor = actorOptions.find((option) => option.id === actorFilter);
      labels.push(actorFilter === user?.id ? "Bạn" : actor?.label ?? "Thành viên");
    }
    return labels;
  }, [actionFilter, actorFilter, actorOptions, entityFilter, user?.id]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      events: FinanceAuditEvent[];
    }> = [];
    for (const event of events) {
      const key = dayKey(event.created_at);
      const last = groups.at(-1);
      if (!last || last.key !== key) {
        groups.push({ key, label: dayLabel(key), events: [event] });
      } else {
        last.events.push(event);
      }
    }
    return groups;
  }, [events]);

  const memberCount = context?.members.length ?? 0;
  const activeFilterCount =
    Number(entityFilter !== "all") +
    Number(actionFilter !== "all") +
    Number(actorFilter !== "all");
  const pageNumber = cursorHistory.length + 1;
  const isInitialLoading = loading && events.length === 0;

  const clearFilters = () => {
    setEntityFilter("all");
    setActionFilter("all");
    setActorFilter("all");
  };

  const goOlder = () => {
    if (!nextCursor || loading) return;
    void loadCursorPage(nextCursor, [...cursorHistory, cursor]);
  };

  const goNewer = () => {
    if (cursorHistory.length === 0 || loading) return;
    const nextHistory = cursorHistory.slice(0, -1);
    const previousCursor = cursorHistory.at(-1) ?? null;
    void loadCursorPage(previousCursor, nextHistory);
  };

  const goNewest = () => {
    if (loading) return;
    void loadCursorPage(null, []);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 overflow-x-hidden pb-5 pt-1 md:space-y-4 md:pb-0 md:pt-2">
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-500 sm:text-[10px]">
                Audit Center
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                <ShieldCheck size={11} /> Chỉ đọc
              </span>
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-black text-slate-500 sm:text-[10px]">
                {filterLabel}
              </span>
            </div>
            <h1 className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:text-xl">
              Lịch sử hoạt động
            </h1>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-slate-500 sm:text-xs sm:leading-5">
              Ai đã thay đổi dữ liệu tài chính, thay đổi gì và giá trị trước / sau trong {household?.name ?? "gia đình MyFinance"}.
            </p>
          </div>
          <button
            type="button"
            onClick={goNewest}
            disabled={loading}
            aria-label="Làm mới và quay về hoạt động mới nhất"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-blue-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1">
            <History size={11} /> {events.length} hoạt động trên trang
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1">
            <UserRound size={11} /> {memberCount} thành viên
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-1">
            Trang {pageNumber}
          </span>
        </div>
      </section>

      <section className="sticky top-0 z-20 sm:hidden">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={mobileFiltersOpen}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <SlidersHorizontal size={16} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[11px] font-black text-slate-700">
                Bộ lọc{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </span>
              <span className="block truncate text-[10px] font-semibold text-slate-400">
                {selectedFilterLabels.length > 0
                  ? selectedFilterLabels.join(" · ")
                  : "Tất cả dữ liệu · Tất cả thao tác · Tất cả thành viên"}
              </span>
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-slate-300" />
        </button>
      </section>

      <section className="sticky top-0 z-20 hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:block">
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              Bộ lọc
            </p>
            <p className="text-[11px] text-slate-400">
              Lọc server-side theo dữ liệu, thao tác, thành viên và khoảng thời gian đang chọn.
            </p>
          </div>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 shrink-0 rounded-xl px-3 text-[11px] font-black text-blue-700 transition hover:bg-blue-50"
            >
              Xóa lọc
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Dữ liệu
            </span>
            <select
              value={entityFilter}
              onChange={(event) =>
                setEntityFilter(event.target.value as AuditEntityType | "all")
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white"
            >
              <option value="all">Tất cả</option>
              {AUDIT_ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {ENTITY_META[entityType].label}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Thao tác
            </span>
            <select
              value={actionFilter}
              onChange={(event) =>
                setActionFilter(event.target.value as AuditAction | "all")
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white"
            >
              <option value="all">Tất cả</option>
              <option value="insert">Đã tạo</option>
              <option value="update">Đã cập nhật</option>
              <option value="delete">Đã xóa</option>
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Người thay đổi
            </span>
            <select
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              disabled={householdLoading}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white disabled:opacity-60"
            >
              <option value="all">Tất cả thành viên</option>
              {actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.id === user?.id ? `Bạn · ${actor.label}` : actor.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeFilterCount > 0 ? (
          <p className="mt-2 text-[10px] font-bold text-blue-600">
            {activeFilterCount} bộ lọc đang bật
          </p>
        ) : null}
      </section>

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 p-0 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-filter-sheet-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMobileFiltersOpen(false);
          }}
        >
          <section className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="activity-filter-sheet-title" className="text-base font-black text-slate-900">
                  Bộ lọc hoạt động
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                  Thu hẹp lịch sử theo dữ liệu, thao tác hoặc thành viên.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Đóng bộ lọc"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Dữ liệu
                </span>
                <select
                  value={entityFilter}
                  onChange={(event) =>
                    setEntityFilter(event.target.value as AuditEntityType | "all")
                  }
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white"
                >
                  <option value="all">Tất cả dữ liệu</option>
                  {AUDIT_ENTITY_TYPES.map((entityType) => (
                    <option key={entityType} value={entityType}>
                      {ENTITY_META[entityType].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Thao tác
                </span>
                <select
                  value={actionFilter}
                  onChange={(event) =>
                    setActionFilter(event.target.value as AuditAction | "all")
                  }
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white"
                >
                  <option value="all">Tất cả thao tác</option>
                  <option value="insert">Đã tạo</option>
                  <option value="update">Đã cập nhật</option>
                  <option value="delete">Đã xóa</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Người thay đổi
                </span>
                <select
                  value={actorFilter}
                  onChange={(event) => setActorFilter(event.target.value)}
                  disabled={householdLoading}
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-bold text-slate-700 outline-none focus:border-blue-300 focus:bg-white disabled:opacity-60"
                >
                  <option value="all">Tất cả thành viên</option>
                  {actorOptions.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.id === user?.id ? `Bạn · ${actor.label}` : actor.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 disabled:opacity-40"
              >
                Xóa lọc
              </button>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="min-h-12 rounded-2xl bg-blue-600 px-4 text-[13px] font-black text-white shadow-sm shadow-blue-200"
              >
                Xem kết quả
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isInitialLoading ? (
        <section aria-label="Đang tải lịch sử hoạt động" className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-[74px] animate-pulse rounded-2xl border border-slate-200 bg-white p-3"
            >
              <div className="h-3 w-32 rounded bg-slate-100" />
              <div className="mt-3 h-2.5 w-3/4 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : loadError && events.length === 0 ? (
        <section className="flex min-h-48 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-7 text-center">
          <History size={25} className="text-rose-400" />
          <p className="mt-3 text-sm font-black text-slate-700">
            Không thể tải lịch sử hoạt động
          </p>
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
            {loadError}
          </p>
          <button
            type="button"
            onClick={goNewest}
            className="mt-4 min-h-11 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white"
          >
            Thử lại
          </button>
        </section>
      ) : events.length === 0 ? (
        <section className="flex min-h-48 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-7 text-center">
          <History size={26} className="text-blue-400" />
          <p className="mt-3 text-sm font-black text-slate-700">
            Chưa có hoạt động phù hợp
          </p>
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
            Audit Trail chỉ ghi các thay đổi phát sinh sau khi tính năng được bật; dữ liệu lịch sử cũ không được tự suy diễn hoặc backfill.
          </p>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 min-h-11 rounded-2xl border border-blue-200 bg-white px-4 text-sm font-black text-blue-700"
            >
              Xóa bộ lọc
            </button>
          ) : null}
        </section>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 text-[10px] font-bold text-blue-600">
              <Loader2 size={13} className="animate-spin" /> Đang cập nhật trang lịch sử...
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
              {loadError} Đang giữ lịch sử đã tải gần nhất.
            </div>
          ) : null}

          {groupedEvents.map((group) => (
            <section key={group.key}>
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <Clock3 size={12} className="text-slate-400" />
                <h2 className="text-[11px] font-black text-slate-500 sm:text-xs">
                  {group.label}
                </h2>
                <span className="text-[10px] font-bold text-slate-300">
                  · {group.events.length}
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {group.events.map((event, index) => {
                  const action = auditAction(event.action);
                  const actionMeta = ACTION_META[action];
                  const entityType = auditEntityType(event.entity_type);
                  const entityMeta = entityType
                    ? ENTITY_META[entityType]
                    : { label: event.entity_type, icon: History };
                  const EntityIcon = entityMeta.icon;
                  const actorEmail =
                    event.actor_email ||
                    actorOptions.find(
                      (actor) => actor.id === event.actor_user_id,
                    )?.label ||
                    `Thành viên ${event.actor_user_id.slice(0, 8)}`;
                  const actorLabel =
                    event.actor_user_id === user?.id
                      ? `Bạn · ${actorEmail}`
                      : actorEmail;
                  const changes = getFieldChanges(event);
                  const entityName = getEntityName(event, entityMeta.label);

                  return (
                    <details
                      key={event.id}
                      className={`group ${index > 0 ? "border-t border-slate-100" : ""}`}
                    >
                      <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 outline-none transition hover:bg-slate-50/80 focus-visible:bg-blue-50/60 [&::-webkit-details-marker]:hidden sm:gap-3 sm:px-4">
                        <span className="hidden w-10 shrink-0 text-center text-[10px] font-black tabular-nums text-slate-400 sm:block">
                          {formatEventClock(event.created_at)}
                        </span>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <EntityIcon size={16} />
                        </span>

                        <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(160px,0.85fr)_minmax(0,1.35fr)] sm:items-center sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${actionMeta.badge}`}
                              >
                                <span
                                  className={`size-1.5 rounded-full ${actionMeta.dot}`}
                                />
                                {actionMeta.label}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                                {entityMeta.label}
                              </span>
                            </div>
                            <h3 className="mt-1 truncate text-[13px] font-black text-slate-900 sm:text-[13px]">
                              {entityName}
                            </h3>
                            <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                              {actorLabel} · {ROLE_LABELS[event.actor_role] ?? event.actor_role}
                              <span className="sm:hidden"> · {formatEventClock(event.created_at)}</span>
                            </p>
                          </div>

                          <div className="mt-1.5 min-w-0 sm:mt-0">
                            <p className="truncate text-[11px] font-bold text-slate-500 sm:text-[12px]">
                              {primaryChangeLabel(event)}
                            </p>
                            <p className="mt-0.5 text-[9px] font-semibold text-slate-300 sm:text-[10px]">
                              {changes.length} trường thay đổi · Nhấn để xem chi tiết
                            </p>
                          </div>
                        </div>

                        <ChevronRight
                          size={16}
                          className="shrink-0 text-slate-300 transition group-open:rotate-90 group-open:text-blue-500"
                        />
                      </summary>

                      <div className="border-t border-slate-100 bg-slate-50/45 px-3 py-3 sm:px-4">
                        <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
                          <aside className="rounded-xl border border-slate-100 bg-white p-3 text-[10px] leading-5 text-slate-500">
                            <p className="font-black uppercase tracking-wide text-slate-400">
                              Người thay đổi
                            </p>
                            <p className="mt-1 break-all font-black text-slate-700">
                              {actorLabel}
                            </p>
                            <p>{ROLE_LABELS[event.actor_role] ?? event.actor_role}</p>
                            <p className="mt-2 font-black uppercase tracking-wide text-slate-400">
                              Thời gian
                            </p>
                            <p className="font-semibold text-slate-600">
                              {formatEventTime(event.created_at)}
                            </p>
                            <p className="mt-2 font-black uppercase tracking-wide text-slate-400">
                              Transaction
                            </p>
                            <p className="font-mono font-semibold text-slate-600">
                              #{event.transaction_id}
                            </p>
                          </aside>

                          <div className="min-w-0 space-y-1.5">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                                Trước → Sau
                              </p>
                              <span className="text-[9px] font-bold text-slate-300">
                                {changes.length} trường
                              </span>
                            </div>
                            {changes.length === 0 ? (
                              <p className="rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-slate-400">
                                Không có trường hiển thị thay đổi sau khi loại bỏ metadata kỹ thuật.
                              </p>
                            ) : (
                              changes.map((change) => (
                                <div
                                  key={change.key}
                                  className="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] items-start gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2 text-[10px] sm:grid-cols-[104px_minmax(0,1fr)] sm:px-3 sm:text-[11px]"
                                >
                                  <span className="font-black text-slate-500">
                                    {FIELD_LABELS[change.key] ?? change.key}
                                  </span>
                                  <div className="min-w-0 font-semibold text-slate-700">
                                    {action === "insert" ? (
                                      <span className="break-words font-black text-emerald-700">
                                        {formatAuditValue(change.key, change.after)}
                                      </span>
                                    ) : action === "delete" ? (
                                      <span className="break-words text-rose-700 line-through decoration-rose-300">
                                        {formatAuditValue(change.key, change.before)}
                                      </span>
                                    ) : (
                                      <div className="min-w-0 space-y-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] sm:items-start sm:gap-1.5 sm:space-y-0">
                                        <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:p-0">
                                          <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-300 sm:hidden">
                                            Trước
                                          </span>
                                          <span className="block min-w-0 break-words text-[11px] text-slate-400 line-through decoration-slate-300 sm:text-[11px]">
                                            {formatAuditValue(change.key, change.before)}
                                          </span>
                                        </div>
                                        <span className="block text-center text-[11px] font-black text-slate-300 sm:hidden">
                                          ↓
                                        </span>
                                        <span className="hidden text-center font-black text-slate-300 sm:block">
                                          →
                                        </span>
                                        <div className="min-w-0 rounded-lg bg-blue-50/70 px-2 py-1.5 sm:rounded-none sm:bg-transparent sm:p-0">
                                          <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-blue-300 sm:hidden">
                                            Sau
                                          </span>
                                          <span className="block min-w-0 break-words text-[11px] font-black text-blue-700 sm:text-[11px]">
                                            {formatAuditValue(change.key, change.after)}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}

          <nav
            aria-label="Phân trang lịch sử hoạt động"
            className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm sm:px-3"
          >
            <button
              type="button"
              onClick={goNewer}
              disabled={cursorHistory.length === 0 || loading}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[10px] font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent sm:text-[11px]"
            >
              <ChevronLeft size={14} /> Mới hơn
            </button>

            <div className="min-w-0 text-center">
              <p className="text-[10px] font-black text-slate-600">
                Trang {pageNumber} · tối đa {PAGE_SIZE} hoạt động
              </p>
              <p className="hidden text-[9px] font-semibold text-slate-300 sm:block">
                Cursor pagination giữ thứ tự ổn định khi có hoạt động mới.
              </p>
            </div>

            <button
              type="button"
              onClick={goOlder}
              disabled={!hasMore || !nextCursor || loading}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[10px] font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent sm:text-[11px]"
            >
              Cũ hơn <ChevronRight size={14} />
            </button>
          </nav>

          {!hasMore ? (
            <p className="pb-1 text-center text-[10px] font-bold text-slate-300">
              Đã đến cuối lịch sử phù hợp.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
