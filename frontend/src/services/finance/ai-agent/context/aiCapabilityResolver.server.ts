import {
  AI_FINANCE_CAPABILITY_DEFINITIONS,
  type AIFinanceCapability,
} from "./aiFinanceCapabilities";
import type { AIFinanceContextDomain } from "./aiContextTypes";

export type AIFinanceCapabilityMatch = {
  capability: AIFinanceCapability;
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

export type AIFinanceCapabilityResolution = {
  primary: AIFinanceCapability;
  matches: AIFinanceCapabilityMatch[];
  domains: AIFinanceContextDomain[];
  preferredTools: string[];
  ambiguous: boolean;
};

type Rule = {
  capability: AIFinanceCapability;
  phrases?: string[];
  allWords?: string[][];
  anyWords?: string[];
  negativeWords?: string[];
  score: number;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/\s+/g, " ")
    .trim();
}

const RULES: Rule[] = [
  {
    capability: "wallet_low_balance",
    phrases: [
      "vi nao sap het",
      "vi nao it tien",
      "vi thap nhat",
      "tai khoan nao sap het",
      "lowest wallet",
      "low balance",
    ],
    anyWords: ["sap het", "it nhat", "thap nhat", "can nap"],
    allWords: [
      ["vi", "it"],
      ["tai khoan", "it"],
    ],
    score: 12,
  },
  {
    capability: "wallet_ranking",
    phrases: [
      "vi nao nhieu tien nhat",
      "vi lon nhat",
      "xep hang vi",
      "highest wallet",
      "wallet ranking",
    ],
    anyWords: ["nhieu nhat", "cao nhat", "lon nhat", "xep hang"],
    allWords: [
      ["vi", "nhieu"],
      ["tai khoan", "nhieu"],
    ],
    score: 11,
  },
  {
    capability: "wallet_balance_lookup",
    phrases: ["con bao nhieu", "so du", "balance of"],
    allWords: [
      ["vi", "bao nhieu"],
      ["tai khoan", "bao nhieu"],
    ],
    score: 9,
  },
  {
    capability: "wallet_list",
    phrases: [
      "chi tiet tung vi",
      "danh sach vi",
      "tat ca vi",
      "wallet details",
      "list wallets",
    ],
    allWords: [["chi tiet", "vi"]],
    score: 10,
  },
  {
    capability: "budget_risk",
    phrases: [
      "sap vuot ngan sach",
      "ngan sach nao nguy hiem",
      "vuot han muc",
      "near budget limit",
      "over budget",
    ],
    anyWords: ["sap vuot", "vuot ngan sach", "vuot han muc"],
    score: 11,
  },
  {
    capability: "budget_status",
    phrases: [
      "ngan sach con bao nhieu",
      "tinh trang ngan sach",
      "budget status",
    ],
    anyWords: ["ngan sach", "han muc"],
    score: 7,
  },
  {
    capability: "transaction_ranking",
    phrases: [
      "giao dich lon nhat",
      "top giao dich",
      "khoan chi lon nhat",
      "largest transaction",
    ],
    anyWords: ["giao dich lon", "top giao dich"],
    score: 10,
  },
  {
    capability: "category_spending",
    phrases: [
      "tieu nhieu nhat o dau",
      "danh muc nao ton nhat",
      "chi tieu theo danh muc",
      "top category",
    ],
    allWords: [
      ["danh muc", "chi"],
      ["tieu", "o dau"],
    ],
    score: 10,
  },
  {
    capability: "merchant_spending",
    phrases: ["chi o", "mua o", "tieu tai", "merchant spending"],
    score: 6,
  },
  {
    capability: "period_comparison",
    phrases: [
      "so voi thang truoc",
      "so voi tuan truoc",
      "so sanh",
      "compare with",
      "versus last",
    ],
    anyWords: ["so sanh", "so voi"],
    score: 10,
  },
  {
    capability: "transaction_search",
    phrases: [
      "giao dich",
      "hom qua tieu gi",
      "da chi",
      "da mua",
      "transaction",
    ],
    anyWords: ["chi tieu", "thu nhap", "mua", "tieu"],
    score: 5,
  },
  {
    capability: "income_analysis",
    phrases: ["thu nhap", "luong", "tien vao", "income"],
    score: 8,
  },
  {
    capability: "cashflow_analysis",
    phrases: ["dong tien", "thu chi", "cash flow", "cashflow"],
    score: 9,
  },
  {
    capability: "goal_progress",
    phrases: [
      "tien do muc tieu",
      "muc tieu nao cham",
      "con thieu bao nhieu de",
      "goal progress",
    ],
    anyWords: ["muc tieu", "goal"],
    score: 7,
  },
  {
    capability: "saving_summary",
    phrases: [
      "tiet kiem duoc bao nhieu",
      "quy khan cap",
      "saving rate",
      "savings",
    ],
    anyWords: ["tiet kiem"],
    score: 7,
  },
  {
    capability: "debt_summary",
    phrases: ["con no bao nhieu", "tong no", "khoan vay", "debt", "loan"],
    anyWords: ["no", "tra gop"],
    score: 8,
  },
  {
    capability: "investment_summary",
    phrases: [
      "danh muc dau tu",
      "dau tu",
      "portfolio",
      "investment",
      "co phieu",
      "etf",
      "crypto",
    ],
    score: 8,
  },
  {
    capability: "financial_health",
    phrases: [
      "suc khoe tai chinh",
      "diem tai chinh",
      "co an toan khong",
      "rui ro tai chinh",
      "financial health",
    ],
    score: 10,
  },
  {
    capability: "financial_forecast",
    phrases: [
      "cuoi thang con bao nhieu",
      "bao gio het tien",
      "du song toi cuoi thang",
      "du bao",
      "forecast",
    ],
    anyWords: ["cuoi thang", "bao gio het"],
    score: 10,
  },
  {
    capability: "scenario_analysis",
    phrases: ["neu toi", "neu mua", "co du tien mua", "what if", "scenario"],
    anyWords: ["neu", "gia su"],
    score: 9,
  },
  {
    capability: "write_action",
    phrases: [
      "them giao dich",
      "tao muc tieu",
      "xoa giao dich",
      "cap nhat ngan sach",
      "sua giao dich",
      "create",
      "update",
      "delete",
    ],
    score: 12,
  },
  {
    capability: "financial_overview",
    phrases: [
      "tong quan tai chinh",
      "tong tai san",
      "tai san rong",
      "toi con bao nhieu tien",
      "financial overview",
      "net worth",
    ],
    score: 8,
  },
  {
    capability: "general_finance_knowledge",
    phrases: ["la gi", "giai thich", "what is", "explain"],
    negativeWords: ["cua toi", "thang nay", "vi", "giao dich"],
    score: 3,
  },
];

