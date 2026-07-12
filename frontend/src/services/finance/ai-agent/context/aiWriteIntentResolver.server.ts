export type AIWriteOperation = "create" | "update";
export type AIWriteEntity = "budget" | "goal";
export type AIWriteIntentSource = "deterministic" | "none";

export type AIWriteIntentResolution = {
  matched: boolean;
  operation?: AIWriteOperation;
  entity?: AIWriteEntity;
  requiredTool?: "create_budget" | "update_budget" | "create_goal";
  allowedTools: string[];
  confidence: "high" | "medium" | "low";
  source: AIWriteIntentSource;
  reason: string;
  matchedPhrases: string[];
};

type WriteIntentRule = {
  operation: AIWriteOperation;
  entity: AIWriteEntity;
  requiredTool: AIWriteIntentResolution["requiredTool"];
  operationPhrases: string[];
  entityPhrases: string[];
  negativePhrases?: string[];
};

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

const READ_ONLY_PHRASES = [
  "tinh hinh",
  "trang thai",
  "con bao nhieu",
  "da dung bao nhieu",
  "sap vuot",
  "vuot ngan sach",
  "phan tich",
  "xem",
  "show",
  "status",
  "how much",
  "analysis",
];

const RULES: WriteIntentRule[] = [
  {
    operation: "create",
    entity: "budget",
    requiredTool: "create_budget",
    operationPhrases: [
      "tao",
      "them",
      "lap",
      "khoi tao",
      "create",
      "add",
      "new",
      "set up",
    ],
    entityPhrases: ["ngan sach", "budget", "han muc chi tieu"],
    negativePhrases: ["giao dich"],
  },
  {
    operation: "update",
    entity: "budget",
    requiredTool: "update_budget",
    operationPhrases: [
      "cap nhat",
      "sua",
      "doi",
      "tang",
      "giam",
      "dieu chinh",
      "update",
      "change",
      "increase",
      "decrease",
      "edit",
    ],
    entityPhrases: ["ngan sach", "budget", "han muc"],
  },
  {
    operation: "create",
    entity: "goal",
    requiredTool: "create_goal",
    operationPhrases: [
      "tao",
      "them",
      "lap",
      "khoi tao",
      "create",
      "add",
      "new",
      "set up",
    ],
    entityPhrases: ["muc tieu", "goal", "financial goal"],
  },
];

function phraseMatches(text: string, phrases: string[]) {
  return phrases.filter((phrase) => text.includes(phrase));
}

export function resolveAIWriteIntent(
  question: string,
): AIWriteIntentResolution {
  const text = normalize(question);

  if (!text) {
    return {
      matched: false,
      allowedTools: [],
      confidence: "low",
      source: "none",
      reason: "The message is empty after normalization.",
      matchedPhrases: [],
    };
  }

  const candidates = RULES.map((rule) => {
    const operations = phraseMatches(text, rule.operationPhrases);
    const entities = phraseMatches(text, rule.entityPhrases);
    const negatives = phraseMatches(text, rule.negativePhrases ?? []);
    const readOnly = phraseMatches(text, READ_ONLY_PHRASES);

    let score = operations.length * 5 + entities.length * 6;
    score -= negatives.length * 10;

    // A direct write operation + entity is authoritative. Read-oriented words
    // only reduce confidence when no explicit operation is present.
    if (operations.length === 0) {
      score -= readOnly.length * 4;
    }

    return {
      rule,
      score,
      operations,
      entities,
      negatives,
    };
  })
    .filter(
      (candidate) =>
        candidate.operations.length > 0 &&
        candidate.entities.length > 0 &&
        candidate.negatives.length === 0,
    )
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];

  if (!best || !best.rule.requiredTool) {
    return {
      matched: false,
      allowedTools: [],
      confidence: "low",
      source: "none",
      reason:
        "No supported Phase 1 write operation and finance entity pair was detected.",
      matchedPhrases: [],
    };
  }

  const matchedPhrases = [...best.operations, ...best.entities];

  return {
    matched: true,
    operation: best.rule.operation,
    entity: best.rule.entity,
    requiredTool: best.rule.requiredTool,
    allowedTools: [best.rule.requiredTool],
    confidence: best.score >= 16 ? "high" : "medium",
    source: "deterministic",
    reason: `Resolved ${best.rule.operation} ${best.rule.entity} to ${best.rule.requiredTool}.`,
    matchedPhrases,
  };
}
