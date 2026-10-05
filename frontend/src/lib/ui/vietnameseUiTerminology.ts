export const VI_UI_TERMS = {
  overview: "Tổng quan",
  netWorth: "Tài sản ròng",
  portfolio: "Danh mục đầu tư",
  forex: "Ngoại hối",
  roi: "Tỷ suất lợi nhuận",
  snapshot: "Bản ghi",
  receipt: "Biên nhận",
  reconciliationCenter: "Trung tâm đối soát",
  reconciliationCoverage: "Mức độ đối soát",
  aiAdvisor: "Cố vấn AI",
  aiInsights: "Phân tích AI",
  review: "Rà soát",
  forecast: "Dự báo",
  settings: "Cài đặt",
} as const;

/**
 * Technical/product tokens intentionally allowed to remain unchanged in
 * Vietnamese UI because translating them would reduce precision.
 */
export const VI_UI_TECHNICAL_ALLOWLIST = [
  "MyFinance",
  "VND",
  "USD",
  "CSV",
  "JSON",
  "AI",
  "API",
  "ETF",
  "Email",
  "Next.js",
  "Supabase",
  "Exness",
  "MT4",
  "MT5",
] as const;
