"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Home, ReceiptText, Settings, Wallet } from "lucide-react";

const tabs = [
  { label: "Tổng quan", icon: Home,        href: "/" },
  { label: "Giao dịch", icon: ReceiptText, href: "/transactions" },
  { label: "Ví",        icon: Wallet,      href: "/wallets" },
  { label: "AI",        icon: Bot,         href: "/ai-insights" },
  { label: "Cài đặt",  icon: Settings,    href: "/settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng chính"
      className={[
        "fixed inset-x-0 bottom-0 z-50 lg:hidden",
        "border-t border-slate-200 bg-white/95 backdrop-blur-xl",
        "pb-[env(safe-area-inset-bottom)]",
      ].join(" ")}
    >
      <div className="flex items-stretch">
        {tabs.map(({ label, icon: Icon, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors duration-200",
                isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={[
                "flex size-9 items-center justify-center rounded-2xl transition-all duration-200",
                isActive ? "bg-blue-50 shadow-sm shadow-blue-100" : "",
              ].join(" ")}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
              </span>
              <span className={isActive ? "font-black" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
