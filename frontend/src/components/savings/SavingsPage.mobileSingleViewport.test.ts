import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1.1 — Mobile Single-Viewport Action Sheets.
 *
 * Source-inspection contract: edit/create and money-movement sheets must stay
 * bounded by the real dynamic viewport on mobile Safari, use safe-area-aware
 * chrome, and keep their primary controls compact enough to fit in one
 * iPhone web viewport. Internal scrolling remains only as a fallback for
 * unusually small viewports, keyboard overlap, or validation errors.
 */
describe("SavingsPage mobile action sheets stay within one dynamic viewport", () => {
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

  it("bounds the edit/create sheet to the padded dynamic viewport instead of forcing h-dvh", () => {
    expect(editSource).toContain(
      "pt-[calc(0.5rem+env(safe-area-inset-top))]",
    );
    expect(editSource).toContain("max-h-full w-full max-w-xl");
    expect(editSource).not.toContain("flex h-dvh w-full");
    expect(editSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("keeps edit metadata dense on mobile while retaining 16px form text to avoid iOS focus zoom", () => {
    expect(editSource).toContain(
      "mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5",
    );
    expect(editSource).toContain('className="col-span-2"');
    expect(editSource).toContain("min-h-10");
    expect(editSource).toContain("text-base font-semibold");
    expect(editSource).toContain("sm:min-h-11");
  });

  it("reduces non-essential edit chrome on mobile but keeps it available on larger screens", () => {
    expect(editSource).toContain(
      'className="hidden text-[11px] font-black uppercase',
    );
    expect(editSource).toContain(
      'className="mt-0.5 hidden text-sm font-medium text-slate-500 sm:block"',
    );
    expect(editSource).toContain("Chỉ chỉnh thông tin");
  });

  it("keeps body scrolling only as a fallback while header and actions remain fixed inside the sheet", () => {
    expect(editSource).toContain(
      "flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(editSource).toContain("grid shrink-0 grid-cols-2");
    expect(movementSource).toContain(
      "flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(movementSource).toContain("grid shrink-0 grid-cols-2");
  });

  it("replaces the old 92dvh transaction cap with a sheet bounded to the real available viewport", () => {
    expect(movementSource).toContain(
      "pt-[calc(0.5rem+env(safe-area-inset-top))]",
    );
    expect(movementSource).toContain("max-h-full w-full max-w-lg");
    expect(movementSource).not.toContain("max-h-[92dvh]");
    expect(movementSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("compresses the money-movement flow into one mobile frame without removing required controls", () => {
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

  it("moves current saving balance into the compact transaction header instead of spending a full card row", () => {
    expect(movementSource).toContain(
      "{formatCurrency(selectedSaving.balance)}",
    );
    expect(movementSource).toContain(
      '<span className="truncate">{selectedSaving.name}</span>',
    );
    expect(movementSource).not.toContain("Tiết kiệm hiện tại");
  });

  it("keeps settlement authoritative and compact", () => {
    expect(movementSource).toContain(
      'readOnly={transactionForm.type === "settlement"}',
    );
    expect(movementSource).toContain("Dùng toàn bộ số dư hiện tại.");
    expect(movementSource).toContain(
      "formatCurrencyInputFromNumber(selectedSaving.balance)",
    );
  });
});
