# MYFINANCE Dashboard Professional Polish P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a compact, professional, chart-first MyFinance Dashboard with responsive visual balance and unmodified finance semantics.

**Architecture:** Continue from chart-first P1 feature head. Enhance only DashboardVisualOverview and CashFlowChart; use an AppShell route data attribute and CSS for dashboard-only seasonal quieting. Do not change finance data loaders or storage.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript, Tailwind v4, Recharts 3.8.1, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-23-dashboard-professional-polish-p1-design.md`

## Global Constraints
- Preserve canonical real-expense, operating cash flow, budget calculation, snapshot semantics.
- Scope seasonal adjustments to dashboard-only; no global behavior changes.
- Keep mobile viewport scroll, Vietnamese UI and screen reader semantics.
- No new dependencies.

## Review Focus
1. Long names: do not push amounts off the right edge at iPhone width — test truncated label classes and min-width.
2. Over-budget >100%: the text stays truthful, visual fill capped, overage still visible — test helper.
3. Negative wallet balances: keep excluded balance disclosed, positive liquidity totals truthful — test helper.
4. Loading period/empty state: not imply a legitimate zero before readiness — test all gates.
5. Route decoration: other pages retain their existing skin — test CSS route selector and shell attribute.

### Task 1: Red visual-contract tests and helper tests
**Files:** `frontend/src/components/dashboard/DashboardPage.professionalChartPolishP1.contract.test.ts`; existing overview.
**Interfaces:** Budget visual rows, expense grouping, wallet visual rows remain exported.
- [ ] Add tests for true percentage, sum-preserving expense grouping, wallet percentage denominator and no overflowing mobile row.
- [ ] Run targeted Vitest (expect failure for new contracts).
- [ ] Commit tests.

### Task 2: Polish chart-first cards
**Files:** `frontend/src/components/dashboard/DashboardVisualOverview.tsx`.
**Interfaces:** Props unchanged. Consume same canonical helpers and existing ready flags.
- [ ] Compact chart-shell headers; adjust donut radius/centering; add observed largest-spend insight.
- [ ] Improve budget progress with tranquil tracks/over-budget indicators; show exact values; wallet liquidity shares from total positives.
- [ ] Add safe responsive/wrapping/truncation and accessible semantic labels.
- [ ] Run targeted tests, commit.

### Task 3: Polish cash-flow chart
**Files:** `frontend/src/components/dashboard/CashFlowChart.tsx`.
**Interfaces:** `CashFlowChartPoint[]` unchanged.
- [ ] Make top legend compact and grid less noisy; retain positive/negative and all actual data and tooltip.
- [ ] Verify existing `CashFlowChart.polish.test.ts`; commit.

### Task 4: Scoped premium surface / seasonal quiet
**Files:** `frontend/src/components/layout/AppShell.tsx`, `frontend/app/seasonal-skins.css` or new `frontend/app/dashboard-professional-polish.css`, `frontend/app/layout.tsx`.
**Interfaces:** route scope `data-finance-route="dashboard"` attached to finance-shell on pathname "/".
- [ ] Test seasonal scope and global route unchanged.
- [ ] Add route marker and design CSS; preserve dark-mode and reduced-motion.
- [ ] Test and commit.

### Task 5: Review and QA
- [ ] Run feature contract and UI/seasonal tests.
- [ ] Run TypeScript, ESLint, full Vitest, production build (via CI when local deps unavailable).
- [ ] Create PR targeting main without merging. Provide local pull + QA script.
