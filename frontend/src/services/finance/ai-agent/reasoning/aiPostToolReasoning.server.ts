import type {
  AIFinanceAnalysisOperation,
  AIFinanceCapability,
} from "../context/aiFinanceCapabilities";
import type { AIFinancePlanStepResult } from "../planner/aiPlanTypes";
import { normalizeAIFinanceStepResults } from "./aiResultNormalizer.server";
import type {
  AIFinancePostToolReasoning,
  AIFinanceReasoningEvidence,
  AIFinanceReasoningFinding,
} from "./aiReasoningTypes";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOf(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function evidence(
  stepId: string,
  toolName: string,
  label: string,
  value?: string | number | boolean | null,
  unit?: string,
): AIFinanceReasoningEvidence {
  return { stepId, toolName, label, value, unit };
}

function walletFindings(input: {
  stepId: string;
  toolName: string;
  data: Record<string, unknown>;
  capabilities: AIFinanceCapability[];
}): AIFinanceReasoningFinding[] {
  const wallets = Array.isArray(input.data.wallets)
    ? input.data.wallets.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];

  if (wallets.length === 0) return [];

  const sorted = wallets
    .map((wallet) => ({
      name: stringOf(wallet.name) || "Ví không tên",
      balance: numberOf(wallet.balance),
      currency: stringOf(wallet.currency) || "VND",
      type: stringOf(wallet.type),
    }))
    .sort((a, b) => b.balance - a.balance);

  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const total = sorted.reduce((sum, wallet) => sum + wallet.balance, 0);
  const findings: AIFinanceReasoningFinding[] = [];

  if (input.capabilities.includes("wallet_list")) {
    findings.push({
      code: "wallet_list",
      title: "Chi tiết các ví",
      summary: sorted
        .map((wallet) => `${wallet.name}: ${wallet.balance} ${wallet.currency}`)
        .join("; "),
      severity: "info",
      evidence: sorted.map((wallet) =>
        evidence(
          input.stepId,
          input.toolName,
          wallet.name,
          wallet.balance,
          wallet.currency,
        ),
      ),
    });
  }

  if (input.capabilities.includes("wallet_ranking")) {
    findings.push({
      code: "wallet_highest_balance",
      title: "Ví có số dư cao nhất",
      summary: `${highest.name} đang có số dư cao nhất.`,
      severity: "positive",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          highest.name,
          highest.balance,
          highest.currency,
        ),
      ],
    });
  }

  if (input.capabilities.includes("wallet_low_balance")) {
    const ratio = total > 0 ? lowest.balance / total : 0;
    findings.push({
      code: "wallet_lowest_balance",
      title: "Ví có số dư thấp nhất",
      summary: `${lowest.name} đang có số dư thấp nhất${ratio <= 0.05 ? " và chiếm không quá 5% tổng số dư ví" : ""}.`,
      severity: lowest.balance <= 0 || ratio <= 0.05 ? "warning" : "info",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          lowest.name,
          lowest.balance,
          lowest.currency,
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Tổng số dư ví",
          total,
          lowest.currency,
        ),
      ],
    });
  }

  return findings;
}

