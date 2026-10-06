import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "InvestmentsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("INVESTMENT-CAPITAL-FLOW-SSOT-1 InvestmentsPage adoption", () => {
  it("loads canonical Portfolio capital history alongside the existing investment snapshot", () => {
    expect(source).toContain("getInvestmentCapitalMovements()");
    expect(source).toContain("setCapitalMovements(data.capitalMovements)");
    expect(source).toContain('"transactions",');
  });

  it("exposes explicit Nạp vốn / Rút vốn actions owned by Investments", () => {
    expect(source).toContain('openPortfolioCapitalMovement(investment, "deposit")');
    expect(source).toContain('openPortfolioCapitalMovement(investment, "withdraw")');
    expect(source).toContain("createInvestmentCapitalMovement({");
    expect(source).toContain(
      "<ArrowDownToLine size={15} />\n                        Nạp vốn",
    );
    expect(source).toContain(
      "<ArrowUpFromLine size={15} />\n                        Rút vốn",
    );
  });

  it("shows selected-period capital metrics plus recent canonical history per Portfolio asset", () => {
    expect(source).toContain("periodPortfolioCapitalMovements");
    expect(source).toContain("portfolioCapitalByInvestmentId");
    expect(source).toContain("portfolioCapitalHistoryByInvestmentId");
    expect(source).toContain("Dòng vốn {filterLabel}");
    expect(source).toContain("Lịch sử gần đây");
  });

  it("treats pre-ledger principal as opening balance and locks direct principal editing after history starts", () => {
    expect(source).toContain("portfolioFormHasCapitalHistory");
    expect(source).toContain(
      "Được quản lý bởi lịch sử Nạp vốn / Rút vốn và không thể sửa trực tiếp.",
    );
    expect(source).toContain('label={portfolioForm.id ? "Vốn đầu tư *" : "Vốn mở đầu *"}');
    expect(source).toContain(
      "Vốn mở đầu dùng để nhập tài sản đã có trước khi theo dõi dòng vốn.",
    );
  });

  it("keeps Wallet insufficiency and Investment insufficiency preflight visible before the RPC", () => {
    expect(source).toContain("wallet.balance < amount");
    expect(source).toContain("investment.investedAmount < amount");
    expect(source).toContain("investment.currentValue < amount");
  });
});