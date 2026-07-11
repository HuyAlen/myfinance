import { normalizeFinanceEntityText } from "./aiEntityResolver.server";

export type AIFinanceSemanticConcept =
  | "food"
  | "transport"
  | "health"
  | "baby"
  | "shopping"
  | "housing"
  | "utilities"
  | "education"
  | "entertainment"
  | "travel"
  | "salary"
  | "investment";

export type AIFinanceSemanticCandidate = {
  concept: AIFinanceSemanticConcept;
  matchedPhrase: string;
  score: number;
  confidence: "high" | "medium" | "low";
  categoryId?: string;
  categoryName?: string;
  queryTerms: string[];
};

export type AIFinanceSemanticResolution = {
  normalizedQuestion: string;
  candidates: AIFinanceSemanticCandidate[];
  best?: AIFinanceSemanticCandidate;
  ambiguous: boolean;
};

type EntityRecord = {
  id?: unknown;
  name?: unknown;
};

type SemanticRule = {
  concept: AIFinanceSemanticConcept;
  phrases: string[];
  categoryAliases: string[];
  queryTerms: string[];
};

const RULES: SemanticRule[] = [
  {
    concept: "food",
    phrases: [
      "ăn sáng",
      "ăn trưa",
      "ăn tối",
      "đồ ăn",
      "thức ăn",
      "cơm",
      "phở",
      "bún",
      "cafe",
      "cà phê",
      "trà sữa",
      "nhà hàng",
      "food",
      "breakfast",
      "lunch",
      "dinner",
      "restaurant",
    ],
    categoryAliases: ["ăn uống", "ẩm thực", "food", "dining"],
    queryTerms: [
      "ăn sáng",
      "ăn trưa",
      "ăn tối",
      "cơm",
      "phở",
      "bún",
      "cafe",
      "cà phê",
      "trà sữa",
      "nhà hàng",
    ],
  },
  {
    concept: "transport",
    phrases: [
      "taxi",
      "grab",
      "be",
      "gojek",
      "xăng",
      "gửi xe",
      "vé xe",
      "đi lại",
      "transport",
      "fuel",
    ],
    categoryAliases: ["đi lại", "di chuyển", "giao thông", "transport"],
    queryTerms: ["taxi", "grab", "be", "gojek", "xăng", "gửi xe", "vé xe"],
  },
  {
    concept: "health",
    phrases: [
      "thuốc",
      "khám bệnh",
      "bệnh viện",
      "phòng khám",
      "nha khoa",
      "y tế",
      "sức khỏe",
      "medicine",
      "hospital",
      "clinic",
      "health",
    ],
    categoryAliases: ["y tế", "sức khỏe", "health", "medical"],
    queryTerms: ["thuốc", "khám bệnh", "bệnh viện", "phòng khám", "nha khoa"],
  },
  {
    concept: "baby",
    phrases: [
      "em bé",
      "cho bé",
      "con",
      "bỉm",
      "tã",
      "sữa",
      "đồ chơi",
      "matcha",
      "mochi",
      "baby",
      "diaper",
      "formula milk",
    ],
    categoryAliases: ["em bé", "con cái", "trẻ em", "baby", "children"],
    queryTerms: [
      "em bé",
      "cho bé",
      "bỉm",
      "tã",
      "sữa",
      "đồ chơi",
      "matcha",
      "mochi",
    ],
  },
  {
    concept: "shopping",
    phrases: [
      "mua sắm",
      "shopee",
      "lazada",
      "tiki",
      "siêu thị",
      "quần áo",
      "shopping",
      "clothes",
    ],
    categoryAliases: ["mua sắm", "shopping", "quần áo"],
    queryTerms: ["shopee", "lazada", "tiki", "siêu thị", "quần áo"],
  },
  {
    concept: "housing",
    phrases: [
      "tiền nhà",
      "thuê nhà",
      "chung cư",
      "nội thất",
      "housing",
      "rent",
    ],
    categoryAliases: ["nhà ở", "tiền nhà", "housing", "rent"],
    queryTerms: ["tiền nhà", "thuê nhà", "chung cư", "nội thất"],
  },
  {
    concept: "utilities",
    phrases: [
      "tiền điện",
      "tiền nước",
      "internet",
      "wifi",
      "điện thoại",
      "hóa đơn",
      "utilities",
      "electricity",
      "water bill",
    ],
    categoryAliases: ["hóa đơn", "điện nước", "tiện ích", "utilities"],
    queryTerms: [
      "tiền điện",
      "tiền nước",
      "internet",
      "wifi",
      "điện thoại",
      "hóa đơn",
    ],
  },
  {
    concept: "education",
    phrases: [
      "học phí",
      "khóa học",
      "sách",
      "trường học",
      "education",
      "tuition",
    ],
    categoryAliases: ["giáo dục", "học tập", "education"],
    queryTerms: ["học phí", "khóa học", "sách", "trường học"],
  },
  {
    concept: "entertainment",
    phrases: [
      "xem phim",
      "netflix",
      "spotify",
      "game",
      "giải trí",
      "entertainment",
    ],
    categoryAliases: ["giải trí", "entertainment"],
    queryTerms: ["xem phim", "netflix", "spotify", "game"],
  },
  {
    concept: "travel",
    phrases: [
      "du lịch",
      "khách sạn",
      "vé máy bay",
      "booking",
      "travel",
      "hotel",
      "flight",
    ],
    categoryAliases: ["du lịch", "travel"],
    queryTerms: ["du lịch", "khách sạn", "vé máy bay", "booking"],
  },
  {
    concept: "salary",
    phrases: ["lương", "thưởng", "salary", "bonus", "payroll"],
    categoryAliases: ["lương", "thu nhập", "salary", "income"],
    queryTerms: ["lương", "thưởng", "salary", "bonus"],
  },
  {
    concept: "investment",
    phrases: [
      "cổ phiếu",
      "crypto",
      "bitcoin",
      "btc",
      "etf",
      "đầu tư",
      "investment",
      "stock",
    ],
    categoryAliases: ["đầu tư", "investment"],
    queryTerms: ["cổ phiếu", "crypto", "bitcoin", "btc", "etf"],
  },
];

function stringOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function confidenceOf(score: number): AIFinanceSemanticCandidate["confidence"] {
  if (score >= 90) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function categoryMatch(rule: SemanticRule, categories: EntityRecord[]) {
  let best:
    | {
        id?: string;
        name: string;
        score: number;
      }
    | undefined;

  for (const category of categories) {
    const id = stringOf(category.id) || undefined;
    const name = stringOf(category.name);
    const normalizedName = normalizeFinanceEntityText(name);

    if (!normalizedName) continue;

    for (const alias of rule.categoryAliases) {
      const normalizedAlias = normalizeFinanceEntityText(alias);
      let score = 0;

      if (normalizedName === normalizedAlias) {
        score = 100;
      } else if (
        normalizedName.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedName)
      ) {
        score = 88;
      }

      if (score > (best?.score ?? 0)) {
        best = { id, name, score };
      }
    }
  }

  return best;
}

function matchedPhrase(question: string, phrases: string[]) {
  const normalizedQuestion = normalizeFinanceEntityText(question);

  return phrases
    .map((phrase) => ({
      phrase,
      normalized: normalizeFinanceEntityText(phrase),
    }))
    .filter(
      (item) => item.normalized && normalizedQuestion.includes(item.normalized),
    )
    .sort((a, b) => b.normalized.length - a.normalized.length)[0]?.phrase;
}

export function resolveAIFinanceSemanticSearch(input: {
  question: string;
  categories?: EntityRecord[];
  maxCandidates?: number;
}): AIFinanceSemanticResolution {
  const categories = input.categories ?? [];
  const candidates: AIFinanceSemanticCandidate[] = [];

  for (const rule of RULES) {
    const phrase = matchedPhrase(input.question, rule.phrases);
    if (!phrase) continue;

    const category = categoryMatch(rule, categories);
    const phraseLengthBonus = Math.min(
      8,
      normalizeFinanceEntityText(phrase).length / 4,
    );
    const baseScore = Math.round(78 + phraseLengthBonus);
    const score = Math.min(100, baseScore + (category ? 8 : 0));

    candidates.push({
      concept: rule.concept,
      matchedPhrase: phrase,
      score,
      confidence: confidenceOf(score),
      categoryId: category?.id,
      categoryName: category?.name,
      queryTerms: [...new Set([phrase, ...rule.queryTerms])].slice(0, 12),
    });
  }

  const sorted = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, input.maxCandidates ?? 5);

  const first = sorted[0];
  const second = sorted[1];

  return {
    normalizedQuestion: normalizeFinanceEntityText(input.question),
    candidates: sorted,
    best: first,
    ambiguous:
      Boolean(first && second) && Math.abs(first.score - second.score) <= 5,
  };
}
