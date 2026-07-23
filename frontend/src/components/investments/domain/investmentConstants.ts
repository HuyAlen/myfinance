import type { InvestmentType } from "@/src/types/finance";
import type { InvestmentTypeConfig } from "./investmentTypes";

export const ALL_INVESTMENT_TYPES: InvestmentType[] = [
  "stock",
  "crypto",
  "fund",
  "gold",
  "other",
];

export const INVESTMENT_TYPE_CONFIG: Record<
  InvestmentType,
  InvestmentTypeConfig
> = {
  stock: {
    label: "Cổ phiếu",
    color: "#10b981",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-400",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  crypto: {
    label: "Crypto",
    color: "#f97316",
    gradientFrom: "from-orange-400",
    gradientTo: "to-yellow-500",
    bg: "bg-orange-50 text-orange-700 border-orange-200",
  },
  fund: {
    label: "Quỹ đầu tư",
    color: "#2563eb",
    gradientFrom: "from-blue-600",
    gradientTo: "to-cyan-500",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
  },
  gold: {
    label: "Vàng",
    color: "#f59e0b",
    gradientFrom: "from-amber-400",
    gradientTo: "to-orange-500",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  other: {
    label: "Khác",
    color: "#64748b",
    gradientFrom: "from-slate-500",
    gradientTo: "to-slate-600",
    bg: "bg-slate-100 text-slate-600 border-slate-200",
  },
};
