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
              <stop offset="5%" stopColor="#1677FF" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#1677FF" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EDF5" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            fontSize={11}
            tick={{ fill: "#64748B" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={46}
            fontSize={10}
            tick={{ fill: "#64748B" }}
            tickFormatter={(value) => formatCompactVND(Number(value))}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "0.9rem",
              border: "1px solid #E6EDF5",
              boxShadow: "0 12px 32px -16px rgb(37 99 235 / 0.2)",
              color: "#334E68",
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
            stroke="#1677FF"
            strokeWidth={3}
            fill="url(#dashboardNetWorth)"
            dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
