import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import {
  VI_UI_TECHNICAL_ALLOWLIST,
  VI_UI_TERMS,
} from "@/src/lib/ui/vietnameseUiTerminology";

const root = path.resolve(__dirname);
const readRaw = (relativePath: string) =>
  readFileSync(path.resolve(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const read = (relativePath: string) => {
  const primary = readRaw(relativePath);

  if (relativePath === "savings/SavingsPage.tsx") {
    return [
      primary,
      readRaw("savings/savingsPageSupport.tsx"),
      readRaw("savings/SavingsPageSummaryTiles.tsx"),
    ].join("\n");
  }

  return primary;
};

function extractUiLiteralText(source: string, fileName: string) {
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const values: string[] = [];

  const add = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) values.push(normalized);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      add(node.getText(sourceFile));
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (
        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
        parent.moduleSpecifier === node
      ) {
        return;
      }
      add(node.text);
      return;
    }

    if (ts.isTemplateExpression(node)) {
      add(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        add(span.literal.text);
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return values.join("\n");
}

const checks = [
  {
    file: "layout/Header.tsx",
    forbidden: ["AI Advisor", "Portfolio, Forex", "Online", "Sync..."],
    required: [VI_UI_TERMS.aiAdvisor, VI_UI_TERMS.portfolio, VI_UI_TERMS.forex, "Trực tuyến", "Đang đồng bộ..."],
  },
  {
    file: "layout/Sidebar.tsx",
    forbidden: ["AI Advisor"],
    required: [VI_UI_TERMS.aiAdvisor],
  },
  {
    file: "activity/ActivityPage.tsx",
    forbidden: ["Audit Center", "Server-side · theo kỳ đang chọn"],
    required: ["Trung tâm nhật ký", "Xử lý trên máy chủ · theo kỳ đang chọn"],
  },
  {
    file: "wallets/WalletReconciliationCenter.tsx",
    forbidden: ["Reconciliation Center", "Coverage", "snapshot số dư", "receipt"],
    required: [VI_UI_TERMS.reconciliationCenter, VI_UI_TERMS.reconciliationCoverage, "bản ghi số dư", "biên nhận"],
  },
  {
    file: "dashboard/DashboardPage.tsx",
    forbidden: [
      "Chưa thể đồng bộ Dashboard",
      "Chưa có Balance",
      "Nạp tiền Forex",
      "Rút tiền Forex",
      "so với snapshot trước",
      "Snapshot Net Worth đã ghi nhận",
      "Đóng tùy chỉnh Dashboard",
      "Giữ cho recurring",
      "Recurring còn phải chi",
      "Runway từ tiền trong ví + recurring đã cấu hình",
      "lần recurring được chiếu tới",
      "Chưa có recurring nào để chiếu tới",
      "Cần review",
      "Portfolio và Forex",
      "Tài khoản Forex",
      "Balance hiện tại",
      "ROI",
      "Profit",
      "Net Worth đang dùng vốn ròng làm fallback",
      "Quản lý tài khoản Forex",
      "Từ Savings/Forex về ví",
      "Từ ví sang Savings/Forex",
      "Net Worth trong snapshot",
      "Snapshot chỉ lưu các chỉ số review",
      "Thu nhập recurring dự kiến",
    ],
    required: [
      "Chưa thể đồng bộ Tổng quan",
      'title: "Ngoại hối"',
      "Chưa có số dư",
      "Nạp tiền ngoại hối",
      "Rút tiền ngoại hối",
      "so với bản ghi trước",
      "Bản ghi Tài sản ròng đã ghi nhận",
      "Đóng tùy chỉnh Tổng quan",
      "Giữ cho lịch định kỳ",
      "Lịch định kỳ còn phải chi",
      "Dự báo dòng tiền 90 ngày",
      "Số dư dự kiến từ tiền trong ví và lịch định kỳ hợp lệ",
      "lần phát sinh định kỳ hợp lệ đã được đưa vào dự báo",
      "Chưa có lịch định kỳ hợp lệ; số dư dự kiến giữ nguyên theo dữ liệu hiện có.",
      "lịch định kỳ chưa đủ cấu hình",
      "Cần rà soát",
      "Danh mục đầu tư và Ngoại hối",
      "Tài khoản ngoại hối",
      "Số dư hiện tại",
      "Tỷ suất lợi nhuận",
      "Lợi nhuận",
      "Tài sản ròng đang dùng vốn ròng làm giá trị thay thế",
      "Quản lý tài khoản ngoại hối",
      "Từ Tiết kiệm/Ngoại hối về ví",
      "Từ ví sang Tiết kiệm/Ngoại hối",
      "Tài sản ròng trong bản ghi",
      "Bản ghi chỉ lưu các chỉ số rà soát",
      "Thu nhập định kỳ dự kiến",
    ],
  },
  {
    file: "dashboard/NetWorthTrendChart.tsx",
    forbidden: ["Snapshot", "Snapshot đầu tiên trong chuỗi", "tháng có snapshot"],
    required: ["Bản ghi {point.label}", "Bản ghi đầu tiên trong chuỗi", "tháng có bản ghi"],
  },
  {
    file: "reports/ReportsPage.tsx",
    forbidden: ["Snapshot hiện tại", "snapshot hiện tại", "Savings/Forex", "Income Statement · Cash Flow · Net Worth", "ROI"],
    required: ["Bản ghi hiện tại", "bản ghi hiện tại", "Tiết kiệm/Ngoại hối", "Kết quả kinh doanh · Dòng tiền · Tài sản ròng", "Tỷ suất lợi nhuận"],
  },
  {
    file: "investments/InvestmentsPage.tsx",
    forbidden: ["Danh mục Portfolio", "Tài khoản Forex", "Balance Forex", "Profit Forex", "ROI", "Profit as-of", "Broker / nền tảng", "Account number", "Forex Main", "Thêm Forex"],
    required: ["Danh mục đầu tư", "Tài khoản ngoại hối", "Số dư ngoại hối", "Lợi nhuận ngoại hối", "Tỷ suất lợi nhuận", "Lợi nhuận tại kỳ", "Sàn / nền tảng", "Số tài khoản", "Tài khoản ngoại hối chính", "Thêm ngoại hối"],
  },
  {
    file: "savings/SavingsPage.tsx",
    forbidden: ["Savings Preview", "EDIT SAVING", "NEW SAVING"],
    required: ["Xem trước tiết kiệm", "CHỈNH SỬA TIẾT KIỆM", "THÊM TIẾT KIỆM"],
  },
  {
    file: "settings/SettingsPage.tsx",
    forbidden: ["AI Settings", "Rule Insights", "Finance Context", "Forecast Engine", "Risk Analysis", "Goal Coach", "Investment Coach", "API Key Missing", "Connected", "Action needed", "Testing", "Ready to test", "Setup required", "No API key stored", "Reset dữ liệu demo?", "Lỗi reset dữ liệu demo", "Đã reset dữ liệu demo", "File JSON", "file backup", "OpenAI API Key", "API Key chưa đúng", "Quản lý, backup", "Frontend", "Realtime", "Active", "Online", "Connecting", "Export JSON", "Import JSON", "Khôi phục backup?", "half-restored"],
    required: ["cài đặt AI", "Phân tích theo quy tắc", "Ngữ cảnh tài chính", "Bộ máy dự báo", "Phân tích rủi ro", "Cố vấn mục tiêu", "Cố vấn đầu tư", "Thiếu khóa API", "Đã kết nối", "Cần xử lý", "Đang kiểm tra", "Sẵn sàng kiểm tra", "Cần thiết lập", "Chưa lưu khóa API", "Đặt lại dữ liệu mẫu?", "Lỗi đặt lại dữ liệu mẫu", "Đã đặt lại dữ liệu mẫu", "Tệp JSON", "tệp sao lưu", "khóa API OpenAI", "Quản lý, sao lưu", "Giao diện", "Thời gian thực", "Đang hoạt động", "Trực tuyến", "Đang kết nối", "Xuất JSON", "Nhập JSON", "Khôi phục bản sao lưu?", "khôi phục dở dang"],
  },
  {
    file: "transactions/TransactionsPage.tsx",
    forbidden: ["Review workflow", "Đóng review", "hàng đợi review", "Savings Engine"],
    required: ["Quy trình rà soát", "Đóng rà soát", "hàng đợi rà soát", "hệ thống Tiết kiệm"],
  },
  {
    file: "transactions/TransactionCsvImportModal.tsx",
    forbidden: ["Theo rule", "Import dùng cùng Finance Engine"],
    required: ["Theo quy tắc", "Nhập dữ liệu dùng cùng bộ máy tài chính"],
  },
  {
    file: "recurring/RecurringMoneyPage.tsx",
    forbidden: ["Đủ dữ liệu cho forecast"],
    required: ["Đủ dữ liệu cho dự báo"],
  },
  {
    file: "onboarding/ProductTour.tsx",
    forbidden: ["AI Advisor", "Dashboard · Tổng quan", "Financial Health Score", "Net Worth"],
    required: ["Cố vấn AI", "Tổng quan", "Điểm sức khỏe tài chính", "Tài sản ròng"],
  },
  {
    file: "onboarding/WelcomeWizard.tsx",
    forbidden: ["Dashboard", "Health Score", "AI Insights", "App cảnh báo", "hoạt động của app"],
    required: ["Tổng quan", "Điểm sức khỏe tài chính", "Phân tích AI", "Ứng dụng cảnh báo", "hoạt động của ứng dụng"],
  },
  {
    file: "help/HelpPage.tsx",
    forbidden: [
      "Dashboard · Tổng quan",
      "Net Worth",
      "Portfolio",
      "Forex",
      "Savings/Investment",
      "AI Insights",
      "Financial Health Score",
      "Debt Ratio",
      "Debt Service / Income",
      "Emergency Coverage",
      "Budget Adherence",
      "Return on Investment",
      "balance sheet",
      "coverage",
      "snapshot hiện tại",
      "canonical funding snapshot",
      "real expense",
      "future allocation",
      "Dark Mode",
      "quick toggle",
      "rule-based/deterministic",
      "Funding progress",
      "cập nhật ledger",
      " là transfer",
      "Dùng transfer",
      "Budgets, Reports",
      "phân loại canonical",
      "Review danh mục",
      "Freelance",
      "deadline",
      "khoản funding",
      "Review tiến độ",
      "minimum payment",
      "Avalanche",
      " / Crypto / ",
      "cùng semantics",
      "calculation service canonical",
      "insight đang dựa",
      "insight phản ánh",
      "theme hoặc",
      "AI Finance",
      "Review thiết lập",
      "dùng app",
      "Saving Rate",
      "Minimum payments",
      "Help Center",
      "Onboarding,",
      "FAQ",
      "Checklist thiết lập",
      "tiến độ onboarding",
      "các page tài chính",
      "đúng domain",
      "Dashboard và Reports",
    ],
    required: [
      VI_UI_TERMS.overview,
      VI_UI_TERMS.netWorth,
      VI_UI_TERMS.portfolio,
      VI_UI_TERMS.forex,
      VI_UI_TERMS.aiInsights,
      "Điểm sức khỏe tài chính",
      "Tỷ lệ nợ",
      "Tỷ lệ trả nợ / thu nhập",
      "Mức dự phòng khẩn cấp",
      "Mức tuân thủ ngân sách",
      "bảng cân đối tài sản",
      "bản ghi hiện tại",
      "bản ghi nguồn vốn chuẩn",
      "chi tiêu thực",
      "phân bổ tương lai",
      "Chế độ tối",
      "nút chuyển nhanh",
      "được xác định theo quy tắc",
      "Tiến độ nguồn vốn",
      "sổ cái",
      "Làm tự do",
      "hạn hoàn thành",
      "Tài sản mã hóa",
      "dịch vụ tính toán chuẩn",
      "Trung tâm hướng dẫn",
      "Danh sách kiểm tra thiết lập",
      "các trang tài chính",
      "đúng phân hệ",
    ],
  },
] as const;

describe("MYFINANCE-VIETNAMESE-UI-SSOT-1", () => {
  it("scans UI literals without treating comments or identifiers as rendered copy", () => {
    const fixture = `
      const FAQ_ITEMS = [];
      /* AI Advisor */
      const config = { title: "Help Center" };
      const View = () => <p>Dashboard overview</p>;
    `;
    const uiText = extractUiLiteralText(fixture, "fixture.tsx");

    expect(uiText).not.toContain("FAQ_ITEMS");
    expect(uiText).not.toContain("AI Advisor");
    expect(uiText).toContain("Help Center");
    expect(uiText).toContain("Dashboard overview");
  });

  it("defines one canonical Vietnamese UI terminology glossary and a narrow technical allowlist", () => {
    expect(VI_UI_TERMS.overview).toBe("Tổng quan");
    expect(VI_UI_TERMS.netWorth).toBe("Tài sản ròng");
    expect(VI_UI_TERMS.forex).toBe("Ngoại hối");
    expect(VI_UI_TERMS.roi).toBe("Tỷ suất lợi nhuận");
    expect(VI_UI_TECHNICAL_ALLOWLIST).toContain("MyFinance");
    expect(VI_UI_TECHNICAL_ALLOWLIST).toContain("CSV");
    expect(VI_UI_TECHNICAL_ALLOWLIST).toContain("AI");
  });

  for (const check of checks) {
    it(`${check.file} does not regress to known mixed English/Vietnamese product copy`, () => {
      const source = read(check.file);
      const uiText = extractUiLiteralText(source, check.file);
      for (const fragment of check.forbidden) {
        expect(
          uiText.includes(fragment),
          `${check.file} still contains forbidden UI copy: ${fragment}`,
        ).toBe(false);
      }
      for (const fragment of check.required) {
        expect(
          source.includes(fragment),
          `${check.file} is missing canonical Vietnamese UI copy: ${fragment}`,
        ).toBe(true);
      }
    });
  }
});
