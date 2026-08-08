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
              border: "1px solid #e2e8f0",
              fontSize: "12px",
            }}
            formatter={(value, name) => [
              value === null || value === undefined
                ? "Chưa có dữ liệu"
                : formatVND(Number(value)),
              String(name),
            ]}
          />
          <Bar dataKey="thu" name="Thu nhập" fill="#10b981" radius={[6, 6, 0, 0]} />
          <Bar dataKey="chi" name="Chi tiêu" fill="#f43f5e" radius={[6, 6, 0, 0]} />
          <Line
            type="monotone"
            dataKey="dongTienRong"
            name="Dòng tiền ròng"
            stroke="#2563eb"
            strokeWidth={2.5}
            connectNulls={false}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