function transactionFindings(input: {
  stepId: string;
  toolName: string;
  data: Record<string, unknown>;
  capabilities: AIFinanceCapability[];
}): AIFinanceReasoningFinding[] {
  const findings: AIFinanceReasoningFinding[] = [];
  const transactions = Array.isArray(input.data.transactions)
    ? input.data.transactions.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];

  if (
    input.capabilities.includes("transaction_ranking") &&
    transactions.length > 0
  ) {
    const largest = [...transactions].sort(
      (a, b) => numberOf(b.amount) - numberOf(a.amount),
    )[0];
    findings.push({
      code: "largest_transaction",
      title: "Giao dịch lớn nhất",
      summary: "Đây là giao dịch có giá trị lớn nhất trong kết quả tìm kiếm.",
      severity: "info",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          stringOf(largest.note) || stringOf(largest.category) || "Giao dịch",
          numberOf(largest.amount),
          "VND",
        ),
      ],
    });
  }

  const byCategory = Array.isArray(input.data.byCategory)
    ? input.data.byCategory.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];

  if (
    input.capabilities.includes("category_spending") &&
    byCategory.length > 0
  ) {
    const top = [...byCategory].sort(
      (a, b) => numberOf(b.expense) - numberOf(a.expense),
    )[0];
    findings.push({
      code: "top_spending_category",
      title: "Danh mục chi nhiều nhất",
      summary: `${stringOf(top.categoryName) || "Danh mục chưa xác định"} có tổng chi cao nhất.`,
      severity: "info",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          stringOf(top.categoryName) || "Danh mục",
          numberOf(top.expense),
          "VND",
        ),
      ],
    });
  }

  if (
    input.capabilities.includes("transaction_search") ||
    input.capabilities.includes("merchant_spending") ||
    input.capabilities.includes("income_analysis")
  ) {
    findings.push({
      code: "transaction_summary",
      title: "Tổng hợp giao dịch",
      summary: `Tìm thấy ${numberOf(input.data.count)} giao dịch phù hợp.`,
      severity: "info",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          "Số giao dịch",
          numberOf(input.data.count),
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Tổng thu",
          numberOf(input.data.totalIncome),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Tổng chi",
          numberOf(input.data.totalExpense),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Dòng tiền ròng",
          numberOf(input.data.netAmount),
          "VND",
        ),
      ],
    });
  }

  return findings;
}

function budgetFindings(input: {
  stepId: string;
  toolName: string;
  data: Record<string, unknown>;
}): AIFinanceReasoningFinding[] {
  const budgets = Array.isArray(input.data.budgets)
    ? input.data.budgets.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  if (budgets.length === 0) return [];

  const sorted = [...budgets].sort(
    (a, b) => numberOf(b.usagePercent) - numberOf(a.usagePercent),
  );
  const riskiest = sorted[0];
  const status = stringOf(riskiest.status);

  return [
    {
      code: "budget_risk",
      title: "Ngân sách cần chú ý nhất",
      summary: `${stringOf(riskiest.categoryName) || "Danh mục"} đang sử dụng ${numberOf(riskiest.usagePercent)}% ngân sách.`,
      severity:
        status === "over"
          ? "critical"
          : status === "near"
            ? "warning"
            : "positive",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          "Tỷ lệ sử dụng",
          numberOf(riskiest.usagePercent),
          "%",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Còn lại",
          numberOf(riskiest.remaining),
          "VND",
        ),
      ],
    },
  ];
}

function goalFindings(input: {
  stepId: string;
  toolName: string;
  data: unknown;
}): AIFinanceReasoningFinding[] {
  const goals = Array.isArray(input.data)
    ? input.data.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  if (goals.length === 0) return [];

  const slowest = [...goals].sort(
    (a, b) => numberOf(a.progressPercent) - numberOf(b.progressPercent),
  )[0];

  return [
    {
      code: "slowest_goal",
      title: "Mục tiêu tiến độ thấp nhất",
      summary: `${stringOf(slowest.name) || "Mục tiêu"} đang có tiến độ thấp nhất.`,
      severity: numberOf(slowest.progressPercent) < 25 ? "warning" : "info",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          "Tiến độ",
          numberOf(slowest.progressPercent),
          "%",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Còn thiếu",
          numberOf(slowest.remaining),
          "VND",
        ),
      ],
    },
  ];
}

