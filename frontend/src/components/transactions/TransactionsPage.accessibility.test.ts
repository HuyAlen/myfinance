import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-UX-1 — Accessible Names & CRUD Dialog Semantics (F-11/F-12).
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * The Transactions Page Full Audit specifically found zero accessible
 * name on the modal close button and the Timeline-view row Edit/Delete
 * buttons, plus a handful of icon-only controls relying on `title` alone
 * (a weaker, less consistently-surfaced accessible name than `aria-label`
 * — see the mobile swipe controls, which already got this right pre-TXN-UX-1
 * and served as the established convention followed
 * here). It also found the Create/Edit modal had no `role="dialog"`,
 * `aria-modal`, or Escape/focus handling.
 */
describe("Icon-only control accessible names (F-11)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("modal close button has an accessible name (previously had none)", () => {
    const start = source.indexOf('onClick={() => setIsFormOpen(false)}');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("</button>", start);
    expect(source.slice(start, end)).toContain('aria-label="Đóng"');
  });

  it('search field and its clear button have accessible names ("Tìm kiếm giao dịch" / "Xóa tìm kiếm")', () => {
    expect(source).toContain('aria-label="Tìm kiếm giao dịch"');
    expect(source).toContain('aria-label="Xóa tìm kiếm"');
  });

  it("every remaining Edit/Delete row-action pair (swipe, desktop, Timeline) has an accessible name — 3 Edit + 3 Delete occurrences", () => {
    const editOccurrences =
      source.split('aria-label="Sửa giao dịch"').length - 1;
    const deleteOccurrences =
      source.split('aria-label="Xóa giao dịch"').length - 1;
    expect(editOccurrences).toBe(3);
    expect(deleteOccurrences).toBe(3);
  });

  it("Timeline-view row Edit/Delete specifically had ZERO accessible name before this fix — regression-proof it independent of the other row-action locations", () => {
    // The Timeline row is the last of the 3 openEditForm/handleDelete
    // pairs in the file (swipe, desktop, then Timeline).
    const lastEditIdx = source.lastIndexOf("onClick={() => openEditForm(t)}");
    const lastDeleteIdx = source.lastIndexOf("onClick={() => handleDelete(t.id)}");
    expect(lastEditIdx).toBeGreaterThan(-1);
    expect(lastDeleteIdx).toBeGreaterThan(-1);

    const editButtonEnd = source.indexOf("</button>", lastEditIdx);
    const deleteButtonEnd = source.indexOf("</button>", lastDeleteIdx);
    expect(source.slice(lastEditIdx, editButtonEnd)).toContain(
      'aria-label="Sửa giao dịch"',
    );
    expect(source.slice(lastDeleteIdx, deleteButtonEnd)).toContain(
      'aria-label="Xóa giao dịch"',
    );
  });

  it("FilterChip's remove button has a filter-specific accessible name", () => {
    const start = source.indexOf("function FilterChip({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("function LiquidityHeroCard", start);
    expect(source.slice(start, end)).toContain(
      "aria-label={`Xóa bộ lọc ${label}`}",
    );
  });

  it("export and view-mode toggle buttons have Vietnamese accessible names (previously title-only, and view-mode titles were in English)", () => {
    expect(source).toContain('aria-label="Xuất CSV"');
    expect(source).toContain('aria-label="Xem dạng bảng"');
    expect(source).toContain('aria-label="Xem dạng dòng thời gian"');
    // The view-mode buttons are genuine toggles — aria-pressed reflects
    // which one is active.
    expect(source).toContain("aria-pressed={viewMode === \"table\"}");
    expect(source).toContain("aria-pressed={viewMode === \"timeline\"}");
  });

  it("bulk-selection close button and select-all checkbox have accessible names", () => {
    expect(source).toContain('aria-label="Bỏ chọn tất cả"');
    expect(source).toContain(
      'aria-label="Chọn tất cả giao dịch đã lọc (mọi trang)"',
    );
  });

  it("no positive tabIndex was introduced anywhere in the file", () => {
    expect(source).not.toMatch(/tabIndex=\{[1-9]/);
  });
});

