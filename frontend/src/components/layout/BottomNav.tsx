"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, MoreHorizontal, X } from "lucide-react";
import {
  MOBILE_MORE_GROUPS,
  MOBILE_PRIMARY_NAV_ITEMS,
  isMobileMorePath,
  isMobileNavigationPathActive,
} from "./mobileNavigation";

type BottomNavProps = {
  onMoreMenuOpenChange?: (open: boolean) => void;
};

export default function BottomNav({
  onMoreMenuOpenChange,
}: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreMoreTriggerFocusRef = useRef(false);
  const moreRouteActive = isMobileMorePath(pathname);

  useEffect(() => {
    restoreMoreTriggerFocusRef.current = false;
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (moreOpen) {
      restoreMoreTriggerFocusRef.current = true;
      return;
    }
    if (!restoreMoreTriggerFocusRef.current) return;
    restoreMoreTriggerFocusRef.current = false;
    moreTriggerRef.current?.focus();
  }, [moreOpen]);

  useEffect(() => {
    onMoreMenuOpenChange?.(moreOpen);
    return () => {
      onMoreMenuOpenChange?.(false);
    };
  }, [moreOpen, onMoreMenuOpenChange]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreMoreTriggerFocusRef.current = true;
        setMoreOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = document.getElementById("mobile-more-menu");
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
      "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] leading-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2",
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
          {MOBILE_PRIMARY_NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = isMobileNavigationPathActive(pathname, href);

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
            ref={moreTriggerRef}
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
            className="absolute inset-0 touch-none bg-slate-950/40 backdrop-blur-[2px]"
          />

          <section
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            aria-describedby="mobile-more-description"
            className="absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,42rem)] flex-col overflow-hidden rounded-t-[28px] border-t border-slate-200/80 bg-[#F8FBFE] shadow-[0_-24px_70px_rgba(15,23,42,0.20)]"
            style={{
              maxHeight: "min(calc(var(--mobile-more-visual-viewport-height, 100dvh) - 0.75rem), 42rem)",
            }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/90" />

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 px-4 pb-3 pt-2.5">
              <div className="min-w-0">
                <h2
                  id="mobile-more-title"
                  className="text-[22px] font-black tracking-tight text-slate-900"
                >
                  Thêm
                </h2>
                <p
                  id="mobile-more-description"
                  className="mt-0.5 text-[13px] font-medium leading-5 text-slate-500"
                >
                  Các mục quản lý và phân tích khác.
                </p>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Đóng menu Thêm"
                onClick={() => setMoreOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-95 active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5">
              <div className="space-y-3.5">
                {MOBILE_MORE_GROUPS.map((group) => (
                  <section
                    key={group.label}
                    className="rounded-[24px] border border-slate-200/80 bg-white p-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                  >
                    <h3 className="mb-2 px-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      {group.label}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isMobileNavigationPathActive(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              restoreMoreTriggerFocusRef.current = false;
                              setMoreOpen(false);
                            }}
                            aria-current={active ? "page" : undefined}
                            className={[
                              "flex min-h-[4.5rem] items-center gap-2.5 rounded-[18px] border px-2.5 py-2.5 text-left transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1",
                              active
                                ? "border-blue-200 bg-blue-50/90 shadow-[0_6px_18px_rgba(37,99,235,0.08)]"
                                : "border-slate-100 bg-slate-50/70 active:bg-slate-100",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "relative flex size-10 shrink-0 items-center justify-center rounded-[14px]",
                                item.iconClass,
                              ].join(" ")}
                            >
                              <Icon size={18} strokeWidth={active ? 2.5 : 2.1} />
                              {active ? (
                                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white">
                                  <Check size={10} strokeWidth={3} aria-hidden="true" />
                                  <span className="sr-only">Đang mở</span>
                                </span>
                              ) : null}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={[
                                  "block text-[13px] font-extrabold leading-5",
                                  active ? "text-blue-800" : "text-slate-800",
                                ].join(" ")}
                              >
                                {item.label}
                              </span>
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