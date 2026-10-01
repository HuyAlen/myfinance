import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WALLET-RECONCILIATION-1 WalletsPage wiring", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("separates wallet identity editing from balance reconciliation", () => {
    expect(source).toContain("function openReconcileForm(wallet: SpendableWallet) {");
    expect(source).toContain("async function handleReconcileSubmit(event: React.FormEvent) {");
    expect(source).toContain("await reconcileWalletBalance({");
    expect(source).toContain("expectedBalance: reconcileTarget.balance");
    expect(source).toContain("actualBalance");
  });

  it("does not create a transaction while reconciling a wallet", () => {
    const start = source.indexOf(
      "async function handleReconcileSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf("\n  async function handleSubmit(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const reconciliationSource = source.slice(start, end);

    expect(reconciliationSource).toContain("reconcileWalletBalance({");
    expect(reconciliationSource).not.toContain("addTransaction(");
    expect(reconciliationSource).not.toContain("updateTransaction(");
    expect(reconciliationSource).not.toContain("type: \"income\"");
    expect(reconciliationSource).not.toContain("type: \"expense\"");
  });

  it("fails closed on a concurrent balance change and reloads authoritative data", () => {
    expect(source).toContain('result.code === "conflict"');
    expect(source).toContain("await runReload();");
    expect(source).toContain(
      "Số dư ví vừa thay đổi ở nơi khác. Dữ liệu đã được tải lại; hãy mở Đối soát và thử lại.",
    );
  });

  it("shows before, actual and delta while explaining reporting semantics", () => {
    expect(source).toContain("Số dư MyFinance");
    expect(source).toContain("Số dư thực tế");
    expect(source).toContain("Chênh lệch");
    expect(source).toContain(
      "Đối soát không tạo giao dịch Thu/Chi/Chuyển tiền",
    );
    expect(source).toContain("số dư trước/sau và người thực hiện");
    expect(source).toContain('href="/activity"');
  });

  it("exposes reconciliation from every wallet card and suppresses global FABs while open", () => {
    expect(source).toContain('aria-label={`Đối soát số dư ${wallet.name}`}');
    expect(source).toContain("onClick={() => openReconcileForm(wallet)}");
    expect(source).toContain("!!reconcileTarget");
  });
});
