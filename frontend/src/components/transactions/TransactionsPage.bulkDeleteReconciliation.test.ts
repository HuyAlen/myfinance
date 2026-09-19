import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-BULKDELETE-1 — Bulk-Delete Partial-Failure State Reconciliation.
 * Forex cash rows are intentionally absent from TransactionsPage; destructive
 * Forex actions live exclusively in Investments. This suite preserves the
 * ordinary transaction reconciliation guarantees after that ownership split.
 */
describe("handleBulkDelete outcome tracking (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("locates the handler", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("tracks succeeded ids and a failure message as handler-local variables", () => {
    expect(fnSource).toContain("const succeededIds: string[] = [];");
    expect(fnSource).toContain("let failureMessage: string | null = null;");
    expect(fnSource).not.toContain("useState");
  });

  it("ordinary transaction success/failure uses the shared outcome tracker", () => {
    const loopStart = fnSource.indexOf("for (const id of idsToDelete) {");
    const loopEnd = fnSource.indexOf("// At least one delete actually committed");
    const loopSource = fnSource.slice(loopStart, loopEnd);
    expect(loopSource).toContain("const transaction = transactions.find(");
    expect(loopSource).toContain("await deleteTransaction(id);");
    expect(loopSource).toContain('failureMessage = "Lỗi xóa giao dịch: " + error;');
    expect(loopSource).toContain("break;");
    expect(loopSource).toContain("succeededIds.push(id);");
    expect(loopSource).not.toContain("deleteForexCashTransaction");
  });

  it("no early return exists anywhere inside the delete loop", () => {
    const loopStart = fnSource.indexOf("for (const id of idsToDelete) {");
    const loopEnd = fnSource.indexOf("// At least one delete actually committed");
    expect(loopStart).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(loopStart);
    expect(fnSource.slice(loopStart, loopEnd)).not.toContain("return;");
  });
});

describe("authoritative reconciliation after partial delete", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("reload and selection pruning are gated on succeededIds.length > 0", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    const gateEnd = fnSource.indexOf("if (failureMessage) {", gateIdx);
    const gateSource = fnSource.slice(gateIdx, gateEnd);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateIdx);
    expect(gateSource).toContain("await runReload();");
    expect(gateSource).toContain("setSelectedIds((prev) => {");
  });

  it("selected ids are pruned with a functional Set update", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    const gateEnd = fnSource.indexOf("if (failureMessage) {", gateIdx);
    const gateSource = fnSource.slice(gateIdx, gateEnd);
    expect(gateSource).toContain("const succeededSet = new Set(succeededIds);");
    expect(gateSource).toContain("const next = new Set(prev);");
    expect(gateSource).toContain(
      "for (const succeededId of succeededSet) next.delete(succeededId);",
    );
  });

  it("zero-success failures do not enter the reload/prune block", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    const gateEnd = fnSource.indexOf("}\n\n        if (failureMessage) {", gateIdx);
    expect(gateEnd).toBeGreaterThan(gateIdx);
    const afterGate = fnSource.slice(gateEnd, fnSource.indexOf("},", gateEnd));
    expect(afterGate.split("runReload()").length - 1).toBe(0);
  });
});

describe("feedback never claims full success on partial failure", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("partial success names both succeeded and remaining counts", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    const failureBlockEnd = fnSource.indexOf('toast({ variant: "success"', failureBlockStart);
    const failureBlock = fnSource.slice(failureBlockStart, failureBlockEnd);
    expect(failureBlock).toContain("const remaining = count - succeededIds.length;");
    expect(failureBlock).toContain(
      "`Đã xóa ${succeededIds.length} giao dịch. Không thể xóa ${remaining} giao dịch còn lại: ${failureMessage}`",
    );
  });

  it("zero-success failure falls back to the plain failure message", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    const failureBlockEnd = fnSource.indexOf('toast({ variant: "success"', failureBlockStart);
    const failureBlock = fnSource.slice(failureBlockStart, failureBlockEnd);
    expect(failureBlock).toContain("succeededIds.length > 0");
    expect(failureBlock).toContain(": failureMessage,");
  });

  it("failure block returns before the all-success toast", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    const successToastIdx = fnSource.indexOf(
      'toast({ variant: "success", message: `Đã xóa ${count} giao dịch.` });',
    );
    expect(successToastIdx).toBeGreaterThan(failureBlockStart);
    const returnIdx = fnSource.lastIndexOf("return;", successToastIdx);
    expect(returnIdx).toBeGreaterThan(failureBlockStart);
    expect(returnIdx).toBeLessThan(successToastIdx);
  });
});

describe("ordinary delete path shares one reconciliation boundary", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("has exactly one succeededIds push site", () => {
    expect(fnSource.split("succeededIds.push(id);").length - 1).toBe(1);
  });

  it("has one reload and one selection-prune reconciliation block", () => {
    expect(fnSource.split("await runReload();").length - 1).toBe(1);
    expect(fnSource.split("setSelectedIds((prev) => {").length - 1).toBe(1);
  });
});

describe("single delete and ConfirmDialog guard remain intact", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("single delete still reloads unconditionally after success", () => {
    const start = source.indexOf("function handleDelete(id: string) {");
    const end = source.indexOf("function clearFilters() {");
    const fnSource = source.slice(start, end);
    expect(fnSource).toContain("await deleteTransaction(id);");
    expect(fnSource).toContain(
      'toast({ variant: "success", message: "Đã xóa giao dịch thành công." });',
    );
    expect(fnSource).toContain("await runReload();");
    expect(fnSource).not.toContain("succeededIds");
  });

  it("deleteTransaction has one single-delete and one bulk-delete call site", () => {
    expect(source.split("deleteTransaction(").length - 1).toBe(2);
    expect(source).not.toContain("deleteForexCashTransaction(");
  });

  it("bulk delete remains guarded by pendingAction/ConfirmDialog", () => {
    const start = source.indexOf("function handleBulkDelete() {");
    const end = source.indexOf("function exportCSV() {");
    const fnSource = source.slice(start, end);
    expect(fnSource).toContain("setPendingAction({");
    expect(fnSource).toContain("onConfirm: async () => {");
  });
});