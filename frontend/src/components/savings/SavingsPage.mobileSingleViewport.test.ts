import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1.2 — Mobile Full-Screen Action Flows.
 *
 * Source-inspection contract: edit/create and money-movement actions use the
 * entire real dynamic viewport on mobile Safari instead of rendering as
 * floating/bottom-sheet popups. Desktop keeps the existing modal treatment.
 * The body may still scroll as a keyboard/small-viewport fallback, while
 * header and primary actions remain fixed inside the full-screen surface.
 */
describe("SavingsPage uses full-screen mobile action surfaces", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const editStart = source.indexOf(
    "/* SAVINGS-UX-1: create/edit metadata is intentionally separate",
  );
  const movementStart = source.indexOf(
    "/* SAVINGS-UX-1: focused money-movement sheet.",
  );
  const historyStart = source.indexOf(
    "/* SAVINGS-UX-1: history is a read-only sheet, not part of edit.",
  );

  const editSource = source.slice(editStart, movementStart);
  const movementSource = source.slice(movementStart, historyStart);

  it("renders edit/create as a true full-screen mobile surface, with modal chrome only at sm+", () => {
    expect(editSource).toContain(
      "fixed inset-0 z-50 bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-950/45",
    );
    expect(editSource).toContain(
      "relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white",
    );
    expect(editSource).toContain(
      "sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl sm:rounded-4xl",
    );
    expect(editSource).not.toContain("rounded-[28px]");
    expect(editSource).not.toContain(
      "flex items-end justify-center bg-slate-950/45 px-2",
    );
  });

  it("renders deposit/withdraw/settlement as a true full-screen mobile surface instead of the old popup", () => {
    expect(movementSource).toContain(
      "fixed inset-0 z-110 bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-950/45",
    );
    expect(movementSource).toContain(
      "relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white",
    );
    expect(movementSource).toContain(
      "sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl",
    );
    expect(movementSource).not.toContain("rounded-[28px]");
    expect(movementSource).not.toContain("max-h-[92dvh]");
  });

  it("removes the invisible outside-click backdrop from mobile focus order while preserving desktop dismissal", () => {
    expect(editSource).toContain(
      'aria-label="Đóng form khoản tiết kiệm"\n            className="absolute inset-0 hidden cursor-default sm:block"',
    );
    expect(movementSource).toContain(
      'aria-label="Đóng giao dịch tiết kiệm"\n            className="absolute inset-0 hidden cursor-default sm:block"',
    );
  });

  it("uses iPhone safe areas for top chrome and bottom actions", () => {
    expect(editSource).toContain(
      "pt-[calc(0.75rem+env(safe-area-inset-top))]",
    );
    expect(editSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
    expect(movementSource).toContain(
      "pt-[calc(0.75rem+env(safe-area-inset-top))]",
    );
    expect(movementSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("keeps only the body scrollable as a keyboard/small-height fallback", () => {
    expect(editSource).toContain(
      "min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(editSource).toContain("grid shrink-0 grid-cols-2");
    expect(movementSource).toContain(
      "min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(movementSource).toContain("grid shrink-0 grid-cols-2");
  });

  it("retains 16px form text on mobile to avoid Safari focus zoom", () => {
    expect(editSource).toContain("text-base font-semibold");
    expect(movementSource).toContain("text-base font-semibold");
  });

  it("keeps the focused money-movement controls and before/after balances intact", () => {
    expect(movementSource).toContain(
      "mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5",
    );
    expect(movementSource).toContain("Số tiền");
    expect(movementSource).toContain("Ví nguồn");
    expect(movementSource).toContain("Ví nhận");
    expect(movementSource).toContain("Ghi chú");
    expect(movementSource).toContain("Sau giao dịch");
    expect(movementSource).toContain("transactionSavingBalanceAfter");
    expect(movementSource).toContain("transactionWalletBalanceAfter");
  });

  it("keeps settlement authoritative", () => {
    expect(movementSource).toContain(
      'readOnly={transactionForm.type === "settlement"}',
    );
    expect(movementSource).toContain("Dùng toàn bộ số dư hiện tại.");
    expect(movementSource).toContain(
      "formatCurrencyInputFromNumber(selectedSaving.balance)",
    );
  });
});
