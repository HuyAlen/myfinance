import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-FLOW-1 — Delete/Bulk-Delete Re-Entry Protection.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). ConfirmDialog is shared across every
 * delete/bulk-delete confirmation in the app (Transactions, Wallets,
 * Categories, Budgets, Goals, Debts, ...), so a double-click-on-Confirm
 * re-entry guard added here protects all of them from a single fix,
 * rather than duplicating the guard in each page's own delete handler.
 *
 * Before this fix, the confirm button had no disabled state at all — a
 * rapid double-click could fire `action.onConfirm()` twice concurrently
 * (e.g. two deleteTransaction(id) calls for the same row).
 */
describe("ConfirmDialog re-entry guard (TXN-FLOW-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "ConfirmDialog.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("tracks an isConfirming ref for a synchronous, same-tick re-entry check", () => {
    expect(source).toContain("const isConfirmingRef = useRef(false);");
    expect(normalized).toContain("if (isConfirmingRef.current) return;");
  });

  it("handleConfirm sets the guard before awaiting action.onConfirm(), and releases it in finally", () => {
    const start = source.indexOf("async function handleConfirm() {");
    const end = source.indexOf("return (", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    const setTrueIdx = fnSource.indexOf("isConfirmingRef.current = true;");
    const awaitIdx = fnSource.indexOf("await action!.onConfirm();");
    const setFalseIdx = fnSource.indexOf("isConfirmingRef.current = false;");
    expect(setTrueIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeGreaterThan(setTrueIdx);
    expect(setFalseIdx).toBeGreaterThan(awaitIdx);

    // The guard release and dialog close both live in `finally`, so they
    // run whether onConfirm succeeds or the caller's own error handling
    // swallows a failure (handleDelete never throws — it toasts and
    // returns), not just on the happy path.
    const finallyIdx = fnSource.indexOf("} finally {");
    expect(finallyIdx).toBeGreaterThan(-1);
    expect(setFalseIdx).toBeGreaterThan(finallyIdx);
    expect(fnSource.indexOf("onCancel();", finallyIdx)).toBeGreaterThan(
      finallyIdx,
    );
  });

  it("both Cancel and Confirm buttons are disabled while confirming (Model A — a confirm dialog isn't a data-entry form worth letting the user detach from mid-write)", () => {
    const start = source.indexOf('<div className="mt-6 flex justify-end');
    const end = source.indexOf("</div>\n      </div>\n    </div>", start);
    expect(start).toBeGreaterThan(-1);
    const buttonsSource = source.slice(start, end === -1 ? undefined : end);

    const occurrences =
      buttonsSource.split("disabled={isConfirming}").length - 1;
    expect(occurrences).toBe(2);
  });

  it("the confirm button shows a loading label while confirming, reusing existing copy conventions", () => {
    expect(normalized).toContain(
      '{isConfirming ? "Đang xử lý..." : action.confirmText || "Xác nhận"}',
    );
  });

  it("no useEffect was added to synchronize the guard — it is set/cleared directly inside the event handler", () => {
    expect(source).not.toContain("useEffect");
  });
});
