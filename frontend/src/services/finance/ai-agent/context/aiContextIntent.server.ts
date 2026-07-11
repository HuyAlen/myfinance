import type {
  AIFinanceContextDomain,
  AIFinanceContextIntent,
} from "./aiContextTypes";

const DOMAIN_KEYWORDS: Record<AIFinanceContextDomain, string[]> = {
  overview: [
    "tổng quan",
    "overview",
    "tài chính",
    "financial summary",
    "net worth",
    "tài sản ròng",
  ],
  transactions: [
    "giao dịch",
    "transaction",
    "đã mua",
    "đã chi",
    "chi tiêu",
    "expense",
    "income",
    "thu nhập",
  ],
  budgets: ["ngân sách", "budget", "hạn mức", "vượt ngân sách"],
  goals: ["mục tiêu", "goal", "tiết kiệm", "saving goal", "mua nhà", "mua xe"],
  wallets: ["ví", "wallet", "tài khoản", "account balance", "số dư"],
  debts: ["nợ", "debt", "loan", "khoản vay", "trả góp"],
  investments: [
    "đầu tư",
    "investment",
    "portfolio",
    "cổ phiếu",
    "etf",
    "crypto",
  ],
  cashflow: ["dòng tiền", "cash flow", "cashflow", "thu chi"],
  health: [
    "sức khỏe tài chính",
    "financial health",
    "điểm tài chính",
    "an toàn không",
    "rủi ro tài chính",
  ],
};

const WRITE_KEYWORDS = [
  "tạo",
  "thêm",
  "cập nhật",
  "sửa",
  "đổi",
  "tăng",
  "giảm",
  "xóa",
  "create",
  "add",
  "update",
  "change",
  "increase",
  "decrease",
  "delete",
];

function normalize(text: string) {
  return text.toLocaleLowerCase("vi-VN");
}

export type AIFinanceNaturalDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

