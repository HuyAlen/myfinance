"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ChartPie,
  Folder,
  Home,
  Landmark,
  PiggyBank,
  ReceiptText,
  Settings,
  Target,
  Wallet,
  X,
} from "lucide-react";

const menuItems = [
  { label: "Tổng quan", icon: Home, href: "/" },
  { label: "Giao Dịch", icon: ReceiptText, href: "/transactions" },
  { label: "Ví Tiền", icon: Wallet, href: "/wallets" },
  { label: "Ngân Sách", icon: ChartPie, href: "/budgets" },
  { label: "Mục Tiêu", icon: Target, href: "/goals" },
  { label: "Báo cáo", icon: BarChart3, href: "/reports" },
  { label: "Nợ & Khoản Vay", icon: Landmark, href: "/debts" },
  { label: "Danh Mục", icon: Folder, href: "/categories" },
  { label: "Đầu Tư", icon: BriefcaseBusiness, href: "/investments" },
  { label: "AI Insights", icon: Bot, href: "/ai-insights" },
  { label: "Cài Đặt", icon: Settings, href: "/settings" },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const firstRender = useRef(true);

  // Auto-close on route change (safety net for programmatic navigation)
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
      role="dialog"
      aria-modal="true"
      aria-label="Menu chính"
      aria-hidden={!isOpen}
      className={[
        "fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white/90 px-4 py-5 shadow-sm backdrop-blur-xl",
        "transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      {/* Close button — mobile only */}
      <button
        onClick={onClose}
        aria-label="Đóng menu"
        className="absolute right-4 top-5 rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 lg:hidden"
      >
        <X size={18} />
      </button>

      <Link
        href="/"
        className="mb-8 flex items-center gap-3 px-2"
        onClick={onClose}
      >
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200">
          <PiggyBank size={24} />
        </div>

        <div>
          <h1 className="text-lg font-bold tracking-tight">MyFinance</h1>
          <p className="text-xs text-slate-500">Personal Wealth OS</p>
        </div>
      </Link>

      {/* Scrollable nav area so items are never cut off on short screens */}
      <nav className="overflow-y-auto pb-40 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={[
                "group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                active
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-600",
              ].join(" ")}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-5 left-4 right-4 rounded-3xl bg-gradient-to-br from-blue-50 to-cyan-50 p-5">
        <p className="text-sm font-bold text-slate-900">AI Financial Coach</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Theo dõi dòng tiền, ngân sách và sức khỏe tài chính của bạn.
        </p>

        <Link
          href="/ai-insights"
          onClick={onClose}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-100"
        >
          Mở AI Insights
        </Link>
      </div>
    </aside>
  );
}
