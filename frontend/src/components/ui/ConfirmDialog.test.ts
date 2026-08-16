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

  it("the re-entry guard itself is set/cleared directly inside handleConfirm, not synchronized via an effect (TXN-UX-1 later adds an unrelated useEffect for Escape/focus support, scoped to the Escape/initial-focus concern only)", () => {
    const start = source.indexOf("async function handleConfirm() {");
    const end = source.indexOf("return (", start);
    const fnSource = source.slice(start, end);
    expect(fnSource).not.toContain("useEffect");
  });
});

/**
 * TXN-UX-1 — ConfirmDialog Dialog Semantics & Escape (F-12).
 *
 * Shared across 7 consumer pages (Budgets, Categories, Debts, Goals,
 * Investments, Settings, Transactions) — every addition here must remain
 * purely additive (ARIA attributes, an Escape listener, a focus ref) so
 * none of those callers need any change.
 */
describe("ConfirmDialog dialog semantics and Escape (TXN-UX-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "ConfirmDialog.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("the panel exposes role=dialog, aria-modal=true, and is labelled by the visible title via a stable useId()", () => {
    expect(source).toContain("const titleId = useId();");
    expect(normalized).toContain('role="dialog"');
    expect(normalized).toContain('aria-modal="true"');
    expect(normalized).toContain("aria-labelledby={titleId}");
    expect(normalized).toContain('<h3 id={titleId}');
  });

  it("Escape is installed only while a confirmation is pending (keyed on `action`) and cleaned up on close", () => {
    const start = source.indexOf("if (!action) return;");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [action]);", start);
    expect(end).toBeGreaterThan(start);
    const effectSource = source.slice(start, end);

    expect(effectSource).toContain('if (event.key !== "Escape") return;');
    expect(normalized).toContain('document.addEventListener("keydown", handleKeyDown);');
    expect(normalized).toContain(
      'return () => document.removeEventListener("keydown", handleKeyDown);',
    );
  });

  it("Escape while idle behaves like Cancel (calls the latest onCancel via a ref, never a stale closure)", () => {
    const start = source.indexOf("if (!action) return;");
    const end = source.indexOf("}, [action]);", start);
    const effectSource = source.slice(start, end);
    expect(effectSource).toContain("onCancelRef.current();");
  });

  it("Escape while isConfirming is ignored — cannot bypass the already-disabled Cancel/Confirm buttons mid-mutation", () => {
    const start = source.indexOf("if (!action) return;");
    const end = source.indexOf("}, [action]);", start);
    const effectSource = source.slice(start, end);

    const guardIdx = effectSource.indexOf("if (isConfirmingRef.current) return;");
    const cancelCallIdx = effectSource.indexOf("onCancelRef.current();");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(cancelCallIdx).toBeGreaterThan(guardIdx);
  });

  it("the onCancel ref is refreshed in its own effect, not mutated during render (react-hooks/refs safety)", () => {
    const start = source.indexOf("const onCancelRef = useRef(onCancel);");
    expect(start).toBeGreaterThan(-1);
    const nextRegion = source.slice(start, start + 120);
    const normalizedRegion = nextRegion.replace(/\s+/g, " ");
    expect(normalizedRegion).toContain(
      "useEffect(() => { onCancelRef.current = onCancel; });",
    );
  });

  it("initial focus lands on the dialog panel (tabIndex={-1}), not automatically on the destructive Confirm button", () => {
    expect(source).toContain("const panelRef = useRef<HTMLDivElement>(null);");
    expect(source).toContain("panelRef.current?.focus();");
    expect(normalized).toContain("ref={panelRef}");
    expect(normalized).toContain("tabIndex={-1}");
  });
});
