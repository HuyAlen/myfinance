type FinanceEntityKind =
  | "category"
  | "wallet"
  | "goal"
  | "merchant"
  | "transaction_note";

export type AIFinanceEntityCandidate = {
  kind: FinanceEntityKind;
  id?: string;
  name: string;
  query?: string;
  score: number;
  confidence: "high" | "medium" | "low";
  matchedBy:
    | "exact"
    | "quoted"
    | "contains"
    | "token_overlap"
    | "note_frequency";
};

export type AIFinanceEntityResolution = {
  queryText: string;
  normalizedQuery: string;
  candidates: AIFinanceEntityCandidate[];
  bestByKind: Partial<Record<FinanceEntityKind, AIFinanceEntityCandidate>>;
  ambiguous: boolean;
};

type EntityRecord = {
  id?: unknown;
  name?: unknown;
  note?: unknown;
};

type ResolveEntityInput = {
  question: string;
  categories?: EntityRecord[];
  wallets?: EntityRecord[];
  goals?: EntityRecord[];
  recentTransactions?: EntityRecord[];
  maxCandidates?: number;
};

const STOP_WORDS = new Set([
  "toi",
  "ban",
  "minh",
  "da",
  "dang",
  "se",
  "bao",
  "nhieu",
  "tien",
  "chi",
  "tieu",
  "thu",
  "nhap",
  "giao",
  "dich",
  "hom",
  "nay",
  "qua",
  "tuan",
  "thang",
  "nam",
  "quy",
  "this",
  "last",
  "today",
  "yesterday",
  "week",
  "month",
  "year",
  "quarter",
  "how",
  "much",
  "spent",
  "spend",
  "expense",
  "income",
  "transaction",
  "transactions",
  "cho",
  "ve",
  "cua",
  "la",
  "va",
  "or",
  "and",
  "the",
]);

function stringOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFinanceEntityText(value: unknown) {
  return stringOf(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalizeFinanceEntityText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function quotedSegments(question: string) {
  return [...question.matchAll(/["“”']([^"“”']{2,100})["“”']/g)]
    .map((match) => normalizeFinanceEntityText(match[1]))
    .filter(Boolean);
}

function confidenceOf(score: number): AIFinanceEntityCandidate["confidence"] {
  if (score >= 90) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function scoreEntity(input: {
  question: string;
  normalizedQuestion: string;
  quoted: string[];
  entityName: string;
}) {
  const normalizedName = normalizeFinanceEntityText(input.entityName);

  if (!normalizedName) {
    return null;
  }

  if (input.quoted.includes(normalizedName)) {
    return {
      score: 100,
      matchedBy: "quoted" as const,
    };
  }

  if (input.normalizedQuestion === normalizedName) {
    return {
      score: 98,
      matchedBy: "exact" as const,
    };
  }

  if (input.normalizedQuestion.includes(normalizedName)) {
    const lengthBonus = Math.min(12, normalizedName.length / 3);
    return {
      score: Math.round(82 + lengthBonus),
      matchedBy: "contains" as const,
    };
  }

  const questionTokens = new Set(meaningfulTokens(input.question));
  const entityTokens = meaningfulTokens(input.entityName);

  if (entityTokens.length === 0) {
    return null;
  }

  const matchedTokens = entityTokens.filter((token) =>
    questionTokens.has(token),
  );

  if (matchedTokens.length === 0) {
    return null;
  }

  const coverage = matchedTokens.length / entityTokens.length;
  const score = Math.round(45 + coverage * 35);

  return {
    score,
    matchedBy: "token_overlap" as const,
  };
}

function candidateFromRecord(input: {
  kind: Exclude<FinanceEntityKind, "merchant" | "transaction_note">;
  record: EntityRecord;
  question: string;
  normalizedQuestion: string;
  quoted: string[];
}) {
  const id = stringOf(input.record.id);
  const name = stringOf(input.record.name);

  if (!name) {
    return null;
  }

  const match = scoreEntity({
    question: input.question,
    normalizedQuestion: input.normalizedQuestion,
    quoted: input.quoted,
    entityName: name,
  });

  if (!match) {
    return null;
  }

  return {
    kind: input.kind,
    id: id || undefined,
    name,
    score: match.score,
    confidence: confidenceOf(match.score),
    matchedBy: match.matchedBy,
  } satisfies AIFinanceEntityCandidate;
}

function noteCandidates(input: {
  question: string;
  normalizedQuestion: string;
  quoted: string[];
  recentTransactions: EntityRecord[];
}) {
  const noteFrequency = new Map<
    string,
    {
      display: string;
      count: number;
      bestScore: number;
      matchedBy: AIFinanceEntityCandidate["matchedBy"];
    }
  >();

  for (const transaction of input.recentTransactions) {
    const note = stringOf(transaction.note);

    if (!note) continue;

    const normalizedNote = normalizeFinanceEntityText(note);
    if (!normalizedNote) continue;

    const direct = scoreEntity({
      question: input.question,
      normalizedQuestion: input.normalizedQuestion,
      quoted: input.quoted,
      entityName: note,
    });

    const noteTokens = meaningfulTokens(note);
    const questionTokens = new Set(meaningfulTokens(input.question));
    const matchedNoteTokens = noteTokens.filter((token) =>
      questionTokens.has(token),
    );

    if (!direct && matchedNoteTokens.length === 0) {
      continue;
    }

    const selectedQuery =
      matchedNoteTokens.length > 0
        ? matchedNoteTokens.join(" ")
        : (input.quoted.find((segment) => normalizedNote.includes(segment)) ??
          note);

    const normalizedQuery = normalizeFinanceEntityText(selectedQuery);
    if (!normalizedQuery) continue;

    const score = direct?.score ?? 58;
    const current = noteFrequency.get(normalizedQuery);

    noteFrequency.set(normalizedQuery, {
      display: selectedQuery,
      count: (current?.count ?? 0) + 1,
      bestScore: Math.max(current?.bestScore ?? 0, score),
      matchedBy: direct?.matchedBy ?? "note_frequency",
    });
  }

  return [...noteFrequency.entries()].map(([normalizedQuery, value]) => {
    const score = Math.min(
      96,
      value.bestScore + Math.min(12, Math.max(0, value.count - 1) * 3),
    );

    return {
      kind: "merchant" as const,
      name: value.display,
      query: normalizedQuery,
      score,
      confidence: confidenceOf(score),
      matchedBy:
        value.count > 1 ? ("note_frequency" as const) : value.matchedBy,
    } satisfies AIFinanceEntityCandidate;
  });
}

function deduplicateCandidates(candidates: AIFinanceEntityCandidate[]) {
  const deduplicated = new Map<string, AIFinanceEntityCandidate>();

  for (const candidate of candidates) {
    const key = [
      candidate.kind,
      candidate.id ?? "",
      normalizeFinanceEntityText(candidate.query ?? candidate.name),
    ].join(":");

    const current = deduplicated.get(key);

    if (!current || candidate.score > current.score) {
      deduplicated.set(key, candidate);
    }
  }

  return [...deduplicated.values()];
}

export function resolveAIFinanceEntities(
  input: ResolveEntityInput,
): AIFinanceEntityResolution {
  const normalizedQuestion = normalizeFinanceEntityText(input.question);
  const quoted = quotedSegments(input.question);

  const candidates: AIFinanceEntityCandidate[] = [];

  for (const category of input.categories ?? []) {
    const candidate = candidateFromRecord({
      kind: "category",
      record: category,
      question: input.question,
      normalizedQuestion,
      quoted,
    });
    if (candidate) candidates.push(candidate);
  }

  for (const wallet of input.wallets ?? []) {
    const candidate = candidateFromRecord({
      kind: "wallet",
      record: wallet,
      question: input.question,
      normalizedQuestion,
      quoted,
    });
    if (candidate) candidates.push(candidate);
  }

  for (const goal of input.goals ?? []) {
    const candidate = candidateFromRecord({
      kind: "goal",
      record: goal,
      question: input.question,
      normalizedQuestion,
      quoted,
    });
    if (candidate) candidates.push(candidate);
  }

  candidates.push(
    ...noteCandidates({
      question: input.question,
      normalizedQuestion,
      quoted,
      recentTransactions: input.recentTransactions ?? [],
    }),
  );

  const sorted = deduplicateCandidates(candidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.maxCandidates ?? 8);

  const bestByKind: AIFinanceEntityResolution["bestByKind"] = {};

  for (const candidate of sorted) {
    if (!bestByKind[candidate.kind]) {
      bestByKind[candidate.kind] = candidate;
    }
  }

  const top = sorted[0];
  const second = sorted[1];
  const ambiguous =
    Boolean(top && second) &&
    top.kind === second.kind &&
    Math.abs(top.score - second.score) <= 8;

  return {
    queryText: input.question,
    normalizedQuery: normalizedQuestion,
    candidates: sorted,
    bestByKind,
    ambiguous,
  };
}
