import type { AIFinanceContextDomain } from "./aiContextTypes";

export type AIFinanceCapability =
  | "financial_overview"
  | "wallet_list"
  | "wallet_balance_lookup"
  | "wallet_ranking"
  | "wallet_low_balance"
  | "transaction_search"
  | "transaction_ranking"
  | "category_spending"
  | "merchant_spending"
  | "budget_status"
  | "budget_risk"
  | "income_analysis"
  | "cashflow_analysis"
  | "goal_progress"
  | "saving_summary"
  | "debt_summary"
  | "investment_summary"
  | "period_comparison"
  | "financial_health"
  | "financial_forecast"
  | "scenario_analysis"
  | "write_action"
  | "general_finance_knowledge";

export type AIFinanceAnalysisOperation =
  | "list"
  | "filter"
  | "aggregate"
  | "sort_ascending"
  | "sort_descending"
  | "select_minimum"
  | "select_maximum"
  | "rank"
  | "compare_periods"
  | "calculate_progress"
  | "detect_threshold_risk"
  | "forecast"
  | "simulate";

export type AIFinanceCapabilityDefinition = {
  capability: AIFinanceCapability;
  domains: AIFinanceContextDomain[];
  preferredTools: string[];
  requiredData: string[];
  operations: AIFinanceAnalysisOperation[];
};

export const AI_FINANCE_CAPABILITY_DEFINITIONS: Record<
  AIFinanceCapability,
  AIFinanceCapabilityDefinition
