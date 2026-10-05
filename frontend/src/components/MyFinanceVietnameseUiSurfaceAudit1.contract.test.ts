import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(path.resolve(__dirname, relative), "utf8").replace(/\r\n/g, "\n");

const dashboard = read("dashboard/DashboardPage.tsx");
const settings = read("settings/SettingsPage.tsx");
const savings = read("savings/SavingsPage.tsx");
const header = read("layout/Header.tsx");
const investments = read("investments/InvestmentsPage.tsx");

function expectNone(source: string, legacy: readonly string[]) {
  for (const fragment of legacy) {
    expect(source, `Still contains mixed-English user copy: ${fragment}`).not.toContain(fragment);
  }
}

function expectAll(source: string, required: readonly string[]) {
  for (const fragment of required) {
    expect(source, `Missing Vietnamese user copy: ${fragment}`).toContain(fragment);
  }
}

describe("MYFINANCE-VIETNAMESE-UI-SSOT-1 rendered-copy completion", () => {
  it("keeps Dashboard user-facing finance copy in Vietnamese", () => {
    expectNone(dashboard, [
      "Dashboard của bạn",
      "Tùy chỉnh Dashboard",
      "Snapshot Net Worth đã ghi nhận",
      "So với snapshot trước",
      "Chưa có snapshot Net Worth nào được ghi nhận cho kỳ đang xem.",
      "Snapshot đã ghi nhận",
      "Cần ít nhất 2 snapshot ở các tháng khác nhau.",
      "ngân sách còn sau recurring",
      "thanh khoản hiện có sau recurring",
      "Thu nhập recurring dự kiến",
      "category bị thiếu",
      "recurring lỗi cấu hình",
      "snapshot Net Worth bị thiếu",
      "Cần review",
      "Cash ròng",
      "Net Worth trong snapshot gần nhất",
      "Snapshot chỉ lưu các chỉ số review",
      "Bản lưu review gần đây",
      "Top danh mục trong tháng",
      "Đóng góp giữa hai snapshot Net Worth",
      "Chưa đủ snapshot để phân rã biến động",
      "Cần ít nhất 2 snapshot Net Worth",
      "Portfolio và Forex",
      "Tài khoản Forex",
      "Balance hiện tại",
      ">Profit</span>",
      "Trading Profit.",
      "Net Worth đang dùng vốn ròng làm fallback",
      "Quản lý tài khoản Forex",
      "Nạp tiền Forex",
      "Rút tiền Forex",
      "Runway từ tiền trong ví",
      "lần recurring được chiếu tới",
      "Chưa có recurring nào để chiếu tới",
      "Savings/Forex",
      "Snapshot vận hành, dự báo cuối tháng",
    ]);
    expectAll(dashboard, [
      "Tổng quan của bạn",
      "Tùy chỉnh Tổng quan",
      "Bản ghi Tài sản ròng đã ghi nhận",
      "So với bản ghi trước",
      "Cần ít nhất 2 bản ghi ở các tháng khác nhau.",
      "Dòng tiền ròng",
      "Các danh mục chi tiêu lớn nhất trong tháng đang xem",
      "Đóng góp giữa hai bản ghi Tài sản ròng gần nhất đã được lưu",
      "Tài khoản ngoại hối",
      "Số dư hiện tại",
      "Lợi nhuận giao dịch.",
      "Quản lý tài khoản ngoại hối",
      "Bản ghi vận hành, dự báo cuối tháng và việc cần ưu tiên.",
    ]);
  });

  it("keeps Settings labels, status text and AI configuration copy in Vietnamese", () => {
    expectNone(settings, [
      "API Key Missing",
      "Action needed",
      "Ready to test",
      "Setup required",
      "No API key stored",
      "Local AI đã sẵn sàng.",
      "Temperature phải nằm trong khoảng",
      "Max Tokens phải là số nguyên",
      "Provider Management",
      "DB Settings",
      "OpenAI Provider",
      "Powered by OpenAI",
      ">Status<",
      "label=\"Provider\"",
      "AI cục bộ only",
      "OpenAI là provider chính",
      "label=\"Model\"",
      "Model mặc định cho AI Finance Chat",
      "OpenAI API Key",
      "API key được lưu",
      "Stored securely",
      "Key missing",
      "Nhập key mới",
      "Last test",
      "Clear input",
      "Remove Key",
      ">Precise</span>",
      ">Creative</span>",
      ">Short</span>",
      ">Detailed</span>",
      "Test Connection",
      "AI Features",
      "AI Adapter",
      "Safe mode",
      "Local Fallback",
      "Local Engine",
      "No Fabrication",
      "masked key",
      "Usage Preview",
      "token/latency metadata",
      "usage vào DB",
      "request, token",
      "AI Agent",
      "Supabase Cloud Storage",
      "trên cloud",
      "Tải backup",
      "backup MyFinance",
      "Backup V2/V3",
      "backup legacy",
      "Chọn file JSON",
      "Reset dữ liệu demo",
      "Reset demo",
      "trạng thái demo mặc định",
      "domain tài chính",
      "Supabase Realtime",
      "Cloud Sync",
      "value: \"Production\"",
      "label: \"Database\"",
      "label: \"AI Services\"",
      "label: \"UI\"",
      "label: \"Frontend\"",
      "label: \"Realtime\"",
      "Khôi phục backup?",
      "Đã khôi phục backup",
      "file backup",
      "File JSON",
      "API Key chưa đúng",
    ]);
    expectAll(settings, [
      "Thiếu khóa API",
      "Cần xử lý",
      "Sẵn sàng kiểm tra",
      "Cần thiết lập",
      "Chưa lưu khóa API",
      "AI cục bộ đã sẵn sàng.",
      "Độ sáng tạo phải nằm trong khoảng 0–2.",
      "Số token tối đa phải là số nguyên trong khoảng 512–8192.",
      "AI-6.1 Quản lý nhà cung cấp, mô hình và quy tắc an toàn",
      "AI-6.5 Cài đặt cơ sở dữ liệu",
      "Nhà cung cấp OpenAI",
      "Được cung cấp bởi OpenAI",
      "label=\"Nhà cung cấp\"",
      "Chỉ AI cục bộ",
      "OpenAI là nhà cung cấp chính, AI cục bộ dùng làm phương án dự phòng khi lỗi.",
      "label=\"Mô hình\"",
      "Khóa API OpenAI",
      "Đã lưu an toàn",
      "Thiếu khóa",
      "Lần kiểm tra gần nhất",
      "Xóa nội dung",
      "Xóa khóa",
      "Chính xác",
      "Sáng tạo",
      "Ngắn",
      "Chi tiết",
      "Kiểm tra kết nối",
      "Tính năng AI",
      "Chế độ an toàn",
      "Dự phòng cục bộ",
      "Không bịa dữ liệu",
      "Xem trước mức sử dụng",
      "Lưu trữ đám mây Supabase",
      "Đồng bộ đám mây",
      "value: \"Môi trường thật\"",
      "label: \"Cơ sở dữ liệu\"",
      "label: \"Dịch vụ AI\"",
      "label: \"Giao diện người dùng\"",
      "Chọn tệp JSON",
      "Đặt lại dữ liệu mẫu",
    ]);
  });

  it("translates the remaining visible English copy in Savings, Header and Investments", () => {
    expectNone(savings, [
      "Interest Preview",
      "Certificate Preview",
      "Emergency Fund Preview",
      "Savings Preview",
      "Savings Center",
    ]);
    expectAll(savings, [
      "Xem trước tiền lãi",
      "Xem trước chứng chỉ tiền gửi",
      "Xem trước quỹ khẩn cấp",
      "Xem trước tiết kiệm",
      "Trung tâm tiết kiệm",
    ]);

    expect(header).not.toContain("Realtime đang kết nối");
    expect(header).toContain("Đồng bộ thời gian thực đang kết nối");

    expect(investments).not.toContain("Hãy chạy migration SQL được cung cấp bên dưới.");
    expect(investments).toContain("Hãy chạy tập lệnh SQL cập nhật cơ sở dữ liệu được cung cấp bên dưới.");
    expect(investments).toContain("current_equity");
    expect(investments).toContain("forex_accounts");
  });

  it("keeps approved technical names while translating surrounding product copy", () => {
    for (const technical of ["OpenAI", "Supabase", "JSON", "Next.js", "Tailwind", "VND"]) {
      expect(settings).toContain(technical);
    }
  });
});
