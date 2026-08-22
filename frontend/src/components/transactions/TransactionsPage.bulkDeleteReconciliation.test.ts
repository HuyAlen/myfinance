import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-BULKDELETE-1 — Bulk-Delete Partial-Failure State Reconciliation.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * The Final Re-Audit found that each `deleteTransaction`/
 * `deleteForexCashTransaction` call in `handleBulkDelete` is its own
 * independently-committed RPC (the batch is NOT one atomic DB transaction).
 * The pre-fix handler returned immediately on the first failure, before
 * calling `runReload()` or reconciling `selectedIds` — so if items before
 * the failure had already succeeded, the database and the visible UI
 * diverged (deleted rows stayed visible/selected) until some unrelated
 * trigger (navigation, a realtime debounce, a manual refresh) happened to
 * reload later. This suite proves the fixed handler always reconciles
 * against the database whenever at least one delete actually committed.
 */
describe("handleBulkDelete outcome tracking (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");

  it("locates the handler", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  const fnSource = source.slice(start, end);

  it("tracks succeeded ids and a failure message as handler-local variables, not new React state", () => {
    expect(fnSource).toContain("const succeededIds: string[] = [];");
    expect(fnSource).toContain("let failureMessage: string | null = null;");
    // No new useState was introduced to track loop progress.
    expect(fnSource).not.toContain("useState");
  });

  it("both the normal-transaction and Forex-cash branches push onto succeededIds on success and set failureMessage + break (not an early return) on failure", () => {
    const forexBranchStart = fnSource.indexOf("isForexUnifiedTransaction(unifiedTransaction)");
    const forexBranchEnd = fnSource.indexOf("const transaction = transactions.find(");
    expect(forexBranchStart).toBeGreaterThan(-1);
    expect(forexBranchEnd).toBeGreaterThan(forexBranchStart);
    const forexBranch = fnSource.slice(forexBranchStart, forexBranchEnd);
    expect(forexBranch).toContain('failureMessage = "Lỗi xóa giao dịch Forex: " + error;');
    expect(forexBranch).toContain("break;");
    expect(forexBranch).toContain("succeededIds.push(id);");
    expect(forexBranch).not.toContain("return;");

    const normalBranchStart = forexBranchEnd;
    const normalBranchEnd = fnSource.indexOf(
      "// At least one delete actually committed",
    );
    expect(normalBranchEnd).toBeGreaterThan(normalBranchStart);
    const normalBranch = fnSource.slice(normalBranchStart, normalBranchEnd);
    expect(normalBranch).toContain('failureMessage = "Lỗi xóa giao dịch: " + error;');
    expect(normalBranch).toContain("break;");
    expect(normalBranch).toContain("succeededIds.push(id);");
    expect(normalBranch).not.toContain("return;");
  });

  it("no early return exists anywhere inside the delete loop — every failure path falls through to the shared reconciliation step", () => {
    const loopStart = fnSource.indexOf("for (const id of idsToDelete) {");
    const loopEnd = fnSource.indexOf(
      "// At least one delete actually committed",
    );
    expect(loopStart).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(loopStart);
    const loopSource = fnSource.slice(loopStart, loopEnd);
    expect(loopSource).not.toContain("return;");
  });
});

describe("authoritative reconciliation is mandatory whenever at least one delete committed (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("reload and selection pruning are gated on succeededIds.length > 0, not on full-batch success", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = fnSource.indexOf("if (failureMessage) {", gateIdx);
    expect(gateEnd).toBeGreaterThan(gateIdx);
    const gateSource = fnSource.slice(gateIdx, gateEnd);

    expect(gateSource).toContain("await runReload();");
    expect(gateSource).toContain("setSelectedIds((prev) => {");

    // A future regression reintroducing an unconditional early return before
    // this block (the exact pre-fix bug) would make this index -1.
    const reloadIdx = fnSource.indexOf("await runReload();");
    expect(reloadIdx).toBeGreaterThan(gateIdx);
  });

  it("selected ids are pruned via a functional setSelectedIds update, not a plain new Set() clear — safe even if selection could change while the dialog is open", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    const gateEnd = fnSource.indexOf("if (failureMessage) {", gateIdx);
    const gateSource = fnSource.slice(gateIdx, gateEnd);

    expect(gateSource).toContain("const succeededSet = new Set(succeededIds);");
    expect(gateSource).toContain("const next = new Set(prev);");
    expect(gateSource).toContain(
      "for (const succeededId of succeededSet) next.delete(succeededId);",
    );
  });

  it("zero-success failures (first item fails immediately) skip reload/selection-pruning entirely — current behavior for this case is intentionally preserved, not broadened into a general auto-reload-on-conflict fix", () => {
    const gateIdx = fnSource.indexOf("if (succeededIds.length > 0) {");
    const gateEnd = fnSource.indexOf("}\n\n        if (failureMessage) {", gateIdx);
    expect(gateEnd).toBeGreaterThan(gateIdx);
    // Confirms the reload/prune block is a single conditional, not something
    // also reachable via a separate zero-success branch.
    const afterGate = fnSource.slice(gateEnd, fnSource.indexOf("},", gateEnd));
    const reloadCount = afterGate.split("runReload()").length - 1;
    expect(reloadCount).toBe(0);
  });
});

