"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  ChartPie,
  Folder,
  Home,
  Landmark,
  MoreHorizontal,
  PiggyBank,
  ReceiptText,
  Repeat2,
  Target,
  Wallet,
  X,
} from "lucide-react";

const PRIMARY_TABS = [
  { label: "Tổng quan", icon: Home, href: "/" },
  { label: "Giao dịch", icon: ReceiptText, href: "/transactions" },
  { label: "Ngân sách", icon: ChartPie, href: "/budgets" },
  { label: "Tiết kiệm", icon: PiggyBank, href: "/savings" },
] as const;

const MORE_GROUPS = [
  {
    label: "Quản lý",
    items: [
      {
        label: "Ví tiền",
        icon: Wallet,
        href: "/wallets",
        iconClass: "bg-blue-50 text-blue-700",
      },
      {
        label: "Mục tiêu",
        icon: Target,
        href: "/goals",
        iconClass: "bg-violet-50 text-violet-700",
      },
      {
        label: "Định kỳ",
        icon: Repeat2,
        href: "/recurring",
        iconClass: "bg-cyan-50 text-cyan-700",
      },
      {
        label: "Danh mục",
        icon: Folder,
        href: "/categories",
        iconClass: "bg-slate-100 text-slate-700",
      },
    ],
  },
  {
    label: "Phân tích & tài sản",
    items: [
      {
        label: "Báo cáo",
        icon: BarChart3,
        href: "/reports",
        iconClass: "bg-indigo-50 text-indigo-700",
      },
      {
        label: "Đầu tư",
        icon: BriefcaseBusiness,
        href: "/investments",
        iconClass: "bg-emerald-50 text-emerald-700",
      },
      {
        label: "Nợ & khoản vay",
        icon: Landmark,
        href: "/debts",
        iconClass: "bg-amber-50 text-amber-700",
      },
    ],
  },
] as const;

const MORE_ROUTES = MORE_GROUPS.flatMap((group) =>
  group.items.map((item) => item.href),
);

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function isMorePath(pathname: string) {
  return MORE_ROUTES.some((href) => pathname.startsWith(href));
}

type BottomNavProps = {
  onMoreMenuOpenChange?: (open: boolean) => void;
};

