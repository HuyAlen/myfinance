"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";

import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ChartPie,
  Folder,
  Home,
  Landmark,
  PiggyBank,
  Plus,
  ReceiptText,
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
      { label: "Tổng quan",    icon: Home,           href: "/" },
      { label: "Giao Dịch",    icon: ReceiptText,    href: "/transactions" },
      { label: "Ví Tiền",      icon: Wallet,         href: "/wallets" },
      { label: "Ngân Sách",    icon: ChartPie,       href: "/budgets" },
      { label: "Mục Tiêu",     icon: Target,         href: "/goals" },
      { label: "Danh Mục",     icon: Folder,         href: "/categories" },
    ],
  },
  {
    label: "Phân tích & Đầu tư",
    items: [
      { label: "Báo cáo",        icon: BarChart3,      href: "/reports" },
      { label: "Đầu Tư",         icon: BriefcaseBusiness, href: "/investments" },
      { label: "Nợ & Khoản Vay", icon: Landmark,      href: "/debts" },
      { label: "AI Advisor",     icon: Bot,           href: "/ai-insights" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { label: "Cài Đặt", icon: Settings, href: "/settings" },
    ],
  },
];

// ─── Quick Actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Thêm giao dịch", href: "/transactions", cls: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200" },
  { label: "Thêm ví tiền",    href: "/wallets",      cls: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200" },
  { label: "Thêm mục tiêu",  href: "/goals",        cls: "bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm shadow-cyan-200" },
];

type SidebarProps = { isOpen: boolean; onClose: () => void };

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname    = usePathname();
  const firstRender = useRef(true);
  const { status, lastSync } = useRealtime();
  const connected = status === "SUBSCRIBED";

  // Auto-close on route change
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Menu chính"
      aria-hidden={!isOpen}
      className={[
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-100 bg-white px-3 py-5 shadow-xl shadow-slate-200/40",
        "transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      {/* Close — mobile only */}
      <button
        onClick={onClose}
        aria-label="Đóng menu"
        className="absolute right-4 top-5 rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 lg:hidden"
      >
        <X size={18} />
      </button>

      {/* ══ Brand Area ══════════════════════════════════════════════════════ */}
      <Link href="/" onClick={onClose} className="mb-6 flex items-center gap-3 px-2">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200/60">
          <PiggyBank size={24} />
        </div>
        <div>
          <h1 className="text-[15px] font-black tracking-tight text-slate-900">MyFinance</h1>
          <p className="text-[11px] font-semibold text-slate-400">Your Personal CFO</p>
        </div>
      </Link>

      {/* ══ Navigation Groups ════════════════════════════════════════════════ */}
      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon   = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150",
                      active
                        ? "bg-blue-600 text-white shadow-md shadow-blue-200/70"
                        : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                    ].join(" ")}
                  >
                    <span className={[
                      "flex size-7 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-white/20" : "bg-slate-100",
                    ].join(" ")}>
                      <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {active && <span className="size-1.5 rounded-full bg-white/60" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* ══ Quick Actions ════════════════════════════════════════════════ */}
        <div>
          <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
            Thao tác nhanh
          </p>
          <div className="flex flex-col gap-1.5">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                onClick={onClose}
                className={["flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[12px] font-bold transition-all active:scale-[.98] ", a.cls].join("")}
              >
                <Plus size={13} />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* ══ Footer: Sync Status ══════════════════════════════════════════════ */}
      <div className="mt-3 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-blue-50/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={[
              "size-2 rounded-full",
              connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse",
            ].join(" ")} />
            <span className="text-xs font-bold text-slate-600">
              {connected ? "Đã kết nối" : "Đang kết nối..."}
            </span>
          </div>
          {lastSync && (
            <span className="text-[10px] font-medium text-slate-400">
              {lastSync.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">Realtime · Supabase</p>
      </div>
    </aside>
  );
}
