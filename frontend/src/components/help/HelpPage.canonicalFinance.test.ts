import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const help = readFileSync(path.resolve(__dirname, "HelpPage.tsx"), "utf8");
const calculations = readFileSync(
  path.resolve(__dirname, "../../services/finance/financeCalculations.ts"),
  "utf8",
);
const debts = readFileSync(
  path.resolve(__dirname, "../debts/DebtsPage.tsx"),
  "utf8",
);
const goals = readFileSync(
  path.resolve(__dirname, "../goals/GoalsPage.tsx"),
  "utf8",
);

/**
 * HELP-CANONICAL-FINANCE-1
 *
 * Help must describe the semantics the finance product actually uses instead
 * of reviving older formulas or marketing labels that have been retired.
 */
describe("HELP-CANONICAL-FINANCE-1 canonical cross-page guidance", () => {
  it("documents the same full balance-sheet composition used by finance calculations", () => {
    expect(calculations).toContain(
      "const totalAssets = cashAndWallets + savings + investments + forex;",
    );
    expect(help).toContain(
      "Net Worth = Ví tiền + Tiết kiệm + Portfolio + Forex − Tổng nợ",
    );
    expect(help).toContain("Số dư Ví không đồng nghĩa với Tổng tài sản");
    expect(help).not.toContain(
      "Net Worth = Tổng ví tiền + Đầu tư − Tổng nợ",
    );
  });

  it("keeps debt/assets ratio separate from monthly debt-service-to-income", () => {
    expect(debts).toContain("calculateBalanceSheetSnapshot({");
    expect(debts).toContain("debt.minimumPayment");
    expect(help).toContain(
      "Debt Ratio = Tổng dư nợ ÷ Tổng tài sản × 100%",
    );
    expect(help).toContain("Debt service / income");
    expect(help).toContain("minimum payment");
    expect(help).not.toContain(
      "Debt Ratio = Tổng nợ ÷ Thu nhập tháng × 100%",
    );
    expect(help).not.toContain("AI Debt Coach");
  });

  it("documents stable completed-month emergency coverage instead of partial-month inflation", () => {
    expect(help).toContain("tối đa 6 tháng đã hoàn tất");
    expect(help).toContain(
      "Số tháng quỹ khẩn cấp = Số dư quỹ ÷ Chi tiêu thực bình quân các tháng đã hoàn tất",
    );
    expect(help).toContain("tháng hiện tại đang chạy dở");
  });

  it("describes Goal progress as a funding snapshot that can include linked Savings", () => {
    expect(goals).toContain("calculateGoalFundingSnapshot({");
    expect(help).toContain("canonical funding snapshot");
    expect(help).toContain("Liên kết đúng tài khoản Savings");
    expect(help).not.toContain("AI Goal Coach");
  });

  it("documents the unified Portfolio + Forex investment domain", () => {
    expect(help).toContain('title: "Đầu Tư · Portfolio & Forex"');
    expect(help).toContain("Dùng 'Thêm Forex'");
    expect(help).toContain("Portfolio + Forex");
    expect(help).not.toContain('title: "Đầu Tư · Danh mục"');
  });

  it("keeps real expense separate from transfers and future allocations", () => {
    expect(help).toContain("Transfer nội bộ không tạo thêm expense");
    expect(help).toContain("Savings/Investment allocation được theo dõi riêng");
    expect(help).toContain("chi tiêu thực");
  });

  it("removes universal investment-return and canned allocation claims", () => {
    expect(help).not.toContain("VN-Index trung bình");
    expect(help).not.toContain("ROI ≥ 10%/năm");
    expect(help).not.toContain("40% cổ phiếu Việt");
    expect(help).toContain("không có một tỷ lệ mẫu đúng cho tất cả");
  });

  it("does not accidentally absorb the separate onboarding or search UX packages", () => {
    expect(help).toContain('localStorage.getItem("mf-checklist")');
    expect(help).toContain('localStorage.setItem("mf-checklist"');
    expect(help).toContain("search.toLowerCase()");
  });
});
