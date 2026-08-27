"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatVND } from "@/src/services/finance/financeCalculations";
import { formatCompactVND } from "./dashboardFormat";

export type CashFlowChartPoint = {
  label: string;
  thu: number | null;
  chi: number | null;
  dongTienRong: number | null;
};

export default function CashFlowChart({
  data,
}: {
  data: CashFlowChartPoint[];
}) {
  return (
    <div className="mt-5 h-52">
      <ResponsiveContainer width="100%" height={208} minWidth={0}>
        <ComposedChart
          data={data}
          barGap={3}
          barCategoryGap={12}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
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
              boxShadow: "0 12px 32px -16px rgb(37 99 235 / 0.18)",
              color: "#334E68",
              fontSize: "12px",
            }}
            formatter={(value, name) => [
              value === null || value === undefined
                ? "Chưa có dữ liệu"
                : formatVND(Number(value)),
              String(name),
            ]}
          />
          <Bar dataKey="thu" name="Thu nhập" fill="#34D399" radius={[6, 6, 0, 0]} />
          <Bar dataKey="chi" name="Chi tiêu" fill="#FB7185" radius={[6, 6, 0, 0]} />
          <Line
            type="monotone"
            dataKey="dongTienRong"
            name="Dòng tiền ròng"
            stroke="#1677FF"
            strokeWidth={2.5}
            connectNulls={false}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
