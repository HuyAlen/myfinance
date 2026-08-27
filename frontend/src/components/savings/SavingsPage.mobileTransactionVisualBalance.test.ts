import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1.3 — Mobile Transaction Screen Visual Balance.
 *
 * Keeps the full-screen iPhone transaction flow from 1.2, while reducing
 * danger semantics for ordinary withdrawals and strengthening visual hierarchy.
 */
describe("SavingsPage balances the mobile money-movement screen", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const movementStart = source.indexOf(
    "/* SAVINGS-UX-1: focused money-movement sheet.",
  );
  const historyStart = source.indexOf(
    "/* SAVINGS-UX-1: history is a read-only sheet, not part of edit.",
  );
  const movementSource = source.slice(movementStart, historyStart);

  it("keeps the 1.2 full-screen mobile architecture", () => {
    expect(movementSource).toContain(
      "relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white",
    );
    expect(movementSource).toContain(
      "min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(movementSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("uses a soft body surface so vertical breathing room looks intentional", () => {
    expect(movementSource).toContain(
      "bg-[#F8FBFF] px-3 py-3 [-webkit-overflow-scrolling:touch] sm:bg-white",
    );
  });

  it("treats withdraw as a normal blue movement and reserves rose for settlement", () => {
    expect(movementSource).toContain(
      'type === "withdraw"\n                            ? "bg-blue-50 text-[#2F80ED] ring-1 ring-inset ring-blue-200"',
    );
    expect(movementSource).toContain(
      '"bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200"',
    );
    expect(movementSource).toContain(
      'type === "withdraw"\n                      ? "bg-[#2F80ED] shadow-blue-100 hover:bg-[#2676DE]"',
    );
    expect(movementSource).toContain(
      '"bg-rose-600 shadow-rose-100 hover:bg-rose-700"',
    );
  });

  it("keeps the segmented control compact and avoids wrapping its labels", () => {
    expect(movementSource).toContain(
      "min-h-10 min-w-0 items-center justify-center",
    );
    expect(movementSource).toContain("font-bold whitespace-nowrap");
  });

  it("strengthens transaction field labels without returning to harsh black", () => {
    expect(movementSource).toContain(
      "font-bold uppercase tracking-wide text-[#64748B]",
    );
    expect(movementSource).toContain(
      "text-base font-semibold text-[#4A6783]",
    );
  });

  it("promotes the post-transaction impact summary with dynamic action context and deltas", () => {
    expect(movementSource).toContain('"Sau khi nạp"');
    expect(movementSource).toContain('"Sau khi rút"');
    expect(movementSource).toContain('"Sau khi tất toán"');
    expect(movementSource).toContain("transactionPreviewAmount");
    expect(movementSource).toContain("transactionSavingBalanceAfter");
    expect(movementSource).toContain("transactionWalletBalanceAfter");
    expect(movementSource).toContain(
      'transactionForm.type === "deposit" ? "Ví nguồn" : "Ví nhận"',
    );
  });

  it("keeps the primary mobile CTA on one line with concise action-specific copy", () => {
    expect(movementSource).toContain(
      '<span className="whitespace-nowrap">',
    );
    expect(movementSource).toContain('"Xác nhận nạp"');
    expect(movementSource).toContain('"Xác nhận rút"');
    expect(movementSource).toContain('"Xác nhận tất toán"');
    expect(movementSource).toContain(
      '<span className="hidden sm:inline-flex">',
    );
  });

  it("does not alter authoritative settlement behavior", () => {
    expect(movementSource).toContain(
      'readOnly={transactionForm.type === "settlement"}',
    );
    expect(movementSource).toContain("Dùng toàn bộ số dư hiện tại.");
    expect(source).toContain(
      'transactionForm.type === "settlement" && transactionAmountPreview <= 0',
    );
  });
});