> = {
  financial_overview: {
    capability: "financial_overview",
    domains: ["overview", "wallets", "debts", "investments", "cashflow"],
    preferredTools: ["get_financial_summary"],
    requiredData: ["assets", "debts", "income", "expenses", "cashFlow"],
    operations: ["aggregate"],
  },
  wallet_list: {
    capability: "wallet_list",
    domains: ["wallets"],
    preferredTools: ["get_wallets"],
    requiredData: ["wallet.id", "wallet.name", "wallet.type", "wallet.balance"],
    operations: ["list"],
  },
  wallet_balance_lookup: {
    capability: "wallet_balance_lookup",
    domains: ["wallets"],
    preferredTools: ["get_wallets"],
    requiredData: ["wallet.id", "wallet.name", "wallet.balance"],
    operations: ["filter"],
  },
  wallet_ranking: {
    capability: "wallet_ranking",
    domains: ["wallets"],
    preferredTools: ["get_wallets"],
    requiredData: ["wallet.name", "wallet.balance"],
    operations: ["rank", "sort_descending", "select_maximum"],
  },
  wallet_low_balance: {
    capability: "wallet_low_balance",
    domains: ["wallets"],
    preferredTools: ["get_wallets"],
    requiredData: ["wallet.name", "wallet.balance"],
    operations: ["sort_ascending", "select_minimum", "detect_threshold_risk"],
  },
  transaction_search: {
    capability: "transaction_search",
    domains: ["transactions"],
    preferredTools: ["search_transactions"],
    requiredData: [
      "transaction.date",
      "transaction.amount",
      "transaction.type",
    ],
    operations: ["filter", "aggregate"],
  },
  transaction_ranking: {
    capability: "transaction_ranking",
    domains: ["transactions"],
    preferredTools: ["search_transactions"],
    requiredData: [
      "transaction.amount",
      "transaction.date",
      "transaction.note",
    ],
    operations: ["rank", "sort_descending"],
  },
  category_spending: {
    capability: "category_spending",
    domains: ["transactions"],
    preferredTools: ["search_transactions"],
    requiredData: [
      "transaction.category",
      "transaction.amount",
      "transaction.type",
    ],
    operations: ["aggregate", "rank", "sort_descending"],
  },
  merchant_spending: {
    capability: "merchant_spending",
    domains: ["transactions"],
    preferredTools: ["search_transactions"],
    requiredData: [
      "transaction.note",
      "transaction.amount",
      "transaction.type",
    ],
    operations: ["filter", "aggregate"],
  },
  budget_status: {
    capability: "budget_status",
    domains: ["budgets", "transactions"],
    preferredTools: ["get_budget_status"],
    requiredData: ["budget.limit", "budget.spent", "budget.remaining"],
    operations: ["list", "calculate_progress"],
  },
  budget_risk: {
    capability: "budget_risk",
    domains: ["budgets", "transactions"],
    preferredTools: ["get_budget_status"],
    requiredData: ["budget.usagePercent", "budget.remaining", "budget.status"],
    operations: ["rank", "detect_threshold_risk"],
  },
  income_analysis: {
    capability: "income_analysis",
    domains: ["transactions", "cashflow"],
    preferredTools: ["search_transactions", "get_financial_summary"],
    requiredData: ["income.amount", "income.date", "income.source"],
    operations: ["filter", "aggregate"],
  },
  cashflow_analysis: {
    capability: "cashflow_analysis",
    domains: ["cashflow", "transactions", "overview"],
    preferredTools: ["get_financial_summary", "search_transactions"],
    requiredData: ["income", "expenses", "cashFlow"],
    operations: ["aggregate", "detect_threshold_risk"],
  },
  goal_progress: {
    capability: "goal_progress",
    domains: ["goals"],
    preferredTools: ["get_goals"],
    requiredData: ["goal.name", "goal.targetAmount", "goal.currentAmount"],
    operations: ["calculate_progress", "rank"],
  },
  saving_summary: {
    capability: "saving_summary",
    domains: ["goals", "overview"],
    preferredTools: ["get_goals", "get_financial_summary"],
    requiredData: ["savingRate", "goal.currentAmount", "goal.targetAmount"],
    operations: ["aggregate", "calculate_progress"],
  },
  debt_summary: {
    capability: "debt_summary",
    domains: ["debts"],
    preferredTools: ["get_financial_summary"],
    requiredData: ["debt.remainingAmount", "totalDebt"],
    operations: ["aggregate", "rank"],
  },
  investment_summary: {
    capability: "investment_summary",
    domains: ["investments"],
    preferredTools: ["get_financial_summary"],
    requiredData: ["investment.currentValue", "investment.costBasis"],
    operations: ["aggregate", "rank"],
  },
  period_comparison: {
    capability: "period_comparison",
    domains: ["transactions", "cashflow"],
    preferredTools: ["search_transactions"],
    requiredData: ["period.current", "period.previous"],
    operations: ["compare_periods", "aggregate"],
  },
  financial_health: {
    capability: "financial_health",
    domains: ["health", "overview", "wallets", "debts", "cashflow"],
    preferredTools: ["get_financial_health"],
    requiredData: ["savingRate", "debtRatio", "emergencyMonths", "cashFlow"],
    operations: ["detect_threshold_risk"],
  },
  financial_forecast: {
    capability: "financial_forecast",
    domains: ["cashflow", "transactions", "wallets"],
    preferredTools: [
      "get_financial_summary",
      "search_transactions",
      "get_wallets",
    ],
    requiredData: ["currentBalance", "incomeTrend", "expenseTrend"],
    operations: ["forecast"],
  },
  scenario_analysis: {
    capability: "scenario_analysis",
    domains: ["overview", "wallets", "debts", "goals", "cashflow"],
    preferredTools: ["get_financial_summary", "get_wallets", "get_goals"],
    requiredData: ["currentPosition", "scenarioInputs"],
    operations: ["simulate"],
  },
  write_action: {
    capability: "write_action",
    domains: ["overview"],
    preferredTools: [],
    requiredData: ["targetEntity", "requestedChanges"],
    operations: [],
  },
  general_finance_knowledge: {
    capability: "general_finance_knowledge",
    domains: ["overview"],
    preferredTools: [],
    requiredData: [],
    operations: [],
  },
};
