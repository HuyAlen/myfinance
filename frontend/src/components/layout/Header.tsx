"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Moon,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";
import { signOut } from "@/src/lib/auth";

type HeaderProps = {
  onMenuOpen: () => void;
  sidebarOpen?: boolean;
};

function RealtimeStatusChip() {
  const { status, lastSync } = useRealtime();

  const connected = status === "SUBSCRIBED";
  const timeStr = lastSync
    ? lastSync.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
      title={connected ? "Realtime đang kết nối" : "Đang kết nối..."}
    >
      <span
        className={`size-2 rounded-full ${
          connected ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
        }`}
      />
      <span className="hidden text-slate-500 sm:block">
        {timeStr
          ? `Đồng bộ: ${timeStr}`
          : connected
            ? "Đã kết nối"
            : "Đang kết nối..."}
      </span>
    </div>
  );
}

export default function Header({
  onMenuOpen,
  sidebarOpen = false,
}: HeaderProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? "U";
  const displayEmail = user?.email ?? "";

  async function handleLogout() {
    setDropdownOpen(false);
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={onMenuOpen}
            aria-label="Mở menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          >
            <span
              className={[
                "flex h-[22px] w-[22px] flex-col items-center justify-center gap-[5px] transition-all duration-300",
              ].join(" ")}
            >
              <span
                className={[
                  "h-[2px] w-[18px] rounded-full bg-current origin-center transition-all duration-300",
                  sidebarOpen ? "translate-y-[7px] rotate-45" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-[2px] w-[18px] rounded-full bg-current transition-all duration-300",
                  sidebarOpen ? "opacity-0 scale-x-0" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-[2px] w-[18px] rounded-full bg-current origin-center transition-all duration-300",
                  sidebarOpen ? "-translate-y-[7px] -rotate-45" : "",
                ].join(" ")}
              />
            </span>
          </button>

          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-950 sm:text-xl">
              Tổng quan tài chính
            </h2>
            <p className="hidden text-sm text-slate-500 sm:block">
              Bao quát tài sản, dòng tiền, nợ và mục tiêu của bạn.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Desktop-only controls */}
          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm">
              <CalendarDays size={16} />
              Tháng 6, 2026
            </div>

            <div className="flex w-72 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
              <Search size={16} />
              <input
                className="w-full bg-transparent outline-none"
                placeholder="Tìm kiếm..."
              />
            </div>

            <button className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200">
              <Sparkles size={16} />
              AI Cố vấn
            </button>

            <button className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm">
              <Moon size={18} />
            </button>

            <button className="relative rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm">
              <Bell size={18} />
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                3
              </span>
            </button>
          </div>

          {/* Realtime status — always visible */}
          <RealtimeStatusChip />

          {/* User profile dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-2 pl-2 pr-3 shadow-sm transition hover:bg-slate-50"
            >
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-black text-white">
                {avatarLetter}
              </div>
              <span className="hidden max-w-[140px] truncate text-sm font-medium text-slate-700 md:block">
                {displayEmail}
              </span>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dropdownOpen && (
              <>
                {/* Click-outside overlay */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />

                {/* Dropdown panel */}
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {/* User info */}
                  <div className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-black text-white">
                        {avatarLetter}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {displayEmail}
                        </p>
                        <p className="text-xs text-slate-500">
                          Tài khoản cá nhân
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profile item */}
                  <button
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    <User size={16} className="text-slate-400" />
                    Hồ sơ cá nhân
                  </button>

                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut size={16} />
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