function scoreRule(text: string, rule: Rule) {
  const reasons: string[] = [];
  let score = 0;

  for (const phrase of rule.phrases ?? []) {
    if (text.includes(phrase)) {
      score += rule.score;
      reasons.push(`phrase:${phrase}`);
    }
  }

  for (const words of rule.allWords ?? []) {
    if (words.every((word) => text.includes(word))) {
      score += Math.max(4, rule.score - 2);
      reasons.push(`all:${words.join("+")}`);
    }
  }

  for (const word of rule.anyWords ?? []) {
    if (text.includes(word)) {
      score += Math.max(2, Math.floor(rule.score / 2));
      reasons.push(`word:${word}`);
    }
  }

  if ((rule.negativeWords ?? []).some((word) => text.includes(word))) {
    score -= rule.score;
  }

  return { score, reasons };
}

function confidenceOf(score: number): AIFinanceCapabilityMatch["confidence"] {
  if (score >= 10) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export function resolveAIFinanceCapabilities(
  question: string,
): AIFinanceCapabilityResolution {
  const text = normalize(question);
  const scored = new Map<AIFinanceCapability, AIFinanceCapabilityMatch>();

  for (const rule of RULES) {
    const candidate = scoreRule(text, rule);
    if (candidate.score <= 0) continue;

    const current = scored.get(rule.capability);
    const score = (current?.score ?? 0) + candidate.score;
    scored.set(rule.capability, {
      capability: rule.capability,
      score,
      confidence: confidenceOf(score),
      reasons: [...(current?.reasons ?? []), ...candidate.reasons],
    });
  }

  if (/(\?|bao nhieu|the nao|phan tich|xem)/.test(text) && scored.size === 0) {
    scored.set("financial_overview", {
      capability: "financial_overview",
      score: 2,
      confidence: "low",
      reasons: ["fallback:finance_read"],
    });
  }

  const matches = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const primary = matches[0]?.capability ?? "financial_overview";
  const relevant = matches.filter(
    (match, index) => index === 0 || match.score >= 6,
  );
  const domains = new Set<AIFinanceContextDomain>();
  const preferredTools = new Set<string>();

  for (const match of relevant) {
    const definition = AI_FINANCE_CAPABILITY_DEFINITIONS[match.capability];
    definition.domains.forEach((domain) => domains.add(domain));
    definition.preferredTools.forEach((tool) => preferredTools.add(tool));
  }

  const first = matches[0]?.score ?? 0;
  const second = matches[1]?.score ?? 0;

  return {
    primary,
    matches,
    domains: [...domains],
    preferredTools: [...preferredTools],
    ambiguous: first > 0 && second > 0 && first - second <= 1,
  };
}