function summaryFindings(input: {
  stepId: string;
  toolName: string;
  data: Record<string, unknown>;
}): AIFinanceReasoningFinding[] {
  return [
    {
      code: "financial_summary",
      title: "Tổng quan tài chính",
      summary:
        numberOf(input.data.cashFlow) >= 0
          ? "Dòng tiền hiện tại đang dương."
          : "Dòng tiền hiện tại đang âm.",
      severity: numberOf(input.data.cashFlow) >= 0 ? "positive" : "warning",
      evidence: [
        evidence(
          input.stepId,
          input.toolName,
          "Tài sản ròng",
          numberOf(input.data.netWorth),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Thu nhập",
          numberOf(input.data.income),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Chi tiêu",
          numberOf(input.data.expense),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Dòng tiền",
          numberOf(input.data.cashFlow),
          "VND",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Tỷ lệ tiết kiệm",
          numberOf(input.data.savingRate),
          "%",
        ),
      ],
    },
  ];
}

function healthFindings(input: {
  stepId: string;
  toolName: string;
  data: Record<string, unknown>;
}): AIFinanceReasoningFinding[] {
  const indicators = asRecord(input.data.indicators) ?? {};
  const score = numberOf(input.data.score);
  return [
    {
      code: "financial_health",
      title: "Sức khỏe tài chính",
      summary: `Điểm sức khỏe tài chính hiện tại là ${score}/100.`,
      severity: score >= 80 ? "positive" : score >= 50 ? "warning" : "critical",
      evidence: [
        evidence(input.stepId, input.toolName, "Điểm", score, "/100"),
        evidence(
          input.stepId,
          input.toolName,
          "Tỷ lệ tiết kiệm",
          numberOf(indicators.savingRate),
          "%",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Tỷ lệ nợ",
          numberOf(indicators.debtRatioPercent),
          "%",
        ),
        evidence(
          input.stepId,
          input.toolName,
          "Quỹ dự phòng",
          numberOf(indicators.emergencyMonths),
          "tháng",
        ),
      ],
    },
  ];
}

export function runAIFinancePostToolReasoning(input: {
  steps: AIFinancePlanStepResult[];
  capabilities?: AIFinanceCapability[];
  operations?: AIFinanceAnalysisOperation[];
}): AIFinancePostToolReasoning {
  const capabilities = input.capabilities ?? [];
  const operations = input.operations ?? [];
  const normalizedResults = normalizeAIFinanceStepResults(input.steps);
  const findings: AIFinanceReasoningFinding[] = [];

  for (const result of normalizedResults) {
    if (result.status !== "success") continue;
    const dataRecord = asRecord(result.data);

    if (result.toolName === "get_wallets" && dataRecord) {
      findings.push(
        ...walletFindings({ ...result, data: dataRecord, capabilities }),
      );
    } else if (result.toolName === "search_transactions" && dataRecord) {
      findings.push(
        ...transactionFindings({ ...result, data: dataRecord, capabilities }),
      );
    } else if (result.toolName === "get_budget_status" && dataRecord) {
      findings.push(...budgetFindings({ ...result, data: dataRecord }));
    } else if (result.toolName === "get_goals") {
      findings.push(...goalFindings({ ...result }));
    } else if (result.toolName === "get_financial_summary" && dataRecord) {
      findings.push(...summaryFindings({ ...result, data: dataRecord }));
    } else if (result.toolName === "get_financial_health" && dataRecord) {
      findings.push(...healthFindings({ ...result, data: dataRecord }));
    }
  }

  const successfulSteps = normalizedResults.filter(
    (item) => item.status === "success",
  ).length;
  const failedSteps = normalizedResults.filter(
    (item) => item.status === "failed" || item.status === "skipped",
  ).length;
  const emptySteps = normalizedResults.filter(
    (item) => item.status === "empty",
  ).length;
  const confirmationRequired = normalizedResults.some(
    (item) => item.status === "confirmation_required",
  );

  const status: AIFinancePostToolReasoning["status"] =
    successfulSteps > 0 && failedSteps > 0
      ? "partial"
      : successfulSteps > 0 || confirmationRequired
        ? "success"
        : emptySteps > 0 && failedSteps === 0
          ? "empty"
          : "failed";

  return {
    status,
    capabilities,
    operations,
    findings,
    normalizedResults,
    successfulSteps,
    failedSteps,
    emptySteps,
    confirmationRequired,
  };
}
