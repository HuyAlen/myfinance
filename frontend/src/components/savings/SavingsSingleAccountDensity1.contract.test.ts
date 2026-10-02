import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-SINGLE-ACCOUNT-DENSITY-1", () => {
  it("adapts account-grid density for one, two, and many savings", () => {
    expect(source).toContain("data-savings-account-grid");
    expect(source).toContain("filteredSavings.length === 1");
    expect(source).toContain(
      '"md:grid-cols-1 md:place-items-center"',
    );
    expect(source).toContain("filteredSavings.length === 2");
    expect(source).toContain('"md:grid-cols-2 xl:grid-cols-2"');
    expect(source).toContain('"md:grid-cols-2 xl:grid-cols-3"');
  });

  it("makes the disabled Transfer action visibly disabled", () => {
    expect(source).toContain(
      "disabled:bg-slate-50 disabled:text-slate-300 disabled:opacity-100",
    );
    expect(source).toContain("disabled:cursor-not-allowed");
  });

  it("collapses zero-interest projections to one useful empty state", () => {
    expect(source).toContain("data-savings-zero-rate-projection");
    expect(source).toContain("savingsExperience.averageRate <= 0");
    expect(source).toContain("Chưa có lãi suất để dự phóng tăng trưởng");
  });

  it("uses a compact one-bucket allocation summary instead of a redundant 100% chart", () => {
    expect(source).toContain("data-savings-single-allocation");
    expect(source).toContain("savingsAnalytics.allocation.length === 1");
    expect(source).toContain("Toàn bộ số dư hiện nằm trong một loại khoản.");
    expect(source).toContain("100%");
  });

  it("marks internal transfers semantically in the recent timeline", () => {
    expect(source).toContain(
      "const isInternalTransfer = Boolean(transaction.transferReference);",
    );
    expect(source).toContain(
      'isInternalTransfer ? <ArrowLeftRight size={15} /> : getTransactionIcon(transaction.type)',
    );
    expect(source).toContain(
      'isInternalTransfer ? "Chuyển nội bộ · " : ""',
    );
    expect(source).toContain("bg-violet-50 text-violet-600");
  });

  it("does not change Savings Engine or wallet-transfer semantics", () => {
    expect(source).toContain("createSavingAccount({");
    expect(source).toContain("createSavingMovement({");
    expect(source).toContain("openInternalTransfer");
    expect(source).toContain("SavingsInternalTransferModal");
  });
});
