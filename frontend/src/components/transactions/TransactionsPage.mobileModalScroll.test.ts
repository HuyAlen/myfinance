import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-MOBILE-1 — Mobile Modal Scroll Safety (F-6).
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * The Transactions Page Full Audit found the Create/Edit modal's
 * scrollable body used `overflow-hidden` at the base (mobile) breakpoint
 * and only switched to `overflow-y-auto` at `sm:` and above. Combined with
 * the modal panel's fixed `h-dvh` height, a sticky header, a sticky
 * footer, and the mobile single-column field layout, form content taller
 * than the available body height (extra transfer fields, the recurring
 * toggle, a long SaveError message, or simply a shrunk viewport with the
 * on-screen keyboard open) could be clipped and permanently unreachable
 * below `sm` — no way to scroll to it.
 */
describe("TransactionsPage Create/Edit modal body scrolls on mobile (TXN-MOBILE-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const formStart = source.indexOf('<form\n              id="transaction-form"');
  const formTagEnd = source.indexOf(">", formStart);
  const formOpenTag = source.slice(formStart, formTagEnd + 1);

  it("locates the shared Create/Edit form element", () => {
    expect(formStart).toBeGreaterThan(-1);
    expect(formTagEnd).toBeGreaterThan(formStart);
  });

  it("the form body scrolls at the BASE (mobile) breakpoint — not gated behind sm:", () => {
    expect(formOpenTag).toContain("overflow-y-auto");
    // The unsafe pre-fix pattern must never come back: a bare, ungated
    // overflow-hidden on this element, deferring scrolling to sm: only.
    expect(formOpenTag).not.toContain("overflow-hidden");
    expect(formOpenTag).not.toContain("sm:overflow-y-auto");
  });

  it("keeps the flex-sizing classes required for the parent flex column to actually constrain this region's height", () => {
    expect(formOpenTag).toContain("min-h-0");
    expect(formOpenTag).toContain("flex-1");
  });

  it("does not touch the modal panel's own outer overflow-hidden (a different, legitimate boundary clip, not the scroll bug) — TXN-UX-1 added dialog-semantics attributes to this same element, so the class list is checked independent of attribute order", () => {
    const normalized = source.replace(/\s+/g, " ");
    expect(normalized).toContain(
      'className="flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl"',
    );
  });

  it("header and footer remain shrink-0 (pinned, outside the scrollable body) — structure unchanged", () => {
    const modalStart = source.indexOf("{/* ── CRUD Form Modal");
    expect(modalStart).toBeGreaterThan(-1);
    const modalSection = source.slice(modalStart, formStart);
    expect(modalSection).toContain("{/* Modal header */}");
    expect(modalSection).toContain("shrink-0 border-b border-slate-100");

    const footerStart = source.indexOf(
      'className="shrink-0 border-t border-slate-100 bg-white/95',
    );
    expect(footerStart).toBeGreaterThan(formTagEnd);
  });

  it("SaveError renders inside the scrollable form, not in the pinned footer — a failed save's message can be scrolled to", () => {
    const formEnd = source.indexOf("</form>", formStart);
    const saveErrorIdx = source.indexOf("<SaveError", formStart);
    expect(formEnd).toBeGreaterThan(formStart);
    expect(saveErrorIdx).toBeGreaterThan(formStart);
    expect(saveErrorIdx).toBeLessThan(formEnd);
  });
});