describe("feedback never claims full success on a partial failure (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("partial success (succeededIds.length > 0 AND a failure) shows a distinct partial message naming both the succeeded count and the remaining count, not the plain all-success toast", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    expect(failureBlockStart).toBeGreaterThan(-1);
    const failureBlockEnd = fnSource.indexOf("toast({ variant: \"success\"", failureBlockStart);
    expect(failureBlockEnd).toBeGreaterThan(failureBlockStart);
    const failureBlock = fnSource.slice(failureBlockStart, failureBlockEnd);

    expect(failureBlock).toContain("const remaining = count - succeededIds.length;");
    expect(failureBlock).toContain(
      "`Đã xóa ${succeededIds.length} giao dịch. Không thể xóa ${remaining} giao dịch còn lại: ${failureMessage}`",
    );
    expect(failureBlock).toContain("return;");
  });

  it("zero-success failure falls back to the plain failure message (no false '0 succeeded' phrasing)", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    const failureBlockEnd = fnSource.indexOf("toast({ variant: \"success\"", failureBlockStart);
    const failureBlock = fnSource.slice(failureBlockStart, failureBlockEnd);

    expect(failureBlock).toContain("succeededIds.length > 0");
    expect(failureBlock).toContain(": failureMessage,");
  });

  it("the success toast is only reached when failureMessage is falsy (the `return;` inside the failure block prevents fallthrough)", () => {
    const failureBlockStart = fnSource.indexOf("if (failureMessage) {");
    const successToastIdx = fnSource.indexOf(
      "toast({ variant: \"success\", message: `Đã xóa ${count} giao dịch.` });",
    );
    expect(successToastIdx).toBeGreaterThan(failureBlockStart);

    const returnIdx = fnSource.lastIndexOf("return;", successToastIdx);
    expect(returnIdx).toBeGreaterThan(failureBlockStart);
    expect(returnIdx).toBeLessThan(successToastIdx);
  });
});

describe("normal + Forex cash outcome tracking shares one reconciliation path (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = source.indexOf("function handleBulkDelete() {");
  const end = source.indexOf("function exportCSV() {");
  const fnSource = source.slice(start, end);

  it("both deleteForexCashTransaction and deleteTransaction push onto the SAME succeededIds array — exactly two push sites", () => {
    const occurrences = fnSource.split("succeededIds.push(id);").length - 1;
    expect(occurrences).toBe(2);
  });

  it("only one reconciliation block exists (one runReload call, one setSelectedIds prune) regardless of which branch failed", () => {
    const reloadOccurrences = fnSource.split("await runReload();").length - 1;
    const setSelectedIdsOccurrences =
      fnSource.split("setSelectedIds((prev) => {").length - 1;
    expect(reloadOccurrences).toBe(1);
    expect(setSelectedIdsOccurrences).toBe(1);
  });
});

describe("no regression to delete atomicity, single delete, or ConfirmDialog guard (TXN-BULKDELETE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("handleDelete (single delete) is untouched — still reloads unconditionally on its own success path", () => {
    const start = source.indexOf("function handleDelete(id: string) {");
    const end = source.indexOf("function clearFilters() {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("await deleteTransaction(id);");
    expect(fnSource).toContain(
      'toast({ variant: "success", message: "Đã xóa giao dịch thành công." });',
    );
    expect(fnSource).toContain("await runReload();");
    // Single delete does not use the new outcome-tracking variables —
    // confirms no shared-helper coupling was introduced between the two
    // handlers.
    expect(fnSource).not.toContain("succeededIds");
  });

  it("does not add a new deleteTransaction/deleteForexCashTransaction call site — bulk delete still reuses the existing single-item storage calls", () => {
    for (const fn of ["deleteTransaction(", "deleteForexCashTransaction("]) {
      const occurrences = source.split(fn).length - 1;
      // One call site inside handleDelete, one inside handleBulkDelete.
      expect(occurrences).toBe(2);
    }
  });

  it("bulk delete is still only invoked through the shared pendingAction/ConfirmDialog flow — no separate unguarded delete path", () => {
    const start = source.indexOf("function handleBulkDelete() {");
    const end = source.indexOf("function exportCSV() {");
    const fnSource = source.slice(start, end);
    expect(fnSource).toContain("setPendingAction({");
    expect(fnSource).toContain("onConfirm: async () => {");
  });
});
