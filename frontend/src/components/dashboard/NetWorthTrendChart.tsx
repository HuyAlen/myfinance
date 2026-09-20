"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ReferenceDot,
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

type NetWorthDisplayPoint = NetWorthTrendPoint & {
  deltaFromPrevious: number | null;
};

type NetWorthTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: NetWorthDisplayPoint;
  }>;
};

function NetWorthTrendTooltip({ active, payload }: NetWorthTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || !point?.hasData || point.value === null) return null;

  return (
    <div className="min-w-44 rounded-xl border border-[#D8E6F1] bg-white/95 px-3 py-2.5 shadow-[0_16px_36px_-18px_rgba(38,86,126,0.32)]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#71879A]">
          Snapshot {point.label}
        </span>
        <span className="size-1.5 rounded-full bg-[#2F80ED]" />
      </div>
      <p className="mt-1 text-sm font-black tabular-nums text-[#294A66]">
        {formatVND(point.value)}
      </p>
      {point.deltaFromPrevious !== null ? (
        <p className="mt-1.5 text-[10px] font-semibold text-[#71879A]">
          So với snapshot trước{" "}
          <span
            className={
              point.deltaFromPrevious >= 0
                ? "font-black text-emerald-600"
                : "font-black text-rose-500"
            }
          >
            {point.deltaFromPrevious >= 0 ? "+" : ""}
            {formatVND(point.deltaFromPrevious)}
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[10px] font-semibold text-[#71879A]">
          Snapshot đầu tiên trong chuỗi
        </p>
      )}
    </div>
  );
}

function getDynamicYAxisDomain(points: NetWorthDisplayPoint[]): [number, number] {
  const values = points
    .filter((point) => point.hasData && point.value !== null)
    .map((point) => Number(point.value));

  if (values.length === 0) return [0, 1];

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const magnitude = Math.max(Math.abs(minValue), Math.abs(maxValue), 1);
  const visibleSpan = Math.max(maxValue - minValue, magnitude * 0.08, 100_000);
  const padding = visibleSpan * 0.24;
  const rawMin = minValue - padding;
  const rawMax = maxValue + padding;
  const roundingStep = Math.max(
    10_000,
    10 ** Math.floor(Math.log10(visibleSpan)) / 2,
  );

  let domainMin = Math.floor(rawMin / roundingStep) * roundingStep;
  let domainMax = Math.ceil(rawMax / roundingStep) * roundingStep;

  if (minValue >= 0 && domainMin < 0) domainMin = 0;
  if (maxValue <= 0 && domainMax > 0) domainMax = 0;

  if (domainMin === domainMax) {
    domainMin -= roundingStep;
    domainMax += roundingStep;
  }

  return [domainMin, domainMax];
}

export default function NetWorthTrendChart({
  trend,
}: {
  trend: NetWorthTrendPoint[];
}) {
  const display = useMemo(() => {
    let previousSnapshotValue: number | null = null;
    const trendWithDeltas: NetWorthDisplayPoint[] = trend.map((point) => {
      const hasSnapshot = point.hasData && point.value !== null;
      const deltaFromPrevious =
        hasSnapshot && previousSnapshotValue !== null
          ? Number(point.value) - previousSnapshotValue
          : null;

      if (hasSnapshot) previousSnapshotValue = Number(point.value);

      return { ...point, deltaFromPrevious };
    });

    const snapshotPoints = trendWithDeltas.filter(
      (point) => point.hasData && point.value !== null,
    );
    const latestPoint = snapshotPoints[snapshotPoints.length - 1] ?? null;

    return {
      trendWithDeltas,
      snapshotPoints,
      latestPoint,
    };
  }, [trend]);

  const { trendWithDeltas, snapshotPoints, latestPoint } = display;
  const yDomain = useMemo(
    () => getDynamicYAxisDomain(trendWithDeltas),
    [trendWithDeltas],
  );

  return (
    <div className="mt-3 h-44">
      <div
        data-dashboard-chart="full-year-timeline"
        className="flex min-h-6 items-center justify-between gap-2 px-1"
      >
        <p className="min-w-0 truncate text-[10px] font-bold text-[#71879A] sm:text-[11px]">
          {snapshotPoints.length}/12 tháng có snapshot
        </p>
        {latestPoint && latestPoint.value !== null ? (
          <div
            data-dashboard-chart="latest-value"
            className="inline-flex shrink-0 items-baseline gap-1.5 rounded-lg bg-[#EEF6FD] px-2 py-1 text-[10px] font-bold text-[#5C7388]"
          >
            <span>{latestPoint.label}</span>
            <span className="text-[11px] font-black tabular-nums text-[#2F80ED] sm:text-xs">
              {formatVND(latestPoint.value)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-1 h-[148px]">
        <ResponsiveContainer width="100%" height={148} minWidth={0}>
          <AreaChart
            data={trendWithDeltas}
            margin={{ top: 22, right: 18, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="dashboardNetWorth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.3} />
                <stop offset="55%" stopColor="#74B4F2" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#B9DBF8" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#E6EEF5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              fontSize={11}
              tick={{ fill: "#8AA0B5" }}
              tickMargin={8}
              interval={0}
              minTickGap={0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={46}
              fontSize={10}
              tick={{ fill: "#8AA0B5" }}
              tickCount={4}
              domain={yDomain}
              tickFormatter={(value) => formatCompactVND(Number(value))}
            />
            <Tooltip
              cursor={{
                stroke: "#A9CBEA",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              content={<NetWorthTrendTooltip />}
              wrapperStyle={{ outline: "none" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              connectNulls={false}
              stroke="#60A5FA"
              strokeWidth={3.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#dashboardNetWorth)"
              dot={{
                r: 4,
                strokeWidth: 2.5,
                fill: "#FFFFFF",
                stroke: "#60A5FA",
              }}
              activeDot={{
                r: 5.5,
                strokeWidth: 3,
                fill: "#FFFFFF",
                stroke: "#2F80ED",
              }}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={9}
                fill="#41627C"
                fontSize={11}
                fontWeight={800}
                formatter={(value) =>
                  value == null ? "" : formatCompactVND(Number(value))
                }
              />
            </Area>
            {latestPoint && latestPoint.value !== null ? (
              <ReferenceDot
                x={latestPoint.label}
                y={latestPoint.value}
                r={5.5}
                fill="#2F80ED"
                stroke="#FFFFFF"
                strokeWidth={3}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
