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
import { usePrefersReducedMotion } from "@/src/lib/ui/usePrefersReducedMotion";

export type CashFlowChartPoint = {
  label: string;
  cashIn: number | null;
  cashOut: number | null;
  netCashMovement: number | null;
};

function isNonZeroNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function hasCashFlowActivity(point: CashFlowChartPoint) {
  return isNonZeroNumber(point.cashIn) || isNonZeroNumber(point.cashOut);
}

export function normalizeCashFlowPointForChart(
  point: CashFlowChartPoint,
): CashFlowChartPoint {
  if (hasCashFlowActivity(point)) return point;

  return {
    ...point,
    cashIn: null,
    cashOut: null,
    netCashMovement: null,
  };
}

type CashFlowNumericKey = "cashIn" | "cashOut" | "netCashMovement";

const GROSS_CASH_FLOW_KEYS = ["cashIn", "cashOut"] as const;
const NET_CASH_FLOW_KEYS = ["netCashMovement"] as const;

function getCashFlowValues(
  data: CashFlowChartPoint[],
  keys: readonly CashFlowNumericKey[],
) {
  return data.flatMap((point) =>
    keys.map((key) => point[key]).filter(
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

function getCashFlowScale(
  data: CashFlowChartPoint[],
  keys: readonly CashFlowNumericKey[],
  preferredIntervals = 5,
) {
  const values = getCashFlowValues(data, keys);

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
  const step = getNiceCashFlowStep((paddedMax - paddedMin) / preferredIntervals);
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
  keys: readonly CashFlowNumericKey[] = [
    "cashIn", "cashOut", "netCashMovement",
  ],
  preferredIntervals = 5,
): [number, number] {
  return getCashFlowScale(data, keys, preferredIntervals).domain;
}

export function getCashFlowTicks(
  data: CashFlowChartPoint[],
  keys: readonly CashFlowNumericKey[] = [
    "cashIn", "cashOut", "netCashMovement",
  ],
  preferredIntervals = 5,
) {
  return getCashFlowScale(data, keys, preferredIntervals).ticks;
}

export default function CashFlowChart({
  data,
}: {
  data: CashFlowChartPoint[];
}) {
  const chartData = data.map(normalizeCashFlowPointForChart);
  const activeMonthCount = chartData.filter(hasCashFlowActivity).length;
  const grossCashFlowDomain = getCashFlowDomain(chartData, GROSS_CASH_FLOW_KEYS);
  const grossCashFlowTicks = getCashFlowTicks(chartData, GROSS_CASH_FLOW_KEYS);
  const netCashFlowDomain = getCashFlowDomain(chartData, NET_CASH_FLOW_KEYS, 3);
  const netCashFlowTicks = getCashFlowTicks(chartData, NET_CASH_FLOW_KEYS, 3);
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div data-dashboard-chart-motion="cash-flow" className="mt-4 flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <p className="text-[11px] font-bold text-slate-600">
          {activeMonthCount}/12 tháng có dòng tiền
        </p>

        <div
          className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-semibold text-slate-600"
          aria-label="Chú thích biểu đồ dòng tiền"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#34D399]" />
            Thu vào
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#FB7185]" />
            Chi ra
          </span>
        </div>
      </div>

      {/* Gross operating cash flow has a zero-based scale, independent of signed net. */}
      <div data-dashboard-cash-flow-gross="true" className="min-h-44 flex-1 xl:min-h-[220px]">
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
              height={14}
              tick={false}
              axisLine={false}
              tickLine={false}
              interval={0}
              fontSize={11}
              fontWeight={600}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={46}
              fontSize={11}
              fontWeight={600}
              tick={{ fill: "#8AA0B5" }}
              tickFormatter={(value) => formatCompactVND(Number(value))}
              domain={grossCashFlowDomain}
              ticks={grossCashFlowTicks}
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
              dataKey="cashIn"
              name="Thu vào"
              fill="#34D399"
              stroke="#10B981"
              strokeWidth={0.9}
              radius={[6, 6, 2, 2]}
              maxBarSize={18}
              isAnimationActive={!prefersReducedMotion}
              animationBegin={0}
              animationDuration={520}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="cashOut"
              name="Chi ra"
              fill="#FB7185"
              stroke="#F43F5E"
              strokeWidth={0.9}
              radius={[6, 6, 2, 2]}
              maxBarSize={18}
              isAnimationActive={!prefersReducedMotion}
              animationBegin={70}
              animationDuration={520}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#31536F]">
          <span className="h-[3px] w-3.5 rounded-full bg-[#3B82F6]" />
          Dòng tiền ròng
        </p>
        <p className="text-[10px] font-semibold text-slate-500">
          Âm khi chi ra lớn hơn thu vào
        </p>
      </div>
      {/* The signed net trend keeps an independent axis and visible zero line. */}
      <div data-dashboard-cash-flow-net="true" className="h-32 shrink-0 sm:h-36 xl:h-40">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
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
              domain={netCashFlowDomain}
              ticks={netCashFlowTicks}
            />
            <Tooltip
              filterNull
              cursor={{ stroke: "#B9C9D8", strokeDasharray: "3 3" }}
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
            <Line
              type="monotone"
              dataKey="netCashMovement"
              name="Dòng tiền ròng"
              stroke="#3B82F6"
              strokeWidth={3.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              isAnimationActive={!prefersReducedMotion}
              animationBegin={120}
              animationDuration={650}
              animationEasing="ease-out"
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
