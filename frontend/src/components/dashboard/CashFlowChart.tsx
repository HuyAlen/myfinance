"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
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

function isNonZeroNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function hasCashFlowActivity(point: CashFlowChartPoint) {
  return isNonZeroNumber(point.thu) || isNonZeroNumber(point.chi);
}

export function normalizeCashFlowPointForChart(
  point: CashFlowChartPoint,
): CashFlowChartPoint {
  if (hasCashFlowActivity(point)) return point;

  return {
    ...point,
    thu: null,
    chi: null,
    dongTienRong: null,
  };
}

function getCashFlowValues(data: CashFlowChartPoint[]) {
  return data.flatMap((point) =>
    [point.thu, point.chi, point.dongTienRong].filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    ),
  );
}

function getNiceCashFlowStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 250_000;

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceFactor =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;

  return niceFactor * magnitude;
}

function getCashFlowScale(data: CashFlowChartPoint[]) {
  const values = getCashFlowValues(data);

  if (values.length === 0) {
    return {
      domain: [0, 1_000_000] as [number, number],
      ticks: [0, 250_000, 500_000, 750_000, 1_000_000],
    };
  }

  const dataMin = Math.min(0, ...values);
  const dataMax = Math.max(0, ...values);

  if (dataMin === 0 && dataMax === 0) {
    return {
      domain: [0, 1_000_000] as [number, number],
      ticks: [0, 250_000, 500_000, 750_000, 1_000_000],
    };
  }

  const span = Math.max(dataMax - dataMin, Math.abs(dataMax), 1);
  const padding = span * 0.05;
  const paddedMin = dataMin < 0 ? dataMin - padding : 0;
  const paddedMax = dataMax + padding;
  const step = getNiceCashFlowStep((paddedMax - paddedMin) / 5);
  const domainMin = dataMin < 0 ? Math.floor(paddedMin / step) * step : 0;
  const domainMax = Math.max(step, Math.ceil(paddedMax / step) * step);

  const ticks: number[] = [];
  for (let value = domainMin; value <= domainMax + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
  }

  return {
    domain: [domainMin, domainMax] as [number, number],
    ticks,
  };
}

export function getCashFlowDomain(
  data: CashFlowChartPoint[],
): [number, number] {
  return getCashFlowScale(data).domain;
}

export function getCashFlowTicks(data: CashFlowChartPoint[]) {
  return getCashFlowScale(data).ticks;
}

export default function CashFlowChart({
  data,
}: {
  data: CashFlowChartPoint[];
}) {
  const chartData = data.map(normalizeCashFlowPointForChart);
  const activeMonthCount = chartData.filter(hasCashFlowActivity).length;
  const cashFlowDomain = getCashFlowDomain(chartData);
  const cashFlowTicks = getCashFlowTicks(chartData);

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <p className="text-[11px] font-bold text-slate-600">
          {activeMonthCount}/12 tháng có dòng tiền
        </p>

        <div
          className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-semibold text-slate-600"
          aria-label="Chú thích biểu đồ dòng tiền"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#34D399]" />
            Thu nhập
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#FB7185]" />
            Chi tiêu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 rounded-full bg-[#3B82F6]" />
            Còn lại
          </span>
        </div>
      </div>

      <div className="min-h-56 flex-1 xl:min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={chartData}
            barGap={3}
            barCategoryGap={12}
            margin={{ top: 14, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 5"
              vertical={false}
              stroke="#DCE6EF"
            />
            <ReferenceLine y={0} stroke="#B9C9D8" strokeWidth={1.35} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              fontSize={11}
              fontWeight={600}
              tick={{ fill: "#8AA0B5" }}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={46}
              fontSize={11}
              fontWeight={600}
              tick={{ fill: "#8AA0B5" }}
              tickFormatter={(value) => formatCompactVND(Number(value))}
              domain={cashFlowDomain}
              ticks={cashFlowTicks}
            />
            <Tooltip
              filterNull
              cursor={{ fill: "#F7FAFD" }}
              contentStyle={{
                borderRadius: "0.9rem",
                border: "1px solid #E3ECF5",
                boxShadow: "0 14px 34px -18px rgb(47 128 237 / 0.22)",
                color: "#35536F",
                fontSize: "12px",
                padding: "10px 12px",
              }}
              labelStyle={{
                color: "#173B5E",
                fontWeight: 700,
                marginBottom: "4px",
              }}
              labelFormatter={(label) =>
                String(label).replace(/^T(\d+)$/, "Tháng $1")
              }
              formatter={(value, name) => [
                value === null || value === undefined
                  ? "Chưa có dữ liệu"
                  : formatVND(Number(value)),
                String(name),
              ]}
            />
            <Bar
              dataKey="thu"
              name="Thu nhập"
              fill="#34D399"
              stroke="#10B981"
              strokeWidth={0.9}
              radius={[6, 6, 2, 2]}
              maxBarSize={18}
            />
            <Bar
              dataKey="chi"
              name="Chi tiêu"
              fill="#FB7185"
              stroke="#F43F5E"
              strokeWidth={0.9}
              radius={[6, 6, 2, 2]}
              maxBarSize={18}
            />
            <Line
              type="monotone"
              dataKey="dongTienRong"
              name="Còn lại"
              stroke="#3B82F6"
              strokeWidth={3.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              dot={{
                r: 4,
                fill: "#FFFFFF",
                stroke: "#3B82F6",
                strokeWidth: 2.25,
              }}
              activeDot={{
                r: 5.5,
                fill: "#3B82F6",
                stroke: "#FFFFFF",
                strokeWidth: 2.75,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
