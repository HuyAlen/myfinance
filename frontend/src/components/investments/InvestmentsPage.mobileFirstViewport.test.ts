import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/investments/InvestmentsPage.tsx"),
  "utf8",
);

function regionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("InvestmentsPage iPhone hierarchy and action ergonomics (INVESTMENTS-MOBILE-POLISH-1)", () => {
  it("uses a compact soft-blue mobile hero instead of the previous heavy dark hierarchy", () => {
    expect(source).toContain('text-[22px] font-bold tracking-tight text-[#36536B]');
    expect(source).toContain("Quản lý Portfolio và Forex trong cùng một không gian đầu tư.");
    expect(source).not.toContain("Forex Management");
  });

  it("keeps Portfolio and Forex creation on one compact mobile row with a 44px refresh target", () => {
    expect(source).toContain('grid grid-cols-[44px_1fr_1fr] gap-2');
    expect(source).toContain('aria-label="Làm mới dữ liệu đầu tư"');
    expect(source).toContain("Thêm tài sản");
    expect(source).toContain("Thêm Forex");
  });

  it("turns the six summary cards into a horizontal snap rail on phones", () => {
    expect(source).toContain("snap-x snap-proximity");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("scrollbar-none");
    expect(source).toContain('w-[168px] shrink-0 snap-start');
  });

  it("does not truncate summary, account KPI, or tiny cash metric values", () => {
    const summaryCard = regionBetween("function SummaryCard({", "function Metric({");
    const metric = regionBetween("function Metric({", "function TinyMetric(");
    const tinyMetric = regionBetween("function TinyMetric(", "function Field(");

    expect(summaryCard).toContain("whitespace-nowrap");
    expect(metric).toContain("whitespace-nowrap");
    expect(tinyMetric).toContain("whitespace-nowrap");
    expect(summaryCard).not.toContain("truncate");
    expect(metric).not.toContain("truncate");
    expect(tinyMetric).not.toContain("truncate");
  });

  it("keeps long account names readable rather than ellipsizing them", () => {
    expect(source).toContain("min-w-0 break-words text-[15px]");
    expect(source).not.toContain('className="truncate text-base font-black text-slate-950"');
  });

  it("localizes account statuses instead of exposing raw storage enums", () => {
    expect(source).toContain('if (status === "active") return "Đang hoạt động"');
    expect(source).toContain('if (status === "inactive") return "Tạm ngưng"');
    expect(source).toContain('return "Đã lưu trữ"');
    expect(source).toContain("getAccountStatusLabel(account.status)");
  });

  it("provides iPhone-size edit and delete touch targets on account cards", () => {
    expect(source).toContain('aria-label={`Sửa ${account.name}`}');
    expect(source).toContain('aria-label={`Xóa ${account.name}`}');
    expect(source).toContain("flex size-11 items-center justify-center");
  });

  it("keeps value update, deposit, and withdrawal as one three-action row", () => {
    const start = source.indexOf('{account.transactionCount} giao dịch');
    const end = source.indexOf("</article>", start);
    const cardFooter = source.slice(start, end);

    expect(cardFooter).toContain("grid grid-cols-3 gap-2");
    expect(cardFooter).toContain("Nhập giá trị");
    expect(cardFooter).toContain("Cập nhật");
    expect(cardFooter).toContain("Nạp");
    expect(cardFooter).toContain("Rút");
    expect(cardFooter).toContain("min-h-11");
  });

  it("uses Vietnamese section labels for accounts and cash-flow history", () => {
    expect(source).toContain("Danh mục đầu tư");
    expect(source).toContain("Dòng tiền");
    expect(source).not.toContain("Cash Flow History");
    expect(source).not.toContain("\n              Accounts\n");
  });

  it("keeps transaction metadata readable and removes the prior mobile ellipsis", () => {
    expect(source).toContain('break-words text-[11px] leading-4 text-[#687E93]');
    expect(source).not.toContain('mt-0.5 truncate text-xs text-slate-500');
  });

  it("uses 44px touch targets for transaction edit and delete controls", () => {
    expect(source).toContain('aria-label="Sửa giao dịch Forex"');
    expect(source).toContain('aria-label="Xóa giao dịch Forex"');
    expect(source).toContain("size-11 items-center justify-center rounded-xl");
  });

  it("uses a full-height mobile modal with safe-area-aware header and actions", () => {
    const modal = regionBetween("function Modal({", "function SummaryCard({");
    const formActionsStart = source.indexOf("function FormActions({");
    const formActions = source.slice(formActionsStart);

    expect(modal).toContain("h-dvh");
    expect(modal).not.toContain("h-[92dvh]");
    expect(modal).toContain("env(safe-area-inset-top)");
    expect(formActions).toContain("env(safe-area-inset-bottom)");
  });

  it("preserves correctness-1 recovery and atomic-delete contracts", () => {
    expect(source).toContain("delete_forex_account_atomic");
    expect(source).toContain("withInvestmentDomainLoadTimeout");
    expect(source).toContain("INVESTMENT_DOMAIN_LOAD_TIMEOUT_MS");
    expect(source).toContain('window.addEventListener("online"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('account.status !== "archived"');
  });
});
