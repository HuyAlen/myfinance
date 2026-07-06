import type {
  AIFinanceChatIntent,
  AIFinanceChatIntentScore,
} from "./aiChatTypes";

const INTENT_KEYWORDS: Record<
  Exclude<AIFinanceChatIntent, "unknown">,
  string[]
> = {
  overview: [
    "tong quan",
    "tổng quan",
    "review",
    "nhận xét",
    "nhan xet",
    "phân tích",
    "phan tich",
    "overview",
    "tình hình",
    "tinh hinh",
    "tài chính",
    "tai chinh",
    "ổn không",
    "on khong",
  ],
  budget: [
    "ngân sách",
    "ngan sach",
    "budget",
    "hạn mức",
    "han muc",
    "vượt",
    "vuot",
    "sắp vượt",
    "sap vuot",
    "limit",
    "còn lại",
    "con lai",
  ],
  cashflow: [
    "dòng tiền",
    "dong tien",
    "cashflow",
    "cash flow",
    "thu chi",
    "thu nhập",
    "thu nhap",
    "income",
    "expense",
    "tiết kiệm",
    "tiet kiem",
    "saving",
    "cuối tháng",
    "cuoi thang",
  ],
  spending: [
    "chi tiêu",
    "chi tieu",
    "tiêu nhiều",
    "tieu nhieu",
    "tiêu nhất",
    "tieu nhat",
    "khoản chi",
    "khoan chi",
    "giao dịch",
    "giao dich",
    "transaction",
    "category",
    "danh mục",
    "danh muc",
    "ăn uống",
    "an uong",
  ],
  goal: [
    "mục tiêu",
    "muc tieu",
    "goal",
    "tiến độ",
    "tien do",
    "deadline",
    "quỹ",
    "quy",
    "mua nhà",
    "mua nha",
    "mua xe",
    "saving goal",
  ],
  wallet: [
    "ví",
    "vi",
    "wallet",
    "số dư",
    "so du",
    "tiền mặt",
    "tien mat",
    "tài khoản",
    "tai khoan",
    "balance",
    "thanh khoản",
    "thanh khoan",
  ],
  debt: ["nợ", "no", "debt", "vay", "loan", "trả nợ", "tra no", "liability"],
  investment: [
    "đầu tư",
    "dau tu",
    "investment",
    "portfolio",
    "cổ phiếu",
    "co phieu",
    "crypto",
    "fund",
    "chứng khoán",
    "chung khoan",
  ],
  search: [
    "tìm",
    "tim",
    "search",
    "tra cứu",
    "tra cuu",
    "mua",
    "khi nào",
    "khi nao",
    "bao nhiêu",
    "bao nhieu",
    "trên",
    "tren",
    "dưới",
    "duoi",
    "lớn hơn",
    "lon hon",
    "nhỏ hơn",
    "nho hon",
    "grab",
    "shopee",
    "macbook",
    "hóa đơn",
    "hoa don",
  ],
  health: [
    "sức khỏe",
    "suc khoe",
    "health",
    "điểm",
    "diem",
    "score",
    "tốt không",
    "tot khong",
    "xấu không",
    "xau khong",
  ],
  alert: [
    "cảnh báo",
    "canh bao",
    "alert",
    "rủi ro",
    "rui ro",
    "nguy hiểm",
    "nguy hiem",
    "bất thường",
    "bat thuong",
    "critical",
  ],
};

function normalizeVietnamese(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRaw(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getAIFinanceIntentScores(
  question: string,
): AIFinanceChatIntentScore[] {
  const raw = normalizeRaw(question);
  const normalized = normalizeVietnamese(question);

  return Object.entries(INTENT_KEYWORDS)
    .map(([intent, keywords]) => {
      const matchedKeywords = keywords.filter((keyword) => {
        const rawKeyword = normalizeRaw(keyword);
        const normalizedKeyword = normalizeVietnamese(keyword);
        return (
          raw.includes(rawKeyword) || normalized.includes(normalizedKeyword)
        );
      });

      return {
        intent: intent as AIFinanceChatIntent,
        score: matchedKeywords.length,
        matchedKeywords,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function detectAIFinanceChatIntent(
  question: string,
): AIFinanceChatIntent {
  const scores = getAIFinanceIntentScores(question);
  const best = scores[0];

  if (!best || best.score <= 0) return "overview";
  return best.intent;
}
