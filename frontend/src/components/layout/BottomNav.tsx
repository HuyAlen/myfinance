"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChartPie,
  Home,
  MoreHorizontal,
  ReceiptText,
  Target,
} from "lucide-react";

const tabs = [
  { label: "Tổng quan", icon: Home, href: "/" },
  { label: "Giao dịch", icon: ReceiptText, href: "/transactions" },
  { label: "Ngân sách", icon: ChartPie, href: "/budgets" },
  { label: "Mục tiêu", icon: Target, href: "/goals" },
  { label: "Thêm", icon: MoreHorizontal, href: "/categories" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/categories") {
    return [
      "/categories",
      "/reports",
      "/wallets",
      "/investments",
      "/debts",
      "/ai-insights",
      "/settings",
      "/help",
    ].some((path) => pathname.startsWith(path));
  }

  return pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng chính"
      className={[
        "fixed inset-x-0 bottom-0 z-50 lg:hidden",
        "border-t border-slate-200 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl",
        "pb-[max(env(safe-area-inset-bottom),0.5rem)]",
      ].join(" ")}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1">
        {tabs.map(({ label, icon: Icon, href }) => {
          const isActive = isActivePath(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-all duration-200",
                isActive
                  ? "text-blue-600"
                  : "text-slate-400 active:bg-slate-100",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={[
                  "flex size-9 items-center justify-center rounded-2xl transition-all duration-200",
                  isActive
                    ? "bg-blue-50 shadow-sm shadow-blue-100"
                    : "bg-transparent",
                ].join(" ")}
              >
                <Icon size={20} strokeWidth={isActive ? 2.6 : 1.9} />
              </span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
