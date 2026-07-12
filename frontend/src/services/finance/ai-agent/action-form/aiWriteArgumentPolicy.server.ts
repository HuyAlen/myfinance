import type { AIPendingActionContinuationDirective } from "../pending-action/aiPendingActionContinuationTypes";
import type { AIFinanceExecutionPlan } from "../planner/aiPlanTypes";

export type AIWriteArgumentPolicyDecision = {
  toolName: string;
  keptFields: string[];
  removedFields: string[];
  reasonByField: Record<string, string>;
};

type PlanningContextEnvelope = {
  planningContext?: {
    snapshot?: {
      entityResolution?: {
        bestByKind?: {
          category?: {
            id?: string;
            name?: string;
            confidence?: "high" | "medium" | "low";
          };
          goal?: {
            id?: string;
            name?: string;
            confidence?: "high" | "medium" | "low";
          };
        };
      };
      semanticResolution?: {
        best?: {
          categoryId?: string;
          categoryName?: string;
          matchedPhrase?: string;
          confidence?: "high" | "medium" | "low";
        };
      };
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlanningContext(value?: string): PlanningContextEnvelope {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? (parsed as PlanningContextEnvelope) : {};
  } catch {
    return {};
  }
}

function hasExplicitAmount(question: string) {
  const text = normalize(question);

  return (
    /\b\d[\d.,]*\s*(?:vnd|d|dong|k|nghin|ngan|trieu|million|m|ty|billion|b)\b/.test(
      text,
    ) ||
    /\b(?:vnd|d|dong)\s*\d[\d.,]*\b/.test(text) ||
    /\b\d{4,}\b/.test(text)
  );
}

function hasExplicitMonth(question: string) {
  const text = normalize(question);

  return (
    /\b20\d{2}[-/]?(?:0?[1-9]|1[0-2])\b/.test(text) ||
    /\b(?:0?[1-9]|1[0-2])[-/]20\d{2}\b/.test(text) ||
    /\bthang\s+(?:0?[1-9]|1[0-2])(?:\s+nam\s+20\d{2})?\b/.test(text) ||
    /\b(?:thang nay|thang sau|thang truoc|this month|next month|last month)\b/.test(
      text,
    )
  );
}

function hasExplicitQuotedText(question: string) {
  return /["“”']([^"“”']{2,120})["“”']/.test(question);
}

function textContainsEntity(question: string, entityName?: string) {
  if (!entityName) return false;

  const normalizedQuestion = normalize(question);
  const normalizedEntity = normalize(entityName);

  return Boolean(
    normalizedEntity && normalizedQuestion.includes(normalizedEntity),
  );
}

function hasExplicitCategory(
  question: string,
  envelope: PlanningContextEnvelope,
) {
  const category =
    envelope.planningContext?.snapshot?.entityResolution?.bestByKind?.category;
  const semantic = envelope.planningContext?.snapshot?.semanticResolution?.best;

  if (
    category &&
    category.confidence !== "low" &&
    textContainsEntity(question, category.name)
  ) {
    return true;
  }

  if (
    semantic &&
    semantic.confidence !== "low" &&
    (textContainsEntity(question, semantic.categoryName) ||
      textContainsEntity(question, semantic.matchedPhrase))
  ) {
    return true;
  }

  return false;
}

function hasExplicitGoalName(question: string) {
  if (hasExplicitQuotedText(question)) return true;

  const text = normalize(question);
  const match = text.match(/\b(?:muc tieu|goal)\s+(.+)$/);

  if (!match) return false;

  const candidate = match[1]
    .replace(/\b(?:tai chinh|moi|new|financial)\b/g, " ")
    .replace(
      /\b\d[\d.,]*\s*(?:vnd|d|dong|k|nghin|ngan|trieu|million|m|ty|billion|b)?\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return candidate.length >= 2;
}

function hasExplicitBudgetSelection(question: string) {
  const text = normalize(question);

  return (
    /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(question) ||
    hasExplicitMonth(question) ||
    /\b(?:ngan sach|budget)\s+["“”']/.test(question) ||
    /\b(?:cho|cua)\s+.+\b/.test(text)
  );
}

function trustedContinuationFields(
  continuation?: AIPendingActionContinuationDirective,
) {
  return new Set(Object.keys(continuation?.existingArguments ?? {}));
}

function allowField(input: {
  toolName: string;
  field: string;
  question: string;
  envelope: PlanningContextEnvelope;
  continuation?: AIPendingActionContinuationDirective;
}) {
  const trustedFields = trustedContinuationFields(input.continuation);

  if (trustedFields.has(input.field)) {
    return {
      allowed: true,
      reason: "Preserved from the existing pending action.",
    };
  }

  switch (input.toolName) {
    case "create_budget":
      if (input.field === "categoryId") {
        return {
          allowed: hasExplicitCategory(input.question, input.envelope),
          reason:
            "categoryId requires an explicitly mentioned, high-confidence category.",
        };
      }
      if (input.field === "month") {
        return {
          allowed: hasExplicitMonth(input.question),
          reason: "month requires an explicit date or natural month phrase.",
        };
      }
      if (input.field === "limitAmount") {
        return {
          allowed: hasExplicitAmount(input.question),
          reason:
            "limitAmount requires an explicit amount in the user message.",
        };
      }
      return {
        allowed: false,
        reason:
          "Field is not supported by the safe create_budget prefill policy.",
      };

    case "update_budget":
      if (input.field === "budgetId") {
        return {
          allowed: hasExplicitBudgetSelection(input.question),
          reason:
            "budgetId requires an explicitly identified budget, category, or period.",
        };
      }
      if (input.field === "limitAmount") {
        return {
          allowed: hasExplicitAmount(input.question),
          reason:
            "limitAmount requires an explicit amount in the user message.",
        };
      }
      return {
        allowed: false,
        reason:
          "Field is not supported by the safe update_budget prefill policy.",
      };

    case "create_goal":
      if (input.field === "name") {
        return {
          allowed: hasExplicitGoalName(input.question),
          reason: "name requires an explicitly stated or quoted goal name.",
        };
      }
      if (input.field === "targetAmount") {
        return {
          allowed: hasExplicitAmount(input.question),
          reason:
            "targetAmount requires an explicit amount in the user message.",
        };
      }
      if (input.field === "currentAmount") {
        return {
          allowed:
            hasExplicitAmount(input.question) &&
            /\b(?:hien co|da co|current|already saved|bat dau voi)\b/.test(
              normalize(input.question),
            ),
          reason:
            "currentAmount requires an explicit current/start amount phrase.",
        };
      }
      return {
        allowed: false,
        reason:
          "Field is not supported by the safe create_goal prefill policy.",
      };

    default:
      return {
        allowed: false,
        reason: "No safe write prefill policy is registered for this tool.",
      };
  }
}

export function applySafeWriteArgumentPolicy(input: {
  question: string;
  planningContext?: string;
  plan: AIFinanceExecutionPlan;
  continuation?: AIPendingActionContinuationDirective;
}) {
  const envelope = parsePlanningContext(input.planningContext);
  const decisions: AIWriteArgumentPolicyDecision[] = [];

  const steps = input.plan.steps.map((step) => {
    if (step.mode !== "write") return step;

    const nextArguments: Record<string, unknown> = {};
    const keptFields: string[] = [];
    const removedFields: string[] = [];
    const reasonByField: Record<string, string> = {};

    for (const [field, value] of Object.entries(step.arguments)) {
      const decision = allowField({
        toolName: step.toolName,
        field,
        question: input.question,
        envelope,
        continuation: input.continuation,
      });

      reasonByField[field] = decision.reason;

      if (decision.allowed) {
        nextArguments[field] = value;
        keptFields.push(field);
      } else {
        removedFields.push(field);
      }
    }

    decisions.push({
      toolName: step.toolName,
      keptFields,
      removedFields,
      reasonByField,
    });

    return {
      ...step,
      arguments: nextArguments,
    };
  });

  return {
    plan: {
      ...input.plan,
      steps,
    },
    decisions,
  };
}
