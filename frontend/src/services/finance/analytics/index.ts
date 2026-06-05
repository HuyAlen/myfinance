/**
 * analytics/index.ts
 *
 * Public barrel for the financial analytics engine.
 * Import everything the UI or other services need from this single entry point.
 *
 * @example
 * import { runAdvisor, type AdvisorResult } from "@/src/services/finance/analytics";
 */

// Shared insight types (used by individual modules and orchestrator)
export type { InsightData, InsightIconType, InsightTone } from "./types";

// Shared math utilities (exported for unit-test use)
export {
  confidenceLevel,
  groupByMonth,
  lastNMonths,
  linearRegression,
  mean,
  stddev,
} from "./shared";

// Individual analytics modules
export {
  detectSpendingAnomalies,
  type SpendingAnomaly,
} from "./spendingAnalytics";

export {
  computeMonthlyForecast,
  type MonthlyForecast,
} from "./forecastAnalytics";

export { predictGoalAchievement, type GoalPrediction } from "./goalAnalytics";

export {
  computeRiskScore,
  type RiskDimension,
  type RiskFactor,
  type RiskLevel,
  type RiskScore,
} from "./riskAnalytics";

export {
  computeHealthScoreV2,
  type HealthScoreFactor,
  type HealthScoreV2,
} from "./healthScore";

export {
  computeEmergencyFund,
  type EmergencyFundAnalysis,
  type EmergencyFundStatus,
} from "./emergencyFund";

export {
  computeFireAnalysis,
  type FireAnalysis,
  type FireMilestone,
  type FireStatus,
} from "./fireCalculator";

export {
  computeSmartBudget,
  type AllocationBucket,
  type BudgetStatus,
  type BudgetViolation,
  type CategoryBudgetAnalysis,
  type RecommendedBudget,
  type SmartBudgetAnalysis,
  type SpendingTrend,
} from "./smartBudget";

export {
  computeFinancialForecast,
  type FinancialForecast,
  type ForecastScenario,
  type ForecastScenarioKey,
} from "./forecastEngine";

// Orchestrator — primary public API
export {
  runAdvisor,
  type AdvisorInput,
  type AdvisorMetrics,
  type AdvisorResult,
  type SpendingCategoryBreakdown,
} from "./aiAdvisorEngine";