function calendarDateInTimezone(
  date: Date,
  timezone = DEFAULT_TIMEZONE,
): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function calendarDateToUtc(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function utcToCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatCalendarDate(date: CalendarDate) {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

function addCalendarDays(date: CalendarDate, days: number) {
  const target = calendarDateToUtc(date);
  target.setUTCDate(target.getUTCDate() + days);
  return utcToCalendarDate(target);
}

function startOfCalendarWeek(date: CalendarDate) {
  const target = calendarDateToUtc(date);
  const weekday = target.getUTCDay() || 7;
  return addCalendarDays(date, 1 - weekday);
}

function endOfCalendarWeek(date: CalendarDate) {
  return addCalendarDays(startOfCalendarWeek(date), 6);
}

function startOfCalendarMonth(date: CalendarDate) {
  return {
    year: date.year,
    month: date.month,
    day: 1,
  };
}

function endOfCalendarMonth(date: CalendarDate) {
  const target = new Date(Date.UTC(date.year, date.month, 0));
  return utcToCalendarDate(target);
}

function shiftCalendarMonths(date: CalendarDate, months: number) {
  const target = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  return utcToCalendarDate(target);
}

function startOfCalendarQuarter(date: CalendarDate) {
  const firstMonth = Math.floor((date.month - 1) / 3) * 3 + 1;

  return {
    year: date.year,
    month: firstMonth,
    day: 1,
  };
}

function endOfCalendarQuarter(date: CalendarDate) {
  const start = startOfCalendarQuarter(date);
  const nextQuarter = shiftCalendarMonths(start, 3);
  return addCalendarDays(nextQuarter, -1);
}

export function resolveAIFinanceNaturalDatePreset(
  preset: AIFinanceNaturalDatePreset,
  options?: {
    now?: Date;
    timezone?: string;
  },
) {
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const today = calendarDateInTimezone(options?.now ?? new Date(), timezone);

  let from: CalendarDate;
  let to: CalendarDate;

  switch (preset) {
    case "today":
      from = today;
      to = today;
      break;

    case "yesterday":
      from = addCalendarDays(today, -1);
      to = from;
      break;

    case "this_week":
      from = startOfCalendarWeek(today);
      to = endOfCalendarWeek(today);
      break;

    case "last_week": {
      const currentWeekStart = startOfCalendarWeek(today);
      from = addCalendarDays(currentWeekStart, -7);
      to = addCalendarDays(currentWeekStart, -1);
      break;
    }

    case "this_month":
      from = startOfCalendarMonth(today);
      to = endOfCalendarMonth(today);
      break;

    case "last_month": {
      const previousMonth = shiftCalendarMonths(today, -1);
      from = startOfCalendarMonth(previousMonth);
      to = endOfCalendarMonth(previousMonth);
      break;
    }

    case "this_quarter":
      from = startOfCalendarQuarter(today);
      to = endOfCalendarQuarter(today);
      break;

    case "last_quarter": {
      const previousQuarter = shiftCalendarMonths(today, -3);
      from = startOfCalendarQuarter(previousQuarter);
      to = endOfCalendarQuarter(previousQuarter);
      break;
    }

    case "this_year":
      from = { year: today.year, month: 1, day: 1 };
      to = { year: today.year, month: 12, day: 31 };
      break;

    case "last_year":
      from = { year: today.year - 1, month: 1, day: 1 };
      to = { year: today.year - 1, month: 12, day: 31 };
      break;
  }

  return {
    from: formatCalendarDate(from),
    to: formatCalendarDate(to),
    label: preset,
    timezone,
  };
}

function detectNaturalDatePreset(
  question: string,
): AIFinanceNaturalDatePreset | null {
  const text = normalize(question);

  const rules: Array<{
    preset: AIFinanceNaturalDatePreset;
    keywords: string[];
  }> = [
    {
      preset: "yesterday",
      keywords: ["hôm qua", "yesterday"],
    },
    {
      preset: "last_week",
      keywords: ["tuần trước", "last week"],
    },
    {
      preset: "this_week",
      keywords: ["tuần này", "this week"],
    },
    {
      preset: "last_month",
      keywords: ["tháng trước", "last month"],
    },
    {
      preset: "this_month",
      keywords: ["tháng này", "this month"],
    },
    {
      preset: "last_quarter",
      keywords: ["quý trước", "last quarter"],
    },
    {
      preset: "this_quarter",
      keywords: ["quý này", "this quarter"],
    },
    {
      preset: "last_year",
      keywords: ["năm trước", "năm ngoái", "last year"],
    },
    {
      preset: "this_year",
      keywords: ["năm nay", "this year"],
    },
    {
      preset: "today",
      keywords: ["hôm nay", "today"],
    },
  ];

  return (
    rules.find((rule) =>
      rule.keywords.some((keyword) => text.includes(keyword)),
    )?.preset ?? null
  );
}

function detectDateRange(question: string) {
  const text = normalize(question);
  const naturalPreset = detectNaturalDatePreset(question);

  if (naturalPreset) {
    return resolveAIFinanceNaturalDatePreset(naturalPreset);
  }

  const explicitDate = text.match(
    /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
  );

  if (explicitDate) {
    const date = [
      explicitDate[1],
      String(Number(explicitDate[2])).padStart(2, "0"),
      String(Number(explicitDate[3])).padStart(2, "0"),
    ].join("-");

    return {
      from: date,
      to: date,
      label: date,
      timezone: DEFAULT_TIMEZONE,
    };
  }

  const explicitMonth = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);

  if (explicitMonth) {
    const target: CalendarDate = {
      year: Number(explicitMonth[1]),
      month: Number(explicitMonth[2]),
      day: 1,
    };

    return {
      from: formatCalendarDate(startOfCalendarMonth(target)),
      to: formatCalendarDate(endOfCalendarMonth(target)),
      label: `${target.year}-${String(target.month).padStart(2, "0")}`,
      timezone: DEFAULT_TIMEZONE,
    };
  }

  return resolveAIFinanceNaturalDatePreset("this_month");
}

function detectDomains(question: string): AIFinanceContextDomain[] {
  const text = normalize(question);
  const domains = new Set<AIFinanceContextDomain>();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as Array<
    [AIFinanceContextDomain, string[]]
  >) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      domains.add(domain);
    }
  }

  if (domains.size === 0) {
    domains.add("overview");
  }

  if (domains.has("cashflow") || domains.has("health")) {
    domains.add("overview");
    domains.add("transactions");
    domains.add("wallets");
  }

  if (domains.has("budgets")) {
    domains.add("transactions");
  }

  return [...domains];
}

function detectAction(question: string): AIFinanceContextIntent["action"] {
  const text = normalize(question);
  const write = WRITE_KEYWORDS.some((keyword) => text.includes(keyword));
  const read =
    text.includes("?") ||
    [
      "bao nhiêu",
      "thế nào",
      "phân tích",
      "xem",
      "show",
      "how much",
      "analyze",
    ].some((keyword) => text.includes(keyword));

  if (write && read) return "mixed";
  return write ? "write" : "read";
}

function extractEntities(question: string) {
  const quoted = [...question.matchAll(/["“”']([^"“”']{2,80})["“”']/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  return [...new Set(quoted)].slice(0, 8);
}

export function detectAIFinanceContextIntent(
  question: string,
): AIFinanceContextIntent {
  const domains = detectDomains(question);

  return {
    domains,
    action: detectAction(question),
    dateRange: detectDateRange(question),
    entities: extractEntities(question),
    needsRecentTransactions:
      domains.includes("transactions") ||
      domains.includes("budgets") ||
      domains.includes("cashflow") ||
      domains.includes("health"),
  };
}