describe("CRUD modal dialog semantics (F-12)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("the modal panel exposes role=dialog, aria-modal=true, and is labelled/described by the visible heading/description", () => {
    const panelStart = source.indexOf(
      '<div\n            ref={modalPanelRef}',
    );
    expect(panelStart).toBeGreaterThan(-1);
    const panelTagEnd = source.indexOf(">", panelStart);
    const panelOpenTag = source.slice(panelStart, panelTagEnd + 1);

    expect(panelOpenTag).toContain('role="dialog"');
    expect(panelOpenTag).toContain('aria-modal="true"');
    expect(panelOpenTag).toContain(
      'aria-labelledby="transaction-dialog-title"',
    );
    expect(panelOpenTag).toContain(
      'aria-describedby="transaction-dialog-description"',
    );
  });

  it("the title id is actually attached to the visible <h2> heading, and the description id to the visible paragraph beneath it", () => {
    expect(source).toContain('id="transaction-dialog-title"');
    expect(source).toContain('id="transaction-dialog-description"');
    const titleIdx = source.indexOf('id="transaction-dialog-title"');
    const h2Region = source.slice(Math.max(0, titleIdx - 60), titleIdx + 20);
    expect(h2Region).toContain("<h2");

    const descIdx = source.indexOf('id="transaction-dialog-description"');
    const pRegion = source.slice(Math.max(0, descIdx - 60), descIdx + 20);
    expect(pRegion).toContain("<p");
  });

  it("Escape is installed only while the modal is open and routes through the SAME canonical close path as Cancel/X (setIsFormOpen(false)) — no duplicated cleanup logic", () => {
    const effectStart = source.indexOf(
      "useEffect(() => {\n    if (!isFormOpen) return;",
    );
    expect(effectStart).toBeGreaterThan(-1);
    const effectEnd = source.indexOf("}, [isFormOpen]);", effectStart);
    expect(effectEnd).toBeGreaterThan(effectStart);
    const effectSource = source.slice(effectStart, effectEnd);

    expect(effectSource).toContain('if (event.key !== "Escape") return;');
    expect(effectSource).toContain("setIsFormOpen(false);");
    // The exact same call the visible Cancel/X buttons already use —
    // proven by counting total occurrences across the whole modal.
    const closeCallCount =
      source.split("setIsFormOpen(false)").length - 1;
    expect(closeCallCount).toBeGreaterThanOrEqual(3); // X button, Cancel button, Escape handler
  });

  it("Escape does not special-case isSubmitting — it must behave exactly like the always-enabled Cancel/X buttons (TXN-FLOW-1's session token, not a disabled Close, is what protects a stale completion)", () => {
    const effectStart = source.indexOf(
      "useEffect(() => {\n    if (!isFormOpen) return;",
    );
    const effectEnd = source.indexOf("}, [isFormOpen]);", effectStart);
    const effectSource = source.slice(effectStart, effectEnd);
    expect(effectSource).not.toContain("isSubmitting");
  });

  it("initial focus lands on the dialog panel container (tabIndex={-1}), not a form field — avoids popping the mobile keyboard open on every Create/Edit open", () => {
    const panelStart = source.indexOf(
      '<div\n            ref={modalPanelRef}',
    );
    const panelTagEnd = source.indexOf(">", panelStart);
    const panelOpenTag = source.slice(panelStart, panelTagEnd + 1);
    expect(panelOpenTag).toContain("tabIndex={-1}");
    expect(source).toContain("modalPanelRef.current?.focus();");
  });

  it("focus restoration checks the trigger element is still in the document before restoring (a reload can remove/reorder rows)", () => {
    expect(source).toContain("document.contains(trigger)");
  });

  it("no useEffect was added to synchronize formSessionRef/submittingSessionRef (TXN-FLOW-1) — the new focus/Escape effect is a separate, independent concern keyed only on isFormOpen", () => {
    const effectStart = source.indexOf(
      "useEffect(() => {\n    if (!isFormOpen) return;",
    );
    const effectEnd = source.indexOf("}, [isFormOpen]);", effectStart);
    const effectSource = source.slice(effectStart, effectEnd);
    expect(effectSource).not.toContain("formSessionRef");
    expect(effectSource).not.toContain("submittingSessionRef");
  });
});
