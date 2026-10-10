import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletReconciliationCenter.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const detailStart = source.indexOf('id="wallet-reconciliation-details"');
const detailEnd = source.indexOf("{isHistoryLoading ? (", detailStart);
const detailArea = source.slice(detailStart, detailEnd);

describe("WALLET-RECONCILIATION-COLLAPSE-1", () => {
  it("starts collapsed and preserves visible wallet coverage summary", () => {
    expect(source).toContain("const [isWalletStatusExpanded, setIsWalletStatusExpanded] = useState(false);");
    expect(source).toContain('data-wallet-reconciliation-status-section="true"');
    expect(source).toContain("`${reconciledCount}/${wallets.length} ví đã đối soát · không cần xử lý`");
    expect(source).toContain("`${neverReconciled.length} chưa đối soát · ${needsReview.length} cần kiểm tra lại`");
  });

  it("exposes a keyboard-accessible expandable control and retains its target", () => {
    expect(source).toContain('aria-expanded={isWalletStatusExpanded}');
    expect(source).toContain('aria-controls="wallet-reconciliation-details"');
    expect(source).toContain('onClick={() => setIsWalletStatusExpanded((expanded) => !expanded)}');
    expect(source).toContain('id="wallet-reconciliation-details"');
    expect(source).toContain('hidden={!isWalletStatusExpanded}');
    expect(source).toContain('"Thu gọn" : `Xem chi tiết (${wallets.length})`');
  });

  it("preserves status filters and every wallet reconciliation action in the panel", () => {
    expect(detailStart).toBeGreaterThan(-1);
    expect(detailEnd).toBeGreaterThan(detailStart);
    expect(detailArea).toContain("{statusFilters.map((item) => (");
    expect(detailArea).toContain("aria-pressed={filter === item.value}");
    expect(detailArea).toContain("onClick={() => setFilter(item.value)}");
    expect(detailArea).toContain("{orderedRows.map(({ wallet, receipt, status }) => (");
    expect(detailArea).toContain("onClick={() => onReconcile(wallet)}");
    expect(detailArea).toContain('aria-label={`Đối soát số dư ${wallet.name}`}');
  });

  it("keeps the detailed rows compact without removing status explanations", () => {
    expect(detailArea).toContain("gap-x-2 gap-y-1");
    expect(detailArea).toContain("px-3 py-2 sm:px-4 sm:py-2.5");
    expect(detailArea).toContain("walletReconciliationStatusLabels[status]");
    expect(detailArea).toContain("receipt.balanceRevision == null");
    expect(detailArea).toContain("biến động số dư MyFinance hoặc biên nhận cũ");
  });

  it("does not hide data errors, priority reconciliation, or independent receipt history", () => {
    expect(source).toContain("const reconciliationDataReady = !isLoading && !error;");
    expect(source).toContain("onClick={() => onReconcile(reconciliationPriorityWallet)}");
    expect(source).toContain("Không thể xác định trạng thái đối soát.");
    expect(source).toContain("{isHistoryLoading ? (");
    expect(source).toContain("historyRecords.slice(0, 5).map");
  });
});
