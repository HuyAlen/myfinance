"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatVND } from "@/src/services/finance/financeCalculations";
import { formatCompactVND } from "./dashboardFormat";

export type NetWorthTrendPoint = {
  label: string;
  month: number;
  value: number | null;
  hasData: boolean;
  isSnapshotMonth: boolean;
};

export default function NetWorthTrendChart({
  trend,
}: {
  trend: NetWorthTrendPoint[];
}) {
  return (
    <div className="mt-3 h-44">
      <ResponsiveContainer width="100%" height={176} minWidth={0}>
        <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dashboardNetWorth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={46}
            fontSize={10}
            tickFormatter={(value) => formatCompactVND(Number(value))}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "0.9rem",
              border: "1px solid #dbeafe",
              boxShadow: "0 16px 40px -16px rgb(15 23 42 / 0.25)",
              fontSize: "12px",
            }}
            formatter={(value) => [
              value == null ? "Không có dữ liệu" : formatVND(Number(value)),
              "Tài sản ròng",
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            connectNulls={false}
            stroke="#2563eb"
            strokeWidth={3}
            fill="url(#dashboardNetWorth)"
            dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
