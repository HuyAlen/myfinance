"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import Link from "next/link";
import SeasonalWorkspaceAmbientMotion from "./SeasonalWorkspaceAmbientMotion";
import { usePathname } from "next/navigation";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";

import {
  BarChart3,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  ChartPie,
  Folder,
  History,
  Home,
  Landmark,
  PiggyBank,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Repeat2,
  Settings,
  Target,
  Wallet,
  X,
} from "lucide-react";

// ─── Navigation Groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Quản lý tài chính",
    items: [
      { label: "Tổng quan", icon: Home, href: "/" },
      { label: "Giao Dịch", icon: ReceiptText, href: "/transactions" },
      { label: "Định Kỳ", icon: Repeat2, href: "/recurring" },
      { label: "Ví Tiền", icon: Wallet, href: "/wallets" },
      { label: "Ngân Sách", icon: ChartPie, href: "/budgets" },
      { label: "Mục Tiêu", icon: Target, href: "/goals" },
      { label: "Danh Mục", icon: Folder, href: "/categories" },
    ],
  },
  {
    label: "Phân tích & Tài sản",
    items: [
      { label: "Báo cáo", icon: BarChart3, href: "/reports" },
      { label: "Tiết kiệm", icon: PiggyBank, href: "/savings" },
      { label: "Đầu Tư", icon: BriefcaseBusiness, href: "/investments" },
      { label: "Nợ & Khoản Vay", icon: Landmark, href: "/debts" },
      { label: "Cố vấn AI", icon: Bot, href: "/ai-insights" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { label: "Hoạt động", icon: History, href: "/activity" },
      { label: "Cài Đặt", icon: Settings, href: "/settings" },
      { label: "Hướng Dẫn", icon: BookOpen, href: "/help" },
    ],
  },
];

