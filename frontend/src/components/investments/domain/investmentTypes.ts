import type { Investment, InvestmentType } from "@/src/types/finance";

export type InvestmentFormState = {
  id?: string;
  name: string;
  type: InvestmentType;
  symbol: string;
  investedAmount: string;
  currentValue: string;
  purchaseDate: string;
  notes: string;
};

export type PerformanceFilter = "all" | "profit" | "break_even" | "loss";
export type PerformanceState = Exclude<PerformanceFilter, "all">;
export type HoldingTab = "largest" | "best" | "worst";
export type InvestmentTypeFilter = InvestmentType | "all";

export type InvestmentTypeConfig = {
  label: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  bg: string;
};

export type PortfolioSummary = {
  investedAmount: number;
  currentValue: number;
  profitLoss: number;
  returnPercent: number;
};

export type EnrichedInvestment = Investment & {
  pl: number;
  plPct: number;
  allocPct: number;
  performanceState: PerformanceState;
  status: "strong" | "stable" | "under";
};

export type InvestmentTypeBreakdown = InvestmentTypeConfig & {
  type: InvestmentType;
  count: number;
  invested: number;
  current: number;
  pl: number;
  plPct: number;
  allocPct: number;
};

export type PortfolioInsight = {
  tone: "good" | "info" | "warning";
  title: string;
  body: string;
};

export type HealthGrade = { label: string; color: string };

export type PortfolioHealthScores = {
  diversification: number;
  concentration: number;
  performance: number;
  overall: number;
  diversificationGrade: HealthGrade;
  concentrationGrade: HealthGrade;
  performanceGrade: HealthGrade;
  overallGrade: HealthGrade;
};