export default function BottomNav({
  onMoreMenuOpenChange,
}: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRouteActive = isMorePath(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    onMoreMenuOpenChange?.(moreOpen);
    return () => {
      onMoreMenuOpenChange?.(false);
    };
  }, [moreOpen, onMoreMenuOpenChange]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  // MOBILE-MORE-REAL-IPHONE-QA-1: AppShell intentionally ignores
  // visualViewport scroll events during ordinary page scrolling for smoothness.
  // The modal More surface is different: while open it must follow the actually
  // visible iPhone viewport (Safari toolbar, landscape and standalone/PWA).
  useEffect(() => {
    if (!moreOpen || typeof window === "undefined") return;

    const root = document.documentElement;
    const viewport = window.visualViewport;

    const syncMobileMoreVisualViewport = () => {
      const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
      root.style.setProperty(
        "--mobile-more-visual-viewport-height",
        `${height}px`,
      );
      root.style.setProperty(
        "--mobile-more-visual-viewport-offset-top",
        `${offsetTop}px`,
      );
    };

    syncMobileMoreVisualViewport();
    viewport?.addEventListener("resize", syncMobileMoreVisualViewport);
    viewport?.addEventListener("scroll", syncMobileMoreVisualViewport);
    window.addEventListener("resize", syncMobileMoreVisualViewport);
    window.addEventListener("orientationchange", syncMobileMoreVisualViewport);

    return () => {
      viewport?.removeEventListener("resize", syncMobileMoreVisualViewport);
      viewport?.removeEventListener("scroll", syncMobileMoreVisualViewport);
      window.removeEventListener("resize", syncMobileMoreVisualViewport);
      window.removeEventListener("orientationchange", syncMobileMoreVisualViewport);
      root.style.removeProperty("--mobile-more-visual-viewport-height");
      root.style.removeProperty("--mobile-more-visual-viewport-offset-top");
    };
  }, [moreOpen]);

  const primaryItemClass = (active: boolean) =>
    [
      "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] leading-tight transition-all duration-200",
      active
        ? "font-bold text-[var(--finance-primary-text)]"
        : "font-semibold text-[var(--finance-muted)] active:bg-[#F3F7FB]",
    ].join(" ");

  return (
    <>
      <nav
        aria-label="Điều hướng chính"
        className={[
          "fixed inset-x-0 bottom-0 z-50 lg:hidden",
          "finance-bottom-nav border-t border-[#DDE7F0] bg-white/95 shadow-[0_-8px_22px_rgba(54,83,107,0.08)] backdrop-blur-xl",
          "pb-[max(env(safe-area-inset-bottom),0.5rem)]",
        ].join(" ")}
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1">
          {PRIMARY_TABS.map(({ label, icon: Icon, href }) => {
            const active = isActivePath(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                className={primaryItemClass(active)}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={[
                    "flex size-9 items-center justify-center rounded-2xl transition-all duration-200",
                    active ? "bg-[#EAF3FC]" : "bg-transparent",
                  ].join(" ")}
                >
                  <Icon size={20} strokeWidth={active ? 2.6 : 1.9} />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            aria-current={moreRouteActive ? "page" : undefined}
            aria-label={moreOpen ? "Đóng menu Thêm" : "Mở menu Thêm"}
            className={primaryItemClass(moreOpen || moreRouteActive)}
          >
            <span
              className={[
                "flex size-9 items-center justify-center rounded-2xl transition-all duration-200",
                moreOpen || moreRouteActive
                  ? "bg-[#EAF3FC]"
                  : "bg-transparent",
              ].join(" ")}
            >
              <MoreHorizontal
                size={20}
                strokeWidth={moreOpen || moreRouteActive ? 2.6 : 1.9}
              />
            </span>
            <span className="max-w-full truncate">Thêm</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div
          data-mobile-more-sheet="true"
          className="fixed inset-0 z-80 lg:hidden overscroll-none"
          style={{
            top: "var(--mobile-more-visual-viewport-offset-top, 0px)",
            height: "var(--mobile-more-visual-viewport-height, 100dvh)",
          }}
        >
          <button
            type="button"
            aria-label="Đóng menu Thêm"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 touch-none bg-slate-950/35 backdrop-blur-[1px]"
          />

          <section
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,42rem)] flex-col overflow-hidden rounded-t-[30px] border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)]"
            style={{
              maxHeight: "min(calc(var(--mobile-more-visual-viewport-height, 100dvh) - 0.75rem), 42rem)",
            }}
          >
            <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">
                  Điều hướng
                </p>
                <h2
                  id="mobile-more-title"
                  className="mt-0.5 text-xl font-black tracking-tight text-slate-900"
                >
                  Thêm
                </h2>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                  Truy cập các mục quản lý, báo cáo và tài sản.
                </p>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Đóng menu Thêm"
                onClick={() => setMoreOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition active:scale-95"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              <div className="space-y-5">
                {MORE_GROUPS.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      {group.label}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isActivePath(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={[
                              "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98]",
                              active
                                ? "border-blue-200 bg-blue-50/80 shadow-sm"
                                : "border-slate-200 bg-white active:bg-slate-50",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                                item.iconClass,
                              ].join(" ")}
                            >
                              <Icon size={18} strokeWidth={active ? 2.5 : 2.1} />
                            </span>
                            <span className="min-w-0">
                              <span
                                className={[
                                  "block text-[13px] font-black leading-5",
                                  active ? "text-blue-800" : "text-slate-800",
                                ].join(" ")}
                              >
                                {item.label}
                              </span>
                              {active ? (
                                <span className="mt-0.5 block text-[10px] font-bold text-blue-500">
                                  Đang mở
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
