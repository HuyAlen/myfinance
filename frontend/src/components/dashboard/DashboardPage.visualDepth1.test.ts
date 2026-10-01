import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8");

const dashboard = read("src/components/dashboard/DashboardPage.tsx");
const netWorthChart = read("src/components/dashboard/NetWorthTrendChart.tsx");
const cashFlowChart = read("src/components/dashboard/CashFlowChart.tsx");
const css = read("app/globals.css");
const reducedMotionHook = read("src/lib/ui/usePrefersReducedMotion.ts");

describe("DASHBOARD-VISUAL-DEPTH-1", () => {
  it("adds dashboard-only ambient depth without changing finance semantics", () => {
    expect(dashboard).toContain('data-dashboard-depth="true"');
    expect(css).toContain("DASHBOARD-VISUAL-DEPTH-1: restrained premium depth and motion");
    expect(css).toContain("radial-gradient(circle at 12% 10%");
    expect(css).toContain("radial-gradient(circle at 88% 24%");
    expect(css).toContain(':root[data-theme="dark"] .dashboard-depth-root::before');
  });

  it("uses restrained top sheen and fine-pointer lift on major cards", () => {
    expect(dashboard).toContain('data-dashboard-depth-card="hero"');
    expect(dashboard).toContain('data-dashboard-depth-card="panel"');
    expect(dashboard).toContain('data-dashboard-depth-card="kpi"');
    expect(css).toContain("[data-dashboard-depth-card]::after");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain("transform: translateY(-2px)");
  });

  it("animates number presence without replacing canonical formatted values", () => {
    expect(dashboard).toContain('data-dashboard-number="hero-net-worth"');
    expect(dashboard).toContain('data-dashboard-number="kpi"');
    expect(dashboard).toContain('data-dashboard-number="mini-stat"');
    expect(dashboard).toContain("{formatVND(summary.netWorth)}");
    expect(css).toContain("@keyframes dashboard-number-settle");
    expect(css).toContain("animation: dashboard-number-settle 420ms");
  });

  it("gives both Recharts surfaces explicit restrained entry animation", () => {
    expect(netWorthChart).toContain('data-dashboard-chart-motion="net-worth"');
    expect(cashFlowChart).toContain('data-dashboard-chart-motion="cash-flow"');
    expect(netWorthChart).toContain("animationDuration={620}");
    expect(cashFlowChart).toContain("animationDuration={650}");
    expect(netWorthChart).toContain("isAnimationActive={!prefersReducedMotion}");
    expect(cashFlowChart).toContain("isAnimationActive={!prefersReducedMotion}");
  });

  it("adds scroll reveal only when the browser supports view timelines", () => {
    expect(dashboard).toContain('data-dashboard-reveal="true"');
    expect(css).toContain("@supports (animation-timeline: view())");
    expect(css).toContain("animation-timeline: view()");
    expect(css).toContain("animation-range: entry 0% cover 18%");
  });

  it("uses one-shot progress sheen instead of continuous shimmer", () => {
    expect(css).toContain("@keyframes dashboard-progress-sheen");
    expect(css).toContain("880ms ease-out 220ms 1 both");
    expect(css).not.toContain("dashboard-progress-sheen 880ms ease-out 220ms infinite");
  });

  it("honors OS reduced-motion in both CSS and chart runtime", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(reducedMotionHook).toContain("(prefers-reduced-motion: reduce)");
    expect(reducedMotionHook).toContain('media.addEventListener("change", sync)');
    expect(reducedMotionHook).toContain('media.removeEventListener("change", sync)');
  });
});