const SIDEBAR_SCROLL_STORAGE_KEY = "myfinance:sidebar-scroll-top";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export default function Sidebar({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const firstRender = useRef(true);
  const navScrollRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);
  const { status, lastSync } = useRealtime();
  const connected = status === "SUBSCRIBED";

  // Render compact-mode tooltips outside the scrollable <nav> so the nav's
  // overflow-y-auto cannot crop them. The tooltip is visual only: links retain
  // their accessible Vietnamese names through aria-label.
  const showTooltip = (
    event: FocusEvent<HTMLAnchorElement> | MouseEvent<HTMLAnchorElement>,
    label: string,
  ) => {
    if (!collapsed || !window.matchMedia("(min-width: 1024px)").matches) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const anchor = event.currentTarget.getBoundingClientRect();
    const bounds = sidebar.getBoundingClientRect();
    setTooltip({
      label,
      top: Math.round(anchor.top - bounds.top + anchor.height / 2),
    });
  };

  // SIDEBAR-SCROLL-RETENTION-1: AppShell can remount on route changes, which
  // recreates this independently-scrollable nav and would otherwise reset its
  // scrollTop to 0. Restore before paint, then persist the exact position when
  // this Sidebar instance unmounts. This intentionally leaves Link's normal
  // page-scroll behavior enabled; only the sidebar keeps its own position.
  useLayoutEffect(() => {
    const nav = navScrollRef.current;
    if (!nav) return;

    try {
      const storedScrollTop = window.sessionStorage.getItem(
        SIDEBAR_SCROLL_STORAGE_KEY,
      );
      const savedScrollTop = Number(storedScrollTop);
      if (storedScrollTop !== null && Number.isFinite(savedScrollTop)) {
        nav.scrollTop = savedScrollTop;
      }
    } catch {
      // sessionStorage can be unavailable in restricted browser contexts.
      // Scroll retention is an enhancement; navigation must keep working.
    }

    return () => {
      try {
        window.sessionStorage.setItem(
          SIDEBAR_SCROLL_STORAGE_KEY,
          String(nav.scrollTop),
        );
      } catch {
        // Keep route changes resilient when storage is unavailable.
      }
    };
  }, []);

  // Auto-close on route change
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <aside
      ref={sidebarRef}
      id="sidebar"
      aria-label="Thanh điều hướng"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      className={[
        "finance-sidebar fixed inset-y-0 left-0 z-70 flex w-[min(18rem,85vw)] flex-col border-r border-slate-100 bg-white px-3 py-4 shadow-xl shadow-slate-200/40",
        "transition-[width,transform,visibility] duration-300 ease-in-out motion-reduce:transition-none",
        collapsed ? "lg:w-20" : "lg:w-64",
        isOpen
          ? "visible translate-x-0"
          : "invisible -translate-x-full lg:visible lg:translate-x-0",
      ].join(" ")}
    >
      <SeasonalWorkspaceAmbientMotion area="sidebar" />

      {/* Close button — mobile drawer only */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng menu"
        className="absolute right-3 top-4 flex size-11 items-center justify-center rounded-2xl bg-slate-100 p-0 text-slate-500 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 lg:hidden"
      >
        <X size={18} />
      </button>

      {/* Desktop width toggle remains outside mobile navigation. */}
      <div
        className={[
          "relative z-10 mb-4 flex items-center gap-2",
          collapsed ? "lg:flex-col lg:items-center lg:gap-2" : "",
        ].join(" ")}
      >
        <Link
          href="/"
          onClick={() => {
            setTooltip(null);
            onClose();
          }}
          onMouseEnter={(event) => showTooltip(event, "Tổng quan")}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(event) => showTooltip(event, "Tổng quan")}
          onBlur={() => setTooltip(null)}
          title={collapsed ? "Tổng quan" : undefined}
          aria-label={collapsed ? "MyFinance — Tổng quan" : undefined}
          className={[
            "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            collapsed ? "lg:w-full lg:flex-none lg:justify-center lg:px-0" : "",
          ].join(" ")}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200/60">
            <PiggyBank size={22} />
          </div>
          <div className={collapsed ? "min-w-0 lg:hidden" : "min-w-0"}>
            <h1 className="truncate text-[14px] font-black tracking-tight text-slate-900">
              MyFinance
            </h1>
            <p className="truncate text-[10px] font-semibold text-slate-400">
              Trợ lý tài chính cá nhân
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => {
            setTooltip(null);
            onToggleCollapsed();
          }}
          aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          className="hidden size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:inline-flex"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* ══ Navigation Groups ════════════════════════════════════════════════ */}
      <nav
        ref={navScrollRef}
        aria-label="Menu chính"
        onScroll={() => setTooltip(null)}
        className="no-scrollbar relative z-10 min-h-0 flex-1 space-y-4 overflow-y-auto pb-3"
      >
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label}
            className={collapsed && groupIndex > 0 ? "lg:border-t lg:border-slate-200/80 lg:pt-3" : ""}
          >
            <p
              className={[
                "mb-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400",
                collapsed ? "lg:sr-only" : "",
              ].join(" ")}
            >
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={() => {
                      setTooltip(null);
                      onClose();
                    }}
                    onMouseEnter={(event) => showTooltip(event, item.label)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(event) => showTooltip(event, item.label)}
                    onBlur={() => setTooltip(null)}
                    className={[
                      "flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      collapsed ? "lg:justify-center lg:gap-0 lg:px-1 lg:py-2" : "",
                      active
                        ? "bg-blue-600 text-white shadow-md shadow-blue-200/70"
                        : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex size-7 shrink-0 items-center justify-center rounded-xl transition-colors",
                        collapsed ? "lg:size-9" : "",
                        active ? "bg-white/20" : "bg-slate-100",
                      ].join(" ")}
                    >
                      <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                    </span>
                    <span className={collapsed ? "min-w-0 flex-1 truncate lg:hidden" : "min-w-0 flex-1 truncate"}>
                      {item.label}
                    </span>
                    {active && (
                      <span className={collapsed ? "size-1.5 rounded-full bg-white/60 lg:hidden" : "size-1.5 rounded-full bg-white/60"} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ══ Footer: Realtime Sync Status ═════════════════════════════════════ */}
      <div
        role="status"
        aria-label={connected ? "Đã kết nối Supabase" : "Đang kết nối Supabase"}
        title={collapsed ? (connected ? "Đã kết nối · Supabase" : "Đang kết nối · Supabase") : undefined}
        className={[
          "relative z-10 mt-3 rounded-2xl border border-slate-100 bg-linear-to-br from-slate-50 to-blue-50/40 px-3 py-3",
          collapsed ? "lg:flex lg:justify-center lg:rounded-xl lg:px-2 lg:py-3" : "",
        ].join(" ")}
      >
        <div className={collapsed ? "flex items-center justify-between gap-2 lg:justify-center" : "flex items-center justify-between gap-2"}>
          <div className="flex items-center gap-2">
            <span
              className={[
                "size-2 shrink-0 rounded-full",
                connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse",
              ].join(" ")}
            />
            <span className={collapsed ? "text-xs font-bold text-slate-600 lg:hidden" : "text-xs font-bold text-slate-600"}>
              {connected ? "Đã kết nối" : "Đang kết nối..."}
            </span>
          </div>
          {lastSync && (
            <span className={collapsed ? "text-[10px] font-medium text-slate-400 lg:hidden" : "text-[10px] font-medium text-slate-400"}>
              {lastSync.toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <p className={collapsed ? "mt-0.5 text-[10px] text-slate-400 lg:hidden" : "mt-0.5 text-[10px] text-slate-400"}>
          Thời gian thực · Supabase
        </p>
      </div>

      {/* Sibling of scrollable nav: avoids clipped desktop hover/focus tooltip. */}
      {collapsed && tooltip && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-full z-80 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-xl lg:block"
          style={{ top: tooltip.top }}
        >
          {tooltip.label}
        </div>
      )}
    </aside>
  );
}
