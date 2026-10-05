import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChartPie,
  Folder,
  History,
  Home,
  Landmark,
  PiggyBank,
  ReceiptText,
  Repeat2,
  Settings,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

// MOBILE-NAV-SSOT-1: one registry owns every mobile navigation destination.
// BottomNav renders the primary + More surfaces; Header renders account/system
// shortcuts. Keep route, label, icon and placement here so those surfaces cannot
// silently drift apart as mobile navigation evolves.
export const MOBILE_PRIMARY_NAV_ITEMS = [
  { label: "Tổng quan", icon: Home, href: "/" },
  { label: "Giao dịch", icon: ReceiptText, href: "/transactions" },
  { label: "Ngân sách", icon: ChartPie, href: "/budgets" },
  { label: "Tiết kiệm", icon: PiggyBank, href: "/savings" },
] as const;

export const MOBILE_MORE_GROUPS = [
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

export const MOBILE_ACCOUNT_NAV_ITEMS = [
  {
    label: "Cố vấn AI",
    icon: Sparkles,
    href: "/ai-insights",
    iconClass: "text-blue-500",
  },
  {
    label: "Hoạt động",
    icon: History,
    href: "/activity",
    iconClass: "text-slate-400",
  },
  {
    label: "Cài đặt",
    icon: Settings,
    href: "/settings",
    iconClass: "text-slate-400",
  },
  {
    label: "Hướng dẫn",
    icon: BookOpen,
    href: "/help",
    iconClass: "text-slate-400",
  },
] as const;

export const MOBILE_MORE_ROUTES = MOBILE_MORE_GROUPS.flatMap((group) =>
  group.items.map((item) => item.href),
);

export const MOBILE_NAV_ROUTE_HREFS = [
  ...MOBILE_PRIMARY_NAV_ITEMS.map((item) => item.href),
  ...MOBILE_MORE_ROUTES,
  ...MOBILE_ACCOUNT_NAV_ITEMS.map((item) => item.href),
] as const;

export function isMobileNavigationPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function isMobileMorePath(pathname: string) {
  return MOBILE_MORE_ROUTES.some((href) =>
    isMobileNavigationPathActive(pathname, href),
  );
}